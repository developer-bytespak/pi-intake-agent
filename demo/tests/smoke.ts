/**
 * End to end check of the intake pipeline without Next.js, Retell or a
 * database server. Runs against PGlite, so it works on a clean machine.
 *
 *   npx tsx tests/smoke.ts
 *
 * It walks the strong car accident lead the way a real call would, then the
 * deadline passed lead, the represented lead, the conflict hit and the
 * referral, and prints what the demo panels will show.
 */

process.env.DEMO_FORCE_AFTER_HOURS = "true";

import { rm } from "node:fs/promises";
import { q, resetDemo } from "../lib/db";
import { DEMO_TENANT_ID, addMembership, createTenant, getTenant, membershipsForUser, tenantByAgentId, withTenant } from "../lib/tenancy";
import { runTool } from "../lib/tools";
import { lawmatics } from "../lib/lawmatics";
import { parseIncidentDate, yesNo, faultFrom } from "../lib/dates";
import type { ToolRequest } from "../lib/retell";

function call(callId: string, name: string, args: Record<string, unknown>, fromNumber?: string): ToolRequest {
  return { name, call: { call_id: callId, from_number: fromNumber }, args };
}

function heading(text: string) {
  console.log(`\n=== ${text} ===`);
}

function expect(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

async function main() {
  await rm(process.env.PGLITE_DIR || "./.pgdata", { recursive: true, force: true });

  heading("date and answer parsing");
  const now = new Date(2026, 8, 21, 12);
  expect(parseIncidentDate("last Tuesday", now)?.iso === "2026-09-15", "last Tuesday from a Monday is the 15th");
  expect(parseIncidentDate("three weeks ago", now)?.iso === "2026-08-31", "three weeks ago");
  expect(parseIncidentDate("March 3rd 2024", now)?.iso === "2024-03-03", "spoken month and day");
  expect(parseIncidentDate("11/30/2025", now)?.iso === "2025-11-30", "US slashes");
  expect(parseIncidentDate("2023-06-01", now)?.iso === "2023-06-01", "iso passes through");
  expect(yesNo("yeah, I went to the ER that night") === "yes", "ER counts as treated");
  expect(yesNo("no, not yet") === "no", "not yet is no");
  expect(faultFrom("the other driver ran a red light") === "other", "other driver at fault");
  expect(faultFrom("honestly it was my fault, I rear ended him") === "self", "self at fault");
  console.log("ok");

  heading("seed");
  await resetDemo();
  const demo = await getTenant(DEMO_TENANT_ID);
  if (!demo) throw new Error("bootstrap did not create the demo tenant");
  expect(await tenantByAgentId(undefined), "a call without an agent id must fall back to the demo tenant");
  expect(!(await tenantByAgentId("agent_nobody_owns")), "an unknown agent must not resolve to any tenant");
  await withTenant(demo, scenes);
  await isolation();
}

/**
 * A second firm must never see the demo's contacts or matters, and the demo
 * must never see theirs. This is the one property tenancy exists for.
 */
async function isolation() {
  heading("tenant isolation");
  const acme = await createTenant({ name: "Acme Injury Law", retellAgentId: "agent_acme_test" });
  expect((await tenantByAgentId("agent_acme_test"))?.id === acme.id, "the agent id must resolve to the tenant that owns it");

  const [demoContact] = await q<{ phone: string; last_name: string }>(`select phone, last_name from demo_contacts where tenant_id = $1 limit 1`, [DEMO_TENANT_ID]);
  const [before] = await q<{ n: number }>(`select count(*)::int as n from demo_calls where tenant_id = $1`, [DEMO_TENANT_ID]);

  await withTenant(acme, async () => {
    expect((await lawmatics().findContactByPhone(demoContact.phone)) === null, "a demo contact leaked into another tenant");
    expect((await lawmatics().listMatters(20)).length === 0, "Acme should start with no matters");
    const conflict = await lawmatics().conflictCheck(`${demoContact.last_name}`);
    expect(conflict.hit === false, "a demo party must not trip Acme's conflict check");
    await runTool(call("call_acme_001", "classify_intake", { description: "I was rear ended on the interstate last week" }, "+18135550999"));
  });

  const [after] = await q<{ n: number }>(`select count(*)::int as n from demo_calls where tenant_id = $1`, [DEMO_TENANT_ID]);
  expect(after.n === before.n, "an Acme call was counted against the demo tenant");
  const [acmeCalls] = await q<{ n: number }>(`select count(*)::int as n from demo_calls where tenant_id = $1`, [acme.id]);
  expect(acmeCalls.n === 1, "Acme should own exactly one call");

  await addMembership({ tenantId: acme.id, email: "Owner@Acme.com", role: "owner" });
  const mine = await membershipsForUser({ id: "user_clerk_123", email: "owner@acme.com" });
  expect(mine.length === 1 && mine[0].clerk_user_id === "user_clerk_123" && mine[0].invite_status === "accepted", "first sign-in must claim the membership created for that email");
  expect((await membershipsForUser({ id: "user_clerk_999", email: "nobody@acme.com" })).length === 0, "an uninvited email must not get a workspace");
  console.log("isolation and invitation binding hold");
  console.log("\nAll checks passed.\n");
}

async function scenes() {
  const [counts] = await q<{ contacts: number; matters: number; parties: number }>(
    `select (select count(*)::int from demo_contacts) as contacts,
            (select count(*)::int from demo_matters)  as matters,
            (select count(*)::int from demo_parties)  as parties`,
  );
  console.log(`gateway: ${lawmatics().mode}, contacts ${counts.contacts}, matters ${counts.matters}, parties ${counts.parties}`);
  expect(counts.contacts > 0 && counts.matters > 0, "seed produced no data");

  // ---------------------------------------------------------------- scene 1
  heading("scene one, strong car accident lead, after hours");
  const C1 = "call_auto_001";
  const PHONE = "+18135550909";

  const cls = (await runTool(call(C1, "classify_intake", { description: "I was rear ended on I-275 last Tuesday and my neck and back are killing me" }, PHONE))) as {
    case_type: string; accepted: boolean; questions: string[];
  };
  console.log("classified:", cls.case_type, "| questions:", cls.questions.length);
  expect(cls.case_type === "auto" && cls.accepted, "a rear end collision must classify as an accepted auto case");

  const qual = (await runTool(
    call(C1, "qualify_lead", {
      case_type: "auto",
      incident_date: "last Tuesday",
      treatment: "yes, I went to the ER that night",
      fault: "the other driver, he got a ticket",
      police_report: "yes",
      prior_counsel: "no",
      incident_state: "FL",
    }, PHONE),
  )) as { status: string; score: number; flags: string[] };
  console.log("qualified:", qual.status, "score", qual.score, qual.flags);
  expect(qual.status === "qualified", `expected qualified, got ${qual.status}`);
  expect(qual.score >= 70, "a treated, other party at fault, police report lead must score high");

  const conflict = (await runTool(call(C1, "conflict_check", { adverse_party: "Sofia Alvarez", first_name: "Jordan", last_name: "Reyes" }, PHONE))) as { status: string };
  console.log("conflict:", conflict.status);
  expect(conflict.status === "clear", "an unknown adverse party must be clear");

  const matter = (await runTool(
    call(C1, "create_matter", {
      first_name: "Jordan", last_name: "Reyes", phone: PHONE, email: "jordan@example.com",
      case_type: "auto", incident_date: "last Tuesday", summary: "Rear ended on I-275, neck and back, ER same night.",
      qualification: qual.status, score: qual.score, flags: qual.flags, treated: "yes", fault: "other", police_report: true, prior_counsel: "no",
      adverse_party: "Sofia Alvarez",
    }, PHONE),
  )) as { status: string; matter_id: string; reference: string; stage: string };
  console.log("matter:", matter.status, matter.reference, "stage", matter.stage);
  expect(matter.status === "created" && matter.stage === "qualified", "a qualified lead must open a matter at the qualified stage");

  const consent = (await runTool(call(C1, "record_sms_consent", { opted_in: true, phone: PHONE }, PHONE))) as { opted_in: boolean };
  expect(consent.opted_in, "consent must be recorded as granted");

  const retainer = (await runTool(
    call(C1, "send_retainer", { matter_id: matter.matter_id, reference: matter.reference, phone: PHONE, email: "jordan@example.com", first_name: "Jordan", opted_in: true }, PHONE),
  )) as { status: string; say: string };
  console.log("retainer:", retainer.status, "|", retainer.say);
  expect(retainer.status === "sent", "retainer must be sent");

  const cb = (await runTool(call(C1, "schedule_callback", { matter_id: matter.matter_id, reference: matter.reference, urgency: "normal", first_name: "Jordan", phone: PHONE }, PHONE))) as { status: string; say: string };
  console.log("callback:", cb.status, "|", cb.say);
  await runTool(call(C1, "confirm_lead", { matter_id: matter.matter_id, reference: matter.reference, first_name: "Jordan", phone: PHONE, opted_in: true }, PHONE));

  const [stage] = await q<{ stage: string }>(`select stage from demo_matters where id = $1`, [matter.matter_id]);
  expect(stage.stage === "retainer_sent", `matter must move to retainer_sent, got ${stage.stage}`);

  heading("half an intake is not scored");
  const half = (await runTool(call("call_half", "qualify_lead", { case_type: "auto", incident_date: "today", treatment: "", fault: "", prior_counsel: "no" }))) as { status: string; questions: string[] };
  console.log("half:", half.status, half.questions);
  expect(half.status === "need_answers" && half.questions.length === 2, "blank treatment and fault must come back as need_answers");

  heading("same day accident, other driver at fault, no doctor yet");
  const fresh = (await runTool(call("call_fresh", "qualify_lead", { case_type: "auto", incident_date: "today around noon", treatment: "no", fault: "other", police_report: "unknown", prior_counsel: "no" }))) as { status: string; score: number; flags: string[] };
  console.log("fresh:", fresh.status, fresh.score, fresh.flags);
  expect(fresh.status === "qualified" && fresh.flags.includes("No treatment yet"), "a clear liability lead qualifies even before the first doctor visit");
  expect(faultFrom("a car hit me while I was on the crosswalk") === "other", "being hit is not the caller's fault");

  // ---------------------------------------------------------------- scene 2
  heading("scene two, past the filing deadline");
  const C2 = "call_late_002";
  await runTool(call(C2, "classify_intake", { description: "I slipped in a grocery store" }, "+18135550910"));
  const late = (await runTool(call(C2, "qualify_lead", { case_type: "premises", incident_date: "March 3rd 2023", treatment: "yes", fault: "the store", prior_counsel: "no" }, "+18135550910"))) as { status: string; flags: string[] };
  console.log("late:", late.status, late.flags);
  expect(late.status === "disqualified" && late.flags.includes("Deadline passed"), "a 2023 fall must be past the two year deadline");

  // ---------------------------------------------------------------- scene 3
  heading("scene three, already represented");
  const C3 = "call_rep_003";
  await runTool(call(C3, "classify_intake", { description: "car accident last month" }, "+18135550911"));
  const rep = (await runTool(call(C3, "qualify_lead", { case_type: "auto", incident_date: "last month", treatment: "yes", fault: "other", prior_counsel: "yes, I signed with a firm but I'm not happy" }, "+18135550911"))) as { status: string; flags: string[] };
  console.log("represented:", rep.status, rep.flags);
  expect(rep.status === "disqualified" && rep.flags.includes("Represented"), "a represented caller must be declined");

  // ---------------------------------------------------------------- scene 4
  heading("scene four, conflict with an existing client");
  const C4 = "call_conflict_004";
  const hit = (await runTool(call(C4, "conflict_check", { adverse_party: "Marcus Bell", first_name: "Pat", last_name: "Quinn" }, "+18135550912"))) as { status: string };
  console.log("conflict:", hit.status);
  expect(hit.status === "hit", "suing an existing client must be a conflict hit");
  const [ct] = await q<{ n: number }>(`select count(*)::int as n from demo_tasks where kind = 'conflict_review'`);
  expect(ct.n === 1, "a conflict hit must open a review task");

  // ---------------------------------------------------------------- scene 5
  heading("scene five, workplace injury referral");
  const C5 = "call_ref_005";
  const ref = (await runTool(call(C5, "classify_intake", { description: "I hurt my back at work lifting boxes in the warehouse" }, "+18135550913"))) as { case_type: string; accepted: boolean };
  console.log("classified:", ref.case_type, "accepted", ref.accepted);
  expect(ref.case_type === "workers_comp" && !ref.accepted, "a workplace injury must route to referral");
  const refq = (await runTool(call(C5, "qualify_lead", { case_type: "workers_comp", incident_date: "yesterday" }, "+18135550913"))) as { status: string };
  expect(refq.status === "referral", "workers comp must qualify as referral");
  await runTool(call(C5, "take_message", { name: "Sam Ortega", phone: "+18135550913", reason: "referral", note: "Warehouse back injury." }, "+18135550913"));

  // ---------------------------------------------------------------- results
  heading("matters created by the agent");
  const created = await q<{ reference: string; stage: string; score: number }>(`select reference, stage, score from demo_matters where created_by_agent order by created_at`);
  console.log(created);
  expect(created.length === 1, `exactly one matter should exist, found ${created.length}`);

  heading("pipeline, scene one");
  const pipeline = await q<{ step: string; status: string; detail: string | null }>(`select step, status, detail from pipeline_events where call_id = $1 order by id asc`, [C1]);
  for (const p of pipeline) console.log(`  ${p.status.padEnd(6)} ${p.step.padEnd(20)} ${p.detail ?? ""}`);
  const steps = new Set(pipeline.map((p) => p.step));
  for (const s of ["disclosures_made", "intake_classified", "lead_qualified", "conflict_checked", "contact_created", "matter_created", "retainer_sent", "attorney_tasked", "lead_confirmed"]) {
    expect(steps.has(s), `pipeline must contain ${s}`);
  }

  heading("messages composed");
  const messages = await q<{ channel: string; to_label: string; status: string; body: string }>(`select channel, to_label, status, body from outbound_messages order by id asc`);
  for (const m of messages) console.log(`  [${m.channel}/${m.to_label}/${m.status}] ${m.body.slice(0, 110)}`);
  expect(messages.some((m) => m.channel === "esign"), "an e-sign envelope must be prepared");
  expect(messages.some((m) => m.channel === "sms" && m.to_label === "lead"), "the lead must get a text");
  expect(messages.some((m) => m.to_label === "intake"), "after hours, the on call intake specialist must be texted");

  heading("consent trail");
  const consents = await q<{ kind: string; granted: boolean; script_version: string }>(`select kind, granted, script_version from consent_events order by id asc`);
  console.log(consents);
  expect(consents.some((c) => c.kind === "recording_disclosure"), "recording disclosure must be logged");
  expect(consents.some((c) => c.kind === "sms_opt_in" && c.granted), "sms opt in must be logged");

  heading("totals");
  const [totals] = await q<{ qualified: number; declined: number; retainers: number; fee: number }>(
    `select (select count(*)::int from demo_calls where qualification = 'qualified') as qualified,
            (select count(*)::int from demo_calls where qualification in ('disqualified','referral')) as declined,
            (select count(*)::int from demo_matters where created_by_agent and stage = 'retainer_sent') as retainers,
            (select coalesce(sum(fee_value),0)::float from demo_calls where matter_id is not null) as fee`,
  );
  console.log(totals);
  expect(totals.qualified === 2 && totals.retainers === 1, "two qualified leads (one scored only), one retainer");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED\n", err);
  process.exit(1);
});
