"use client";

/**
 * What happens after the call: the tasks on people's desks, the texts and
 * emails and e-sign links that went out, and the consent trail that makes
 * all of it defensible.
 *
 * Twilio and the e-sign provider are not connected yet, so messages are
 * composed and stored rather than sent, and the note under the list says so.
 */

import { useState } from "react";
import type { BoardStaff, ConsentRow, MessageRow, TaskRow } from "@/app/hooks/useDemoState";

export interface FollowUpPanelProps {
  tasks: TaskRow[];
  messages: MessageRow[];
  consents: ConsentRow[];
  staff: BoardStaff[];
  smsMode: "preview" | "twilio";
}

type Tab = "tasks" | "messages" | "consent";

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DAY_TIME = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

const KIND: Record<string, string> = {
  attorney_callback: "Attorney callback",
  conflict_review: "Conflict review",
  referral: "Referral",
  callback: "Intake callback",
};

const CHANNEL: Record<string, string> = { sms: "Text", email: "Email", esign: "E-sign" };

const CONSENT: Record<string, string> = {
  recording_disclosure: "Recording disclosure",
  ai_disclosure: "AI disclosure",
  sms_opt_in: "Text opt in",
  tcpa_form: "TCPA form consent",
};

function statusClass(status: string): string {
  if (status === "sent") return "status-pill status-sent";
  if (status === "failed") return "status-pill status-failed";
  return "status-pill status-queued";
}

export default function FollowUpPanel({ tasks, messages, consents, staff, smsMode }: FollowUpPanelProps) {
  const [tab, setTab] = useState<Tab>("tasks");
  const who = new Map(staff.map((s) => [s.id, s]));
  const openTasks = tasks.filter((t) => t.status === "open");

  return (
    <section className="panel" aria-label="Follow up">
      <div className="panel-head">
        <h2 className="panel-title">Follow up</h2>
        <p className="panel-sub">What lands on people's desks</p>
        <div className="panel-head-end">
          <span className="tag num">{openTasks.length} open</span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Follow up views">
        <button type="button" role="tab" className="tab" aria-selected={tab === "tasks"} onClick={() => setTab("tasks")}>
          Tasks <span className="tab-count num">{openTasks.length}</span>
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "messages"} onClick={() => setTab("messages")}>
          Messages <span className="tab-count num">{messages.length}</span>
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "consent"} onClick={() => setTab("consent")}>
          Consent <span className="tab-count num">{consents.length}</span>
        </button>
      </div>

      <div className="panel-body">
        {tab === "tasks" ? (
          <ul className="log scroll" aria-live="polite">
            {openTasks.length === 0 ? (
              <li className="empty">
                <strong>Nothing open.</strong> A qualified lead puts a callback on an attorney's desk with a due time.
              </li>
            ) : (
              openTasks.map((t) => (
                <li key={String(t.id)} className={`log-row prio-${t.priority}`}>
                  <span className="log-time mono">{t.due_at ? DAY_TIME.format(new Date(t.due_at)) : "no due"}</span>
                  <span className="log-main">
                    <span className="log-action">
                      {KIND[t.kind] ?? t.kind.replace(/_/g, " ")}
                      {t.reference ? <span className="mono log-ref"> {t.reference}</span> : null}
                    </span>
                    <span className="log-sub">
                      {who.get(t.assigned_to ?? "")?.name ?? "Unassigned"} · {t.note}
                    </span>
                  </span>
                  <span className={`status-pill prio-pill-${t.priority}`}>{t.priority}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {tab === "messages" ? (
          <>
            <div className="log scroll" aria-live="polite">
              {messages.length === 0 ? (
                <p className="empty">
                  <strong>No messages yet.</strong> The confirmation text, the retainer email and the e-sign envelope
                  all land here, worded exactly as they will go out.
                </p>
              ) : (
                messages.map((m) => (
                  <div key={String(m.id)} className={`bubble bubble-${m.channel}`}>
                    <div className="bubble-head">
                      <span>
                        {CHANNEL[m.channel] ?? m.channel} to {m.to_label}
                      </span>
                      <span className={statusClass(m.status)}>{m.status}</span>
                    </div>
                    {m.subject ? <div className="bubble-subject">{m.subject}</div> : null}
                    <div className="bubble-body">{m.body}</div>
                    <div className="bubble-num">
                      {m.to_address} {"·"} {TIME.format(new Date(m.created_at))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="sms-note">
              {smsMode === "preview" ? (
                <>
                  <strong>Preview mode.</strong> Composed and stored, nothing leaves the building. Connect Twilio and an
                  e-sign provider and the same messages send for real.
                </>
              ) : (
                <>
                  <strong>Twilio is connected.</strong> Texts go to real handsets; each pill shows what the carrier came
                  back with.
                </>
              )}
            </p>
          </>
        ) : null}

        {tab === "consent" ? (
          <ul className="log scroll" aria-live="polite">
            {consents.length === 0 ? (
              <li className="empty">
                <strong>No consent events yet.</strong> Every disclosure and opt in is written the moment it happens,
                with the script version, so the firm can prove which words were said on which call.
              </li>
            ) : (
              consents.map((c) => (
                <li key={String(c.id)} className="log-row">
                  <span className="log-time mono">{TIME.format(new Date(c.occurred_at))}</span>
                  <span className="log-main">
                    <span className="log-action">{CONSENT[c.kind] ?? c.kind.replace(/_/g, " ")}</span>
                    <span className="log-sub">
                      script {c.script_version}
                      {c.phone_last4 ? ` · number ending ${c.phone_last4}` : ""}
                      {c.call_id ? ` · ${c.call_id.slice(0, 14)}` : c.lead_id ? ` · form lead ${c.lead_id}` : ""}
                    </span>
                  </span>
                  <span className={`status-pill ${c.granted ? "status-sent" : "status-failed"}`}>{c.granted ? "granted" : "declined"}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
