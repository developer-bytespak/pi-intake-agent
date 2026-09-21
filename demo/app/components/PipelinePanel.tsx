"use client";

/**
 * The fixed ladder every lead climbs, in the order lib/ops.ts defines.
 *
 * Two sources feed it. The server poll is the truth and carries the real
 * status and timing. The agent's own tool call invocations arrive in the
 * browser a moment earlier, so a rung lights as running the instant the agent
 * reaches for a tool, then the poll settles it green, amber or red.
 */

import { useMemo } from "react";
import type { PipelineRow } from "@/app/hooks/useDemoState";
import type { ToolSignal } from "@/app/hooks/useRetellCall";

/** Mirrors PIPELINE_STEPS in lib/ops.ts. Repeated because lib/ops.ts imports the database driver. */
const PIPELINE_STEPS = [
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

export interface PipelinePanelProps {
  events: PipelineRow[];
  focusCallId: string | null;
  toolSignals: ToolSignal[];
  live: boolean;
}

type Step = (typeof PIPELINE_STEPS)[number];
type StepState = "idle" | "running" | "ok" | "warn" | "error";

const STEP_COPY: Record<Step, { name: string; hint: string }> = {
  lead_received: { name: "Lead received", hint: "Call answered or form submitted, signed" },
  disclosures_made: { name: "Disclosures made", hint: "Recording and AI notice, versioned" },
  intake_classified: { name: "Matter classified", hint: "Case type from the caller's own words" },
  lead_qualified: { name: "Lead qualified", hint: "Deadline, liability, treatment, counsel" },
  conflict_checked: { name: "Conflict checked", hint: "Against every open file's parties" },
  contact_created: { name: "Contact created", hint: "Matched on phone, never duplicated" },
  matter_created: { name: "Matter created", hint: "Stage, source tag and assignee set" },
  attorney_tasked: { name: "Attorney tasked", hint: "Callback with a due time" },
  retainer_sent: { name: "Retainer sent", hint: "E-sign link by text and email" },
  lead_confirmed: { name: "Lead confirmed", hint: "File reference texted back" },
};

const TOOL_STEP: Record<string, Step> = {
  classify_intake: "intake_classified",
  qualify_lead: "lead_qualified",
  conflict_check: "conflict_checked",
  create_matter: "contact_created",
  record_sms_consent: "lead_confirmed",
  send_retainer: "retainer_sent",
  schedule_callback: "attorney_tasked",
  confirm_lead: "lead_confirmed",
  take_message: "lead_confirmed",
};

interface Rung {
  step: Step;
  state: StepState;
  detail: string | null;
  durationMs: number | null;
}

function toState(status: string): StepState {
  if (status === "ok" || status === "warn" || status === "error" || status === "running") return status;
  return "idle";
}

export default function PipelinePanel({ events, focusCallId, toolSignals, live }: PipelinePanelProps) {
  const { rungs, done } = useMemo(() => {
    const latest = new Map<Step, Rung>();

    for (const event of focusCallId ? events : []) {
      if (event.call_id !== focusCallId) continue;
      const step = event.step as Step;
      if (!(PIPELINE_STEPS as readonly string[]).includes(step)) continue;
      latest.set(step, { step, state: toState(event.status), detail: event.detail, durationMs: event.duration_ms });
    }

    if (focusCallId) {
      if (!latest.has("lead_received")) {
        latest.set("lead_received", { step: "lead_received", state: "ok", detail: "picked up on the first ring", durationMs: null });
      }
      for (const signal of toolSignals) {
        const step = TOOL_STEP[signal.name];
        if (!step) continue;
        if (!latest.has("disclosures_made")) {
          latest.set("disclosures_made", { step: "disclosures_made", state: "ok", detail: "recording and AI disclosure", durationMs: null });
        }
        if (!latest.has(step)) {
          latest.set(step, { step, state: "running", detail: signal.name.replace(/_/g, " "), durationMs: null });
        }
      }
    }

    const list: Rung[] = PIPELINE_STEPS.map(
      (step) => latest.get(step) ?? { step, state: "idle" as StepState, detail: null, durationMs: null },
    );
    return { rungs: list, done: list.filter((r) => r.state === "ok").length };
  }, [events, focusCallId, toolSignals]);

  return (
    <section className="panel" aria-label="Intake pipeline">
      <div className="panel-head">
        <h2 className="panel-title">Pipeline</h2>
        <p className="panel-sub">The same ten steps on every lead</p>
        <div className="panel-head-end">
          <span className={`tag${live ? " tag-accent" : ""} num`}>
            {done} of {PIPELINE_STEPS.length}
          </span>
        </div>
      </div>

      <div className="panel-body scroll">
        <ol className="ladder" aria-live="polite" aria-label="Pipeline steps">
          {rungs.map((rung) => {
            const copy = STEP_COPY[rung.step];
            return (
              <li key={rung.step} className={`step${rung.state === "idle" ? "" : ` is-${rung.state}`}`}>
                <span className="step-dot" aria-hidden="true" />
                <span>
                  <span className="step-name">{copy.name}</span>
                  <span className="step-detail">{rung.state === "idle" ? copy.hint : (rung.detail ?? copy.hint)}</span>
                  <span className="sr-only">{rung.state === "idle" ? "not started" : rung.state}</span>
                </span>
                <span className="step-dur num">{rung.durationMs !== null ? `${rung.durationMs} ms` : ""}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {!focusCallId ? <div className="panel-foot">Idle. It fills from the top on the next call or form.</div> : null}
    </section>
  );
}
