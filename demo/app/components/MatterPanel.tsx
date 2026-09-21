"use client";

/**
 * The matter, as Lawmatics would show it.
 *
 * The card at the top is the file the agent is building right now: the
 * fields fill in as the questions are answered, the score meter settles, and
 * the stage strip moves from New lead towards Retainer sent while the caller
 * is still on the line. Under it, the firm's intake pipeline, so the new file
 * lands among the ones already in play.
 */

import { useMemo } from "react";
import type { BoardStaff, MatterRow, Stage } from "@/app/hooks/useDemoState";

export interface MatterPanelProps {
  matters: MatterRow[];
  focus: MatterRow | null;
  staff: BoardStaff[];
  stages: { id: Stage; name: string }[];
  loaded: boolean;
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DATE_LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

const STAGE_TONE: Record<Stage, string> = {
  new_lead: "st-new",
  qualified: "st-qualified",
  attorney_review: "st-review",
  retainer_sent: "st-retainer",
  signed: "st-signed",
  referred: "st-referred",
  declined: "st-declined",
};

const STAGE_NAME: Record<Stage, string> = {
  new_lead: "New lead",
  qualified: "Qualified",
  attorney_review: "Attorney review",
  retainer_sent: "Retainer sent",
  signed: "Signed",
  referred: "Referred out",
  declined: "Declined",
};

function word(value: string | null | undefined, yes: string, no: string, unknown = "Not asked"): string {
  if (value === "yes" || value === "other") return yes;
  if (value === "no" || value === "self") return no;
  if (value === "shared") return "Shared";
  return unknown;
}

function localDate(iso: string | null): string {
  if (!iso) return "Not given";
  const [y, m, d] = iso.split("-").map(Number);
  return DATE_LONG.format(new Date(y, m - 1, d, 12));
}

export default function MatterPanel({ matters, focus, staff, stages, loaded }: MatterPanelProps) {
  const who = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const stageIndex = focus ? stages.findIndex((s) => s.id === focus.stage) : -1;
  const closed = focus?.stage === "declined" || focus?.stage === "referred";

  return (
    <section className="panel" aria-label="Matter">
      <div className="panel-head">
        <h2 className="panel-title">Matter</h2>
        <p className="panel-sub">As it lands in Lawmatics</p>
        <div className="panel-head-end">
          <span className={`tag${focus?.createdByAgent ? " tag-accent" : ""} num`}>{focus ? focus.reference : `${matters.length} in pipeline`}</span>
        </div>
      </div>

      <div className="panel-body">
        {focus ? (
          <div className={`matter${focus.createdByAgent ? " is-new" : ""}`}>
            <div className="matter-top">
              <span className={`matter-avatar tone-${who.get(focus.assignedTo ?? "")?.tone ?? "slate"}`} aria-hidden="true">
                {focus.contactName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <div className="matter-id">
                <span className="matter-name">{focus.contactName}</span>
                <span className="matter-type">
                  {focus.caseType} · {focus.source.replace(/_/g, " ")}
                </span>
              </div>
              <div className="matter-score" aria-label={`Score ${focus.score} of 100`}>
                <span className="matter-score-n num">{focus.score}</span>
                <span className="matter-score-l">score</span>
                <span className="meter" aria-hidden="true">
                  <span className="meter-fill" style={{ width: `${Math.max(4, focus.score)}%` }} />
                </span>
              </div>
            </div>

            <ol className={`mstages${closed ? " is-closed" : ""}`} aria-label="Pipeline stage">
              {closed ? (
                <li className={`mstage is-here ${STAGE_TONE[focus.stage]}`}>{STAGE_NAME[focus.stage]}</li>
              ) : (
                stages.map((s, i) => (
                  <li key={s.id} className={`mstage${i < stageIndex ? " is-past" : ""}${i === stageIndex ? " is-here" : ""}`}>
                    {s.name}
                  </li>
                ))
              )}
            </ol>

            {focus.flags.length ? (
              <div className="flags">
                {focus.flags.map((f) => (
                  <span key={f} className={`flag${/passed|represented|no liable/i.test(f) ? " flag-bad" : /close|shared|out of state|no treatment/i.test(f) ? " flag-warn" : ""}`}>
                    {f}
                  </span>
                ))}
              </div>
            ) : null}

            <dl className="fields">
              <div>
                <dt>Incident</dt>
                <dd>{localDate(focus.incidentDate)}{focus.incidentState ? `, ${focus.incidentState}` : ""}</dd>
              </div>
              <div>
                <dt>Treatment</dt>
                <dd>{word(focus.treated, "Yes, documented", "Not yet")}</dd>
              </div>
              <div>
                <dt>Liability</dt>
                <dd>{word(focus.fault, "Other party", "Caller at fault", "Unclear")}</dd>
              </div>
              <div>
                <dt>Police report</dt>
                <dd>{focus.policeReport === null ? "Not asked" : focus.policeReport ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Prior counsel</dt>
                <dd>{word(focus.priorCounsel, "Already represented", "None")}</dd>
              </div>
              <div>
                <dt>Assigned</dt>
                <dd>{who.get(focus.assignedTo ?? "")?.name ?? "Unassigned"}</dd>
              </div>
            </dl>

            {focus.summary ? <p className="matter-summary">{focus.summary}</p> : null}

            <div className="tags">
              {focus.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty matter-empty">
            {loaded ? (
              <>
                <strong>No file open yet.</strong> The next call or web form builds one here, field by field, while the
                caller is still on the line.
              </>
            ) : (
              "Loading the pipeline."
            )}
          </div>
        )}

        <div className="transcript-head">
          <span className="transcript-head-title">Intake pipeline</span>
          <span className="tag num">{matters.length}</span>
        </div>

        <ul className="matter-list scroll" aria-label="Recent matters">
          {matters.map((m) => (
            <li key={m.id} className={`matter-row${m.id === focus?.id ? " is-focus" : ""}${m.createdByAgent ? " is-agent" : ""}`}>
              <span className="matter-row-ref mono">{m.reference}</span>
              <span className="matter-row-main">
                <span className="matter-row-name">{m.contactName}</span>
                <span className="matter-row-sub">
                  {m.caseType} · {DATE.format(new Date(m.createdAt))}
                  {m.createdByAgent ? " · by the agent" : ""}
                </span>
              </span>
              <span className={`stage-pill ${STAGE_TONE[m.stage]}`}>{STAGE_NAME[m.stage]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
