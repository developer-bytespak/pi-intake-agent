/**
 * Everything the demo screen needs, in one poll.
 *
 * The browser sends the highest id it has already seen, so rows come back only
 * when they are new and the panels append rather than redraw. Polling rather
 * than a socket is deliberate: it survives a cold start, a conference network
 * and a laptop waking from sleep, which is the situation a live demo runs in.
 */

import { NextRequest, NextResponse } from "next/server";
import { databaseWarning, q } from "@/lib/db";
import { CASE_TYPES, FIRM, SPEED_TARGET_SECONDS, STAFF, STAGES, isAfterHours, onCallIntake } from "@/lib/config";
import { lawmatics } from "@/lib/lawmatics";
import { esignMode, smsMode } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(value: string | null, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  try {
    return await readState(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: "could not read the demo state", detail: message, hint: databaseWarning() },
      { status: 500 },
    );
  }
}

async function readState(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sincePipeline = num(params.get("pipeline"));
  const sinceEvents = num(params.get("events"));
  const sinceMessages = num(params.get("messages"));
  const sinceConsents = num(params.get("consents"));

  const [matters, pipeline, events, messages, consents, tasks, leads, calls, totals] = await Promise.all([
    lawmatics().listMatters(14),
    q(
      `select id, occurred_at, call_id, step, status, detail, duration_ms
       from pipeline_events where id > $1 order by id asc limit 200`,
      [sincePipeline],
    ),
    q(
      `select id, occurred_at, call_id, action, outcome, detail
       from call_events where id > $1 order by id asc limit 200`,
      [sinceEvents],
    ),
    q(
      `select id, created_at, call_id, matter_id, to_address, to_label, channel, subject, body, status, provider
       from outbound_messages where id > $1 order by id asc limit 50`,
      [sinceMessages],
    ),
    q(
      `select id, occurred_at, call_id, lead_id, kind, granted, script_version, phone_last4
       from consent_events where id > $1 order by id asc limit 100`,
      [sinceConsents],
    ),
    q(
      `select t.id, t.created_at, t.matter_id, t.call_id, t.kind, t.assigned_to, t.due_at, t.priority, t.note, t.status,
              m.reference
       from demo_tasks t left join demo_matters m on m.id = t.matter_id
       order by t.created_at desc limit 12`,
    ),
    q(
      `select id, created_at, first_name, last_name, phone, status, call_id, contacted_at, speed_ms, matter_id
       from demo_leads order by created_at desc limit 8`,
    ),
    q(
      `select call_id, started_at, ended_at, channel, from_number, lead_id, qualification,
              outcome, after_hours, matter_id, fee_value, summary
       from demo_calls order by started_at desc limit 10`,
    ),
    q(
      `select
         (select count(*)::int from demo_calls where call_id not like 'form_%')                     as calls_total,
         (select count(*)::int from demo_calls where after_hours and call_id not like 'form_%')     as calls_after_hours,
         (select count(*)::int from demo_leads)                                                     as forms_total,
         (select count(*)::int from demo_calls where qualification = 'qualified')                   as qualified,
         (select count(*)::int from demo_calls where qualification in ('disqualified','referral'))  as declined,
         (select count(*)::int from demo_matters where created_by_agent)                            as matters_by_agent,
         (select count(*)::int from demo_matters where created_by_agent and stage = 'retainer_sent') as retainers_sent,
         (select coalesce(sum(fee_value),0)::float from demo_calls where matter_id is not null)     as fee_pipeline,
         (select count(*)::int from demo_tasks where status = 'open')                               as tasks_open,
         (select avg(speed_ms)::int from demo_leads where speed_ms is not null)                     as avg_speed_ms,
         (select min(speed_ms)::int from demo_leads where speed_ms is not null)                     as best_speed_ms`,
    ),
  ]);

  const onCall = onCallIntake();

  return NextResponse.json({
    firm: {
      name: FIRM.name,
      shortName: FIRM.shortName,
      tagline: FIRM.tagline,
      mainNumber: FIRM.mainNumber,
      state: FIRM.state,
    },
    mode: {
      lawmatics: lawmatics().mode,
      sms: smsMode(),
      esign: esignMode(),
      outbound: Boolean(process.env.RETELL_API_KEY && process.env.RETELL_FROM_NUMBER && process.env.NEXT_PUBLIC_RETELL_AGENT_ID),
      afterHours: isAfterHours(),
      onCall: onCall.firstName,
      onCallId: onCall.id,
      phoneNumber: process.env.NEXT_PUBLIC_DEMO_PHONE_NUMBER ?? "",
      speedTargetSeconds: SPEED_TARGET_SECONDS,
    },
    board: {
      staff: STAFF.map((s) => ({ id: s.id, name: s.name, firstName: s.firstName, role: s.role, title: s.title, tone: s.tone })),
      stages: STAGES,
      caseTypes: CASE_TYPES.map((c) => ({ id: c.id, name: c.name, accepted: c.accepted })),
    },
    matters,
    tasks,
    leads,
    pipeline,
    events,
    messages,
    consents,
    calls,
    totals: totals[0] ?? {},
    cursors: {
      pipeline: pipeline.length ? Number(pipeline[pipeline.length - 1].id) : sincePipeline,
      events: events.length ? Number(events[events.length - 1].id) : sinceEvents,
      messages: messages.length ? Number(messages[messages.length - 1].id) : sinceMessages,
      consents: consents.length ? Number(consents[consents.length - 1].id) : sinceConsents,
    },
  });
}
