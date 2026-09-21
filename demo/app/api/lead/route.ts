/**
 * The web form. This is the speed to lead scene.
 *
 * A submission is stored with the moment it arrived, and if the deployment
 * has a Retell phone number the agent dials the lead back immediately. The
 * stopwatch stops when the lead answers (Retell's call_started webhook). With
 * no number on the account the lead is still recorded, a text is composed,
 * and an intake task is opened, and the screen says exactly which of the two
 * happened.
 *
 * TCPA: the outbound call and the text only happen when the consent box was
 * ticked, and the consent is written to the audit with the script version
 * before anything else runs.
 */

import { NextRequest, NextResponse } from "next/server";
import { FIRM, SCRIPTS, isAfterHours, onCallIntake } from "@/lib/config";
import { databaseWarning, q } from "@/lib/db";
import { lawmatics } from "@/lib/lawmatics";
import { sendMessage } from "@/lib/messages";
import { logCallEvent, logConsent, logPipeline, markLeadContacted, touchCall } from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function e164(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function outboundConfigured(): boolean {
  return Boolean(process.env.RETELL_API_KEY && process.env.RETELL_FROM_NUMBER && process.env.NEXT_PUBLIC_RETELL_AGENT_ID);
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "could not record the lead", detail: message, hint: databaseWarning() }, { status: 500 });
  }
}

async function handle(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const firstName = String(body.first_name ?? "").trim();
  const lastName = String(body.last_name ?? "").trim();
  const phone = e164(String(body.phone ?? ""));
  const email = String(body.email ?? "").trim() || null;
  const description = String(body.description ?? "").trim().slice(0, 1000);
  const consent = body.consent === true;

  if (!firstName || !phone || !description) {
    return NextResponse.json({ error: "first name, a valid phone number and a description are required" }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "the consent box must be ticked before the firm can call or text" }, { status: 400 });
  }

  const [lead] = await q<{ id: number; created_at: string }>(
    `insert into demo_leads (first_name, last_name, phone, email, description, consent_call, consent_at, status)
     values ($1,$2,$3,$4,$5,true,now(),'received') returning id, created_at`,
    [firstName, lastName || "(not given)", phone, email, description],
  );

  await logConsent({ leadId: lead.id, kind: "tcpa_form", granted: true, phone });

  // A synthetic call id carries the form through the pipeline ladder until
  // the real outbound call replaces it.
  const formCallId = `form_${lead.id}`;
  await touchCall(formCallId, { channel: "outbound", fromNumber: phone, afterHours: isAfterHours(), leadId: lead.id });
  await logPipeline(formCallId, "lead_received", "ok", `web form, TCPA consent ${SCRIPTS.version}`);
  await logPipeline(formCallId, "disclosures_made", "ok", "consent language shown on the form");
  await logCallEvent({ callId: formCallId, action: "form_received", outcome: "ok", detail: { lead_id: lead.id } });

  if (outboundConfigured()) {
    const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RETELL_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from_number: process.env.RETELL_FROM_NUMBER,
        to_number: phone,
        override_agent_id: process.env.NEXT_PUBLIC_RETELL_AGENT_ID,
        metadata: { lead_id: String(lead.id), source: "web_form" },
        retell_llm_dynamic_variables: {
          firm_name: FIRM.name,
          short_name: FIRM.shortName,
          callback_number: FIRM.mainNumber,
          channel: "outbound",
          lead_first_name: firstName,
          lead_description: description,
          lead_id: String(lead.id),
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { call_id?: string; message?: string };

    if (res.ok && json.call_id) {
      await q(`update demo_leads set status = 'calling', call_id = $2 where id = $1`, [lead.id, json.call_id]);
      await logPipeline(formCallId, "lead_received", "ok", `dialing ${phone.replace(/\d(?=\d{4})/g, "•")} now`);
      return NextResponse.json({ ok: true, lead_id: lead.id, status: "calling", call_id: json.call_id });
    }

    await logPipeline(formCallId, "lead_received", "error", `outbound call failed: ${json.message ?? res.status}`);
    await logCallEvent({ callId: formCallId, action: "outbound_call", outcome: "error", detail: { status: res.status } });
  }

  // No number on this deployment, or the dial failed. Still fast, still honest.
  await sendMessage({
    callId: formCallId,
    to: phone,
    label: "lead",
    channel: "sms",
    body: `${FIRM.shortName}: hi ${firstName}, we got your message and an attorney's team is calling you now from ${FIRM.mainNumber}. Reply STOP to opt out.`,
  });
  await lawmatics().createTask({
    matterId: null,
    callId: formCallId,
    kind: "callback",
    assignedTo: onCallIntake().id,
    dueAt: new Date(Date.now() + 5 * 60_000),
    priority: "urgent",
    note: `Web form lead ${firstName} ${lastName}, ${phone}. Call now: ${description.slice(0, 160)}`,
  });
  await markLeadContacted(lead.id, { status: outboundConfigured() ? "no_answer" : "no_number" });
  await logPipeline(
    formCallId,
    "lead_confirmed",
    "warn",
    outboundConfigured() ? "dial failed, text sent and intake tasked" : "no outbound number on this deployment, text sent and intake tasked",
  );

  return NextResponse.json({ ok: true, lead_id: lead.id, status: outboundConfigured() ? "no_answer" : "no_number" });
}
