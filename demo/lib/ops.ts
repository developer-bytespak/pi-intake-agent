/**
 * The record of what the agent did on a call or a form.
 *
 * Two audiences. The pipeline table drives the live trace on screen during
 * the demo. The call_events, consent_events and demo_calls tables are what
 * the firm reviews on the retainer, and what an intake manager shows a
 * compliance auditor who asks "which words were said on which call".
 */

import { q } from "./db";
import { SCRIPTS, caseTypeById } from "./config";
import { tenantId } from "./tenancy";

export type PipelineStatus = "running" | "ok" | "warn" | "error";

/** Fixed order, so the trace renders as a stable ladder. */
export const PIPELINE_STEPS = [
  "lead_received",
  "disclosures_made",
  "intake_classified",
  "lead_qualified",
  "conflict_checked",
  "contact_created",
  "matter_created",
  "attorney_tasked",
  "retainer_sent",
  "lead_confirmed",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export async function logPipeline(
  callId: string,
  step: PipelineStep | string,
  status: PipelineStatus,
  detail?: string,
  durationMs?: number,
): Promise<void> {
  await q(
    `insert into pipeline_events (tenant_id, call_id, step, status, detail, duration_ms)
     values ($6,$1,$2,$3,$4,$5)`,
    [callId, step, status, detail ?? null, durationMs ?? null, tenantId()],
  );
}

export async function logCallEvent(input: {
  callId: string;
  action: string;
  outcome: string;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  await q(
    `insert into call_events (tenant_id, call_id, action, outcome, detail)
     values ($5,$1,$2,$3,$4)`,
    [input.callId, input.action, input.outcome, input.detail ? JSON.stringify(input.detail) : null, tenantId()],
  );
}

export async function logConsent(input: {
  callId?: string | null;
  leadId?: number | null;
  kind: "recording_disclosure" | "ai_disclosure" | "sms_opt_in" | "tcpa_form";
  granted: boolean;
  phone?: string | null;
}): Promise<void> {
  const last4 = input.phone ? input.phone.replace(/\D/g, "").slice(-4) : null;
  await q(
    `insert into consent_events (call_id, lead_id, kind, granted, script_version, phone_last4, tenant_id)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [input.callId ?? null, input.leadId ?? null, input.kind, input.granted, SCRIPTS.version, last4, tenantId()],
  );
}

export async function touchCall(
  callId: string,
  args: { channel?: "web" | "phone" | "outbound"; fromNumber?: string; afterHours?: boolean; leadId?: number | null } = {},
): Promise<void> {
  await q(
    `insert into demo_calls (call_id, channel, from_number, after_hours, lead_id, tenant_id)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (call_id) do update set lead_id = coalesce(demo_calls.lead_id, excluded.lead_id)`,
    [callId, args.channel ?? "web", args.fromNumber ?? null, args.afterHours ?? false, args.leadId ?? null, tenantId()],
  );
}

export async function setCallQualification(callId: string, qualification: string): Promise<void> {
  await q(`update demo_calls set qualification = $2 where call_id = $1 and tenant_id = $3`, [callId, qualification, tenantId()]);
}

/** Records the matter and the fee it represents. The board sums these. */
export async function markMatter(callId: string, matterId: string, caseTypeId: string): Promise<void> {
  const fee = caseTypeById(caseTypeId)?.typicalFee ?? 0;
  await q(`update demo_calls set matter_id = $2, fee_value = $3 where call_id = $1 and tenant_id = $4`, [callId, matterId, fee, tenantId()]);
}

export async function closeCall(callId: string, outcome: string, summary?: string): Promise<void> {
  await q(
    `update demo_calls set ended_at = now(), outcome = $2, summary = coalesce($3, summary)
     where call_id = $1 and tenant_id = $4`,
    [callId, outcome, summary ?? null, tenantId()],
  );
}

/**
 * The stopwatch. A form lead is "contacted" the moment the outbound call is
 * answered, or, with no phone number on the account, the moment the text is
 * composed. Either way the number on screen is honest about which it was.
 */
export async function markLeadContacted(leadId: number, args: { callId?: string | null; status: string }): Promise<void> {
  await q(
    `update demo_leads
        set contacted_at = coalesce(contacted_at, now()),
            speed_ms = coalesce(speed_ms, (extract(epoch from (now() - created_at)) * 1000)::int),
            status = $2,
            call_id = coalesce($3, call_id)
      where id = $1 and tenant_id = $4`,
    [leadId, args.status, args.callId ?? null, tenantId()],
  );
}
