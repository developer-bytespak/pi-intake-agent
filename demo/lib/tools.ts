/**
 * The eight things the intake agent can do, and nothing else.
 *
 * Two rules hold throughout:
 *   1. A tool returns the smallest thing the agent needs to speak. Never a
 *      case value, never a fee, never another client's details, never legal
 *      advice.
 *   2. Every call writes a pipeline step and a call event, success or failure,
 *      because the retainer is built on reviewing those rows, and because an
 *      intake manager will one day be asked to prove what was said.
 *
 * The order the agent works in: classify the matter, qualify it, check for a
 * conflict, create the contact and the matter, capture text consent, send
 * the retainer, task the attorney. Qualification and the conflict check run
 * before anything is created, so a declined lead never becomes a matter.
 */

import {
  FIRM,
  QUALIFYING_QUESTIONS,
  QUALIFICATION_LABEL,
  SCRIPTS,
  SOURCE_LABEL,
  caseTypeById,
  classify,
  isAfterHours,
  onCallIntake,
  qualify,
  reviewingAttorney,
  staffById,
  type LeadSource,
  type Qualification,
} from "./config";
import { faultFrom, parseIncidentDate, yesNo } from "./dates";
import { q } from "./db";
import { lawmatics } from "./lawmatics";
import { retainerLink, sendMessage } from "./messages";
import {
  logCallEvent,
  logConsent,
  logPipeline,
  markLeadContacted,
  markMatter,
  setCallQualification,
  touchCall,
} from "./ops";
import type { ToolRequest } from "./retell";

export type ToolResponse = Record<string, unknown>;

function leadIdOf(req: ToolRequest): number | null {
  const raw = req.call.metadata?.lead_id ?? req.call.retell_llm_dynamic_variables?.lead_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sourceOf(req: ToolRequest): LeadSource {
  if (leadIdOf(req)) return "web_form";
  return isAfterHours() ? "phone_after_hours" : "phone";
}

const SPEAK_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });

/** ---------------------------------------------------------------- 1 */

async function classifyIntake(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const description = String(req.args.description ?? "");
  const type = classify(description);

  // The disclosures are in the opening line, which runs before any tool. The
  // first tool call is the earliest moment the server can record that it
  // happened, and it records the script version so an auditor can read the
  // exact words later.
  await logConsent({ callId: req.call.call_id, kind: "recording_disclosure", granted: true, phone: req.call.from_number });
  await logConsent({ callId: req.call.call_id, kind: "ai_disclosure", granted: true, phone: req.call.from_number });
  await logPipeline(req.call.call_id, "disclosures_made", "ok", `recording and AI disclosure, script ${SCRIPTS.version}`);

  await logPipeline(
    req.call.call_id,
    "intake_classified",
    type.accepted ? "ok" : "warn",
    type.accepted ? type.name : `${type.name}, referred out`,
    Date.now() - started,
  );
  await logCallEvent({
    callId: req.call.call_id,
    action: "classify",
    outcome: type.id,
    detail: { accepted: type.accepted },
  });

  return {
    case_type: type.id,
    case_name: type.name,
    accepted: type.accepted,
    questions: QUALIFYING_QUESTIONS[type.id] ?? QUALIFYING_QUESTIONS.other,
    say: type.accepted
      ? `I'm sorry that happened. It sounds like ${type.spoken}, and that is something we help with.`
      : `I'm sorry that happened. ${type.name} cases are handled by a partner firm we work with rather than by us, so let me take your details and make sure you get to the right people.`,
  };
}

/** ---------------------------------------------------------------- 2 */

async function qualifyLead(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const type = caseTypeById(String(req.args.case_type ?? "other")) ?? caseTypeById("other")!;
  const parsed = parseIncidentDate(req.args.incident_date);
  const treated = yesNo(req.args.treatment);
  const fault = faultFrom(req.args.fault);
  const policeRaw = String(req.args.police_report ?? "").toLowerCase();
  const policeReport =
    !policeRaw || policeRaw === "unknown" ? null : policeRaw === "yes" || policeRaw === "true" ? true : policeRaw === "no" || policeRaw === "false" ? false : /yes|report|came|they did/.test(policeRaw) && !/^no\b/.test(policeRaw);
  const priorCounsel = yesNo(req.args.prior_counsel);
  const incidentState = String(req.args.incident_state ?? "").trim() || null;

  // Half an intake is not scored. The agent gets told what is missing and
  // asks, which is what a paralegal would do rather than guess.
  const missing: string[] = [];
  if (!parsed) missing.push(QUALIFYING_QUESTIONS[type.id]?.[0] ?? "When did it happen?");
  if (treated === "unknown") missing.push("Were you hurt, and have you seen a doctor or been to the emergency room?");
  if (fault === "unknown" && type.accepted) missing.push("Who do you think was at fault?");
  if (priorCounsel === "unknown") missing.push("Have you already spoken to a lawyer about this?");
  const [{ n: asked }] = await q<{ n: number }>(
    `select count(*)::int as n from pipeline_events where call_id = $1 and step = 'lead_qualified' and detail like 'waiting on%'`,
    [req.call.call_id],
  );
  // Twice is enough. A caller who will not answer gets an attorney callback
  // on what we have rather than the same question a sixth time.
  if (missing.length && type.accepted && asked < 2) {
    await logPipeline(req.call.call_id, "lead_qualified", "running", `waiting on ${missing.length} answer${missing.length === 1 ? "" : "s"}`, Date.now() - started);
    return {
      status: "need_answers",
      questions: missing,
      say: missing.length === 1 ? "One more thing." : "A couple more things before I can go further.",
    };
  }

  const result: Qualification = qualify({
    caseType: type,
    incidentDate: parsed?.date ?? null,
    treated,
    fault,
    policeReport,
    priorCounsel,
    incidentState,
  });

  await setCallQualification(req.call.call_id, result.status);
  await logPipeline(
    req.call.call_id,
    "lead_qualified",
    result.status === "qualified" ? "ok" : result.status === "review" ? "warn" : "warn",
    `${QUALIFICATION_LABEL[result.status]}, score ${result.score}` +
      (result.flags.length ? `, ${result.flags.join(", ").toLowerCase()}` : ""),
    Date.now() - started,
  );
  await logCallEvent({
    callId: req.call.call_id,
    action: "qualify",
    outcome: result.status,
    detail: {
      case_type: type.id,
      answers: String(req.args.answers ?? "").slice(0, 300) || null,
      score: result.score,
      flags: result.flags,
      days_to_deadline: result.daysToDeadline,
      incident_date: parsed?.iso ?? null,
      date_precision: parsed?.precision ?? null,
    },
  });

  const when = parsed ? SPEAK_DATE.format(parsed.date) : "the date you gave me";
  let say: string;
  if (result.status === "qualified") {
    say = "Thank you. Based on what you've told me, this is a case our attorneys will want to look at.";
  } else if (result.status === "review") {
    say = "Thank you. There are a couple of things an attorney needs to weigh, so I'll get this in front of one rather than decide it myself.";
  } else if (result.status === "referral") {
    say = "Thank you. This is the kind of case our partner firm handles, and I'll pass your details to them.";
  } else if (result.flags.includes("Represented")) {
    say = "Thank you for telling me. Since you already have a lawyer on this, we can't take it on as well, but your lawyer can reach us if they want to talk.";
  } else if (result.flags.includes("Deadline passed")) {
    say = `I'm sorry to say this. In Florida a claim like this has to be filed within ${type.deadlineYears} years, and ${when} is past that, so we would not be able to help. I can still have an attorney call you if you'd like a second opinion on the date.`;
  } else {
    say = "Thank you. From what you've described there isn't another party we could bring a claim against, so this isn't something we can take on. I'm sorry.";
  }

  return {
    status: result.status,
    score: result.score,
    flags: result.flags,
    reasons: result.reasons,
    days_to_deadline: result.daysToDeadline,
    incident_date: parsed?.iso ?? null,
    treated,
    fault,
    police_report: policeReport,
    prior_counsel: priorCounsel,
    say,
  };
}

/** ---------------------------------------------------------------- 3 */

async function conflictCheck(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const adverse = String(req.args.adverse_party ?? "").trim();
  const callerName = `${String(req.args.first_name ?? "").trim()} ${String(req.args.last_name ?? "").trim()}`.trim();

  const checks = await Promise.all([
    adverse ? lawmatics().conflictCheck(adverse) : Promise.resolve({ hit: false as const }),
    callerName ? lawmatics().conflictCheck(callerName) : Promise.resolve({ hit: false as const }),
  ]);
  const adverseHit = checks[0];
  const callerHit = checks[1];

  // The firm already has a file with this adverse party as *its client*, or
  // with the caller on the other side. Either way a person decides, not the
  // agent, and the agent says nothing about the other file.
  const conflict =
    (adverseHit.hit && adverseHit.role === "client") || (callerHit.hit && callerHit.role === "adverse");

  await logPipeline(
    req.call.call_id,
    "conflict_checked",
    conflict ? "error" : "ok",
    conflict ? "possible conflict, held for a person" : adverse ? `clear against ${adverse}` : "clear, no adverse party named",
    Date.now() - started,
  );
  await logCallEvent({
    callId: req.call.call_id,
    action: "conflict_check",
    outcome: conflict ? "hit" : "clear",
    detail: { adverse_named: Boolean(adverse) },
  });

  if (conflict) {
    await lawmatics().createTask({
      matterId: null,
      callId: req.call.call_id,
      kind: "conflict_review",
      assignedTo: reviewingAttorney().id,
      dueAt: new Date(Date.now() + 2 * 60 * 60_000),
      priority: "high",
      note: `Possible conflict on intake. Caller ${callerName || "(name not given)"}, adverse party ${adverse || "(not given)"}. Review before any contact.`,
    });
    return {
      status: "hit",
      say: "Before I go any further, one of our attorneys needs to review something on our side first. I'm going to take your details and have them call you directly, and I'm not able to discuss the reason on this call.",
    };
  }

  return { status: "clear", say: "" };
}

/** ---------------------------------------------------------------- 4 */

async function createMatter(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const gateway = lawmatics();
  const source = sourceOf(req);
  const leadId = leadIdOf(req);

  const firstName = String(req.args.first_name ?? "").trim();
  const lastName = String(req.args.last_name ?? "").trim();
  const phone = String(req.args.phone ?? req.call.from_number ?? "").trim();
  const email = String(req.args.email ?? "").trim() || null;
  const type = caseTypeById(String(req.args.case_type ?? "other")) ?? caseTypeById("other")!;
  const summary = String(req.args.summary ?? "").slice(0, 600);
  const qualificationStatus = String(req.args.qualification ?? "review");
  const score = Number(req.args.score ?? 0) || 0;
  const flags = Array.isArray(req.args.flags) ? req.args.flags.map(String) : [];
  const parsed = parseIncidentDate(req.args.incident_date);
  const adverse = String(req.args.adverse_party ?? "").trim() || null;

  if (!firstName || !phone) {
    await logPipeline(req.call.call_id, "contact_created", "warn", "not enough detail to create a contact");
    return { status: "need_more_detail" };
  }

  const existing = await gateway.findContactByPhone(phone);
  const contact = existing ?? (await gateway.createContact({ firstName, lastName: lastName || "(not given)", phone, email, source }));

  await logPipeline(
    req.call.call_id,
    "contact_created",
    "ok",
    existing ? `existing contact matched, ${existing.firstName}` : `new contact in ${gateway.mode === "live" ? "Lawmatics" : "the demo pipeline"}`,
    Date.now() - started,
  );
  await logCallEvent({
    callId: req.call.call_id,
    action: existing ? "contact_matched" : "contact_created",
    outcome: existing ? "existing" : "created",
    detail: { source: gateway.mode },
  });

  const stage =
    qualificationStatus === "qualified" ? "qualified" : qualificationStatus === "referral" ? "referred" : qualificationStatus === "disqualified" ? "declined" : "attorney_review";
  const assigned = stage === "qualified" || stage === "attorney_review" ? reviewingAttorney() : onCallIntake();

  const matterStarted = Date.now();
  const matter = await gateway.createMatter({
    contactId: contact.id,
    caseType: type.id,
    incidentDate: parsed?.iso ?? null,
    incidentState: String(req.args.incident_state ?? "").trim() || FIRM.state,
    summary,
    treated: String(req.args.treated ?? "unknown"),
    fault: String(req.args.fault ?? "unknown"),
    policeReport: req.args.police_report === true || req.args.police_report === "true" ? true : req.args.police_report === false ? false : null,
    priorCounsel: String(req.args.prior_counsel ?? "unknown"),
    qualification: { status: qualificationStatus, score, flags, reasons: Array.isArray(req.args.reasons) ? req.args.reasons : [] },
    score,
    stage,
    assignedTo: assigned.id,
    tags: [type.name, SOURCE_LABEL[source]],
    source,
    adverseParty: adverse,
  });

  await markMatter(req.call.call_id, matter.id, stage === "declined" || stage === "referred" ? "other" : type.id);
  if (leadId) await q(`update demo_leads set matter_id = $2 where id = $1`, [leadId, matter.id]);

  await logPipeline(
    req.call.call_id,
    "matter_created",
    "ok",
    `${matter.reference}, stage ${stage.replace(/_/g, " ")}, ${SOURCE_LABEL[source].toLowerCase()}, assigned to ${assigned.firstName}`,
    Date.now() - matterStarted,
  );
  await logCallEvent({
    callId: req.call.call_id,
    action: "matter_created",
    outcome: stage,
    detail: { matter_id: matter.id, reference: matter.reference, case_type: type.id, source },
  });

  return {
    status: "created",
    matter_id: matter.id,
    reference: matter.reference,
    stage,
    first_name: contact.firstName,
    say: `I've opened a file for you. Your reference is ${matter.reference.replace(/-/g, " ")}.`,
  };
}

/** ---------------------------------------------------------------- 5 */

async function recordSmsConsent(req: ToolRequest): Promise<ToolResponse> {
  const raw = req.args.opted_in;
  const optedIn = raw === true || raw === "true" || raw === "yes";
  const phone = String(req.args.phone ?? req.call.from_number ?? "");

  await logConsent({ callId: req.call.call_id, kind: "sms_opt_in", granted: optedIn, phone });
  await logCallEvent({
    callId: req.call.call_id,
    action: "sms_consent",
    outcome: optedIn ? "opted_in" : "declined",
    detail: { script_version: SCRIPTS.version },
  });

  return {
    status: "recorded",
    opted_in: optedIn,
    say: optedIn ? "Great, I'll text you in a moment." : "No problem, I won't text you.",
  };
}

/** ---------------------------------------------------------------- 6 */

async function sendRetainer(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const matterId = String(req.args.matter_id ?? "");
  const reference = String(req.args.reference ?? "");
  const phone = String(req.args.phone ?? req.call.from_number ?? "").trim();
  const email = String(req.args.email ?? "").trim() || null;
  const firstName = String(req.args.first_name ?? "there").trim();
  const optedIn = req.args.opted_in === true || req.args.opted_in === "true" || req.args.opted_in === "yes";

  if (!matterId) {
    await logPipeline(req.call.call_id, "retainer_sent", "warn", "no matter to attach the retainer to");
    return { status: "no_matter" };
  }

  const link = retainerLink(reference || matterId);
  const channels: string[] = [];

  if (optedIn && phone) {
    await sendMessage({
      callId: req.call.call_id,
      matterId,
      to: phone,
      label: "lead",
      channel: "sms",
      body: `${FIRM.shortName}: hi ${firstName}, your file is ${reference}. Review and sign the retainer on your phone here: ${link}. Reply STOP to opt out.`,
    });
    channels.push("text");
  }
  if (email) {
    await sendMessage({
      callId: req.call.call_id,
      matterId,
      to: email,
      label: "lead",
      channel: "email",
      subject: `${FIRM.name}: your retainer agreement, file ${reference}`,
      body: `Hi ${firstName},\n\nThank you for speaking with us. Your file reference is ${reference}. Please review and sign the retainer agreement here: ${link}\n\nAn attorney will call you shortly.\n\n${FIRM.name}\n${FIRM.mainNumber}`,
    });
    channels.push("email");
  }
  await sendMessage({
    callId: req.call.call_id,
    matterId,
    to: email ?? phone ?? "(no contact)",
    label: "lead",
    channel: "esign",
    subject: `Retainer agreement, ${reference}`,
    body: `E-sign envelope prepared for ${firstName}: contingency fee retainer, ${FIRM.name}. Link: ${link}`,
  });

  await lawmatics().setStage(matterId, "retainer_sent");

  await logPipeline(
    req.call.call_id,
    "retainer_sent",
    "ok",
    channels.length ? `e-sign link by ${channels.join(" and ")}` : "e-sign envelope prepared, no channel to send it on",
    Date.now() - started,
  );
  await logCallEvent({
    callId: req.call.call_id,
    action: "retainer_sent",
    outcome: channels.length ? "sent" : "prepared",
    detail: { matter_id: matterId, channels },
  });

  return {
    status: "sent",
    say: channels.length
      ? `I've sent the retainer agreement to you by ${channels.join(" and ")}. You can read it and sign it on your phone whenever you're ready, there's no rush tonight.`
      : "I've prepared the retainer agreement, and the attorney will bring it when they call.",
  };
}

/** ---------------------------------------------------------------- 7 */

async function scheduleCallback(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const matterId = String(req.args.matter_id ?? "") || null;
  const reference = String(req.args.reference ?? "");
  const urgency = String(req.args.urgency ?? "normal");
  const note = String(req.args.note ?? "").slice(0, 400);
  const phone = String(req.args.phone ?? req.call.from_number ?? "").trim();
  const firstName = String(req.args.first_name ?? "").trim();
  const afterHours = isAfterHours();

  const attorney = reviewingAttorney();
  const due = new Date();
  if (urgency === "today" || urgency === "urgent") due.setHours(due.getHours() + 2);
  else if (afterHours) {
    due.setDate(due.getDate() + 1);
    due.setHours(9, 0, 0, 0);
  } else due.setHours(due.getHours() + 4);

  await lawmatics().createTask({
    matterId,
    callId: req.call.call_id,
    kind: "attorney_callback",
    assignedTo: attorney.id,
    dueAt: due,
    priority: urgency === "today" || urgency === "urgent" ? "urgent" : "high",
    note: note || `Call ${firstName || "the lead"} back about ${reference || "the new intake"}.`,
  });

  // The on call intake specialist gets a text so a hot lead at night is
  // seen by a person before the morning.
  if (afterHours) {
    await sendMessage({
      callId: req.call.call_id,
      matterId,
      to: process.env.DEMO_INTAKE_NUMBER || "+18135550100",
      label: "intake",
      channel: "sms",
      body: `${FIRM.shortName} intake: new ${urgency === "today" ? "URGENT " : ""}lead ${reference || ""} from the after hours line, attorney callback due ${due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`,
    });
  }

  const dueSpoken =
    urgency === "today" || urgency === "urgent"
      ? "within the next couple of hours"
      : afterHours
        ? "first thing in the morning"
        : "later today";

  await logPipeline(
    req.call.call_id,
    "attorney_tasked",
    "ok",
    `callback task for ${attorney.firstName}, due ${dueSpoken}${afterHours ? `, ${onCallIntake().firstName} texted` : ""}`,
    Date.now() - started,
  );
  await logCallEvent({
    callId: req.call.call_id,
    action: "attorney_tasked",
    outcome: urgency,
    detail: { attorney: attorney.id, due: due.toISOString() },
  });

  return {
    status: "scheduled",
    attorney: attorney.firstName,
    say: `${attorney.firstName} ${attorney.name.split(" ")[1]}, one of our attorneys, will call you ${dueSpoken}.`,
  };
}

/** ---------------------------------------------------------------- 8 */

async function confirmLead(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const phone = String(req.args.phone ?? req.call.from_number ?? "").trim();
  const firstName = String(req.args.first_name ?? "").trim();
  const reference = String(req.args.reference ?? "");
  const matterId = String(req.args.matter_id ?? "") || null;
  const optedIn = req.args.opted_in === true || req.args.opted_in === "true" || req.args.opted_in === "yes";
  const leadId = leadIdOf(req);

  if (optedIn && phone) {
    await sendMessage({
      callId: req.call.call_id,
      matterId,
      to: phone,
      label: "lead",
      channel: "sms",
      body: `${FIRM.shortName}: thanks ${firstName || ""}. Your file is ${reference}. An attorney will call from ${FIRM.mainNumber}. Reply STOP to opt out.`.replace(/\s+/g, " "),
    });
  }
  if (leadId) await markLeadContacted(leadId, { callId: req.call.call_id, status: "reached" });

  await logPipeline(
    req.call.call_id,
    "lead_confirmed",
    "ok",
    optedIn && phone ? "confirmation text with the file reference" : "confirmed on the call, no text by choice",
    Date.now() - started,
  );
  await logCallEvent({ callId: req.call.call_id, action: "confirmed", outcome: optedIn ? "text" : "voice" });

  return { status: "confirmed" };
}

/** ---------------------------------------------------------------- 9 */

/**
 * The fallback that matters more than it looks. A declined caller, a
 * referral, a failed transfer, or someone who just wants a call in the
 * morning. Without this the call ends politely and the firm never hears
 * about it.
 */
async function takeMessage(req: ToolRequest): Promise<ToolResponse> {
  const started = Date.now();
  const name = String(req.args.name ?? "").trim();
  const phone = String(req.args.phone ?? req.call.from_number ?? "").trim();
  const reason = String(req.args.reason ?? "callback").trim();
  const note = String(req.args.note ?? "").slice(0, 400);

  const kind = reason === "referral" ? "referral" : "callback";
  await lawmatics().createTask({
    matterId: null,
    callId: req.call.call_id,
    kind,
    assignedTo: onCallIntake().id,
    dueAt: new Date(Date.now() + 12 * 60 * 60_000),
    priority: "normal",
    note: `${name || "(no name)"}, ${phone || "(no number)"}. ${reason.replace(/_/g, " ")}. ${note}`.trim(),
  });

  await logPipeline(
    req.call.call_id,
    "lead_confirmed",
    "warn",
    `message taken for intake, ${reason.replace(/_/g, " ")}`,
    Date.now() - started,
  );
  await logCallEvent({ callId: req.call.call_id, action: "message_taken", outcome: reason, detail: { has_number: Boolean(phone) } });

  return {
    status: "recorded",
    say: reason === "referral"
      ? "I have your details, and our partner firm will call you."
      : "I have that, and someone from the firm will call you back.",
  };
}

const HANDLERS: Record<string, (req: ToolRequest) => Promise<ToolResponse>> = {
  classify_intake: classifyIntake,
  qualify_lead: qualifyLead,
  conflict_check: conflictCheck,
  create_matter: createMatter,
  record_sms_consent: recordSmsConsent,
  send_retainer: sendRetainer,
  schedule_callback: scheduleCallback,
  confirm_lead: confirmLead,
  take_message: takeMessage,
};

export function knownTools(): string[] {
  return Object.keys(HANDLERS);
}

export async function runTool(req: ToolRequest): Promise<ToolResponse> {
  const leadId = leadIdOf(req);
  await touchCall(req.call.call_id, {
    channel: leadId ? "outbound" : req.call.from_number ? "phone" : "web",
    fromNumber: req.call.from_number,
    afterHours: isAfterHours(),
    leadId,
  });

  const handler = HANDLERS[req.name];
  if (!handler) {
    await logPipeline(req.call.call_id, "tool_unknown", "error", req.name);
    return { status: "unknown_function" };
  }

  try {
    return await handler(req);
  } catch (err) {
    await logPipeline(req.call.call_id, req.name, "error", err instanceof Error ? err.message : "unknown error");
    await logCallEvent({ callId: req.call.call_id, action: req.name, outcome: "error" });
    return { status: "error", say: "I could not reach our system just now" };
  }
}

export { staffById };
