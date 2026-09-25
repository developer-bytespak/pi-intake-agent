"use client";

/**
 * The left column: place the call, watch who is speaking, read the words.
 *
 * The qualification badge is the piece that wins the room. The moment the
 * agent finishes its questions the caller stops being a voice and becomes a
 * decision the firm already has a rule for, and the badge says which one in
 * a colour an intake manager can read from across the office.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CallPhase, TranscriptTurn } from "@/app/hooks/useRetellCall";

export type QualificationStatus = "qualified" | "review" | "disqualified" | "referral";

export interface QualificationBadge {
  status: QualificationStatus;
  score: number | null;
  flags: string[];
  detail: string | null;
}

export type IntakeMode = "call" | "form";

export interface CallPanelProps {
  phase: CallPhase;
  isLive: boolean;
  configured: boolean;
  /** Which workspace the panel belongs to; changes the unconfigured hint. */
  scope?: "demo" | "app";
  callId: string | null;
  startedAt: number | null;
  agentTalking: boolean;
  ringing: boolean;
  muted: boolean;
  turns: TranscriptTurn[];
  qualification: QualificationBadge | null;
  phoneNumber: string;
  firmName: string;
  error: string | null;
  endedReason: string | null;
  mode: IntakeMode;
  onModeChange: (mode: IntakeMode) => void;
  /** The web form, rendered in place of the call when the form tab is up. */
  form: ReactNode;
  onStart: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
}

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "Ready",
  connecting: "Connecting",
  live: "Connected",
  ending: "Hanging up",
  ended: "Call ended",
  error: "Not connected",
};

export const QUALIFICATION_WORD: Record<QualificationStatus, string> = {
  qualified: "Qualified",
  review: "Attorney review",
  disqualified: "Declined",
  referral: "Referral",
};

const QUALIFICATION_LINE: Record<QualificationStatus, string> = {
  qualified: "Matter opened, retainer on its way",
  review: "Held for an attorney to weigh in",
  disqualified: "Let down gently, nothing created",
  referral: "Passed to the partner firm",
};

const BAR_COUNT = 7;

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CallPanel(props: CallPanelProps) {
  const {
    phase,
    isLive,
    configured,
    scope = "demo",
    callId,
    startedAt,
    agentTalking,
    ringing,
    muted,
    turns,
    qualification,
    phoneNumber,
    firmName,
    error,
    endedReason,
    mode,
    onModeChange,
    form,
    onStart,
    onEnd,
    onToggleMute,
  } = props;

  const scroller = useRef<HTMLDivElement | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || phase === "idle") return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    if (phase !== "live" && phase !== "connecting") return;
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, phase]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance < 140) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [turns.length, turns[turns.length - 1]?.content]);

  const lastIndex = turns.length - 1;

  const voiceState = useMemo(() => {
    if (!isLive) return { className: "voice", label: "Microphone off", hint: "Start a call to hear the intake line." };
    if (phase === "connecting") return { className: "voice", label: "Connecting", hint: "Setting up the audio channel." };
    if (ringing && !agentTalking) return { className: "voice is-ringing", label: "Ringing", hint: "Picking up in a moment." };
    if (agentTalking) return { className: "voice is-agent", label: "Agent speaking", hint: "Cut in whenever you like, it stops and listens." };
    return {
      className: "voice is-listening",
      label: muted ? "Microphone muted" : "Listening",
      hint: muted ? "The agent cannot hear you." : "Go ahead, speak the way an injured caller would.",
    };
  }, [isLive, phase, agentTalking, ringing, muted]);

  return (
    <section className="panel" aria-label="Intake">
      <div className="panel-head">
        <h2 className="panel-title">Intake</h2>
        <div className="seg seg-mini" role="tablist" aria-label="Intake channel">
          <button type="button" role="tab" className="seg-btn" aria-selected={mode === "call"} aria-pressed={mode === "call"} onClick={() => onModeChange("call")}>
            Call
          </button>
          <button type="button" role="tab" className="seg-btn" aria-selected={mode === "form"} aria-pressed={mode === "form"} onClick={() => onModeChange("form")}>
            Web form
          </button>
        </div>
        <div className="panel-head-end">
          {mode === "call" ? <span className={`tag${isLive ? " tag-accent" : ""}`}>{PHASE_LABEL[phase]}</span> : <span className="tag">Speed to lead</span>}
        </div>
      </div>

      {mode === "form" ? (
        <div className="panel-body">{form}</div>
      ) : (
        <div className="panel-body">
          <div className="call-top">
            <button
              type="button"
              className={`btn btn-cta${isLive ? " is-live" : ""}`}
              onClick={isLive ? onEnd : onStart}
              disabled={!configured || phase === "connecting" || phase === "ending"}
            >
              {isLive ? "End call" : "Call the intake line"}
            </button>

            {!configured ? (
              scope === "app" ? (
                <p className="setup-note">
                  This workspace has no assistant yet. Onboarding creates one; until then, every other part of
                  this screen is live and calls will appear here once the assistant answers its first one.
                </p>
              ) : (
                <p className="setup-note">
                  Voice is not wired up on this deployment. Set <code>NEXT_PUBLIC_RETELL_PUBLIC_KEY</code> and{" "}
                  <code>NEXT_PUBLIC_RETELL_AGENT_ID</code>, then reload. Everything else on this screen is live.
                </p>
              )
            ) : null}

            {phoneNumber ? (
              <p className="phone-hint">
                or call <span className="phone-number">{phoneNumber}</span>
              </p>
            ) : null}

            {error ? (
              <p className="call-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className={voiceState.className}>
              <div className="voice-bars" aria-hidden="true">
                {Array.from({ length: BAR_COUNT }, (_, i) => (
                  <span className="voice-bar" key={i} />
                ))}
              </div>
              <div className="voice-text">
                <div className="voice-label">{voiceState.label}</div>
                <div className="voice-hint">{voiceState.hint}</div>
              </div>
            </div>

            <div aria-live="polite">
              {qualification ? (
                <div className={`urgency u-${qualification.status}`} key={qualification.status}>
                  <span className="urgency-word">{QUALIFICATION_WORD[qualification.status]}</span>
                  <span className="urgency-body">
                    <span className="urgency-kicker">
                      Intake decision{qualification.score !== null ? ` · score ${qualification.score}` : ""}
                    </span>
                    <span className="urgency-detail">
                      {qualification.flags.length ? qualification.flags.join(" · ") : (qualification.detail ?? QUALIFICATION_LINE[qualification.status])}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            <div className="call-status">
              <span className="call-id">{callId ? `call ${callId.slice(0, 18)}` : `intake agent for ${firmName}`}</span>
              {isLive || phase === "ended" ? <span className="mono num">{clock(elapsed)}</span> : null}
              {isLive ? (
                <button type="button" className="btn btn-quiet" onClick={onToggleMute}>
                  {muted ? "Unmute" : "Mute"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="transcript-head">
            <span className="transcript-head-title">Live transcript</span>
            <span className="tag num">{turns.length} turns</span>
          </div>

          <div className="transcript scroll" ref={scroller} aria-live="polite" aria-atomic="false" aria-label="Call transcript">
            {turns.length === 0 ? (
              <div className="empty">
                {phase === "ended" ? (
                  <>
                    <strong>That call is done.</strong> The matter, the pipeline and the follow up on this screen are
                    exactly what it left behind. Start another whenever you are ready.
                  </>
                ) : (
                  <>
                    <strong>Nothing said yet.</strong> Press call, allow the microphone, and speak the way an injured
                    caller would. A good opening is: I was rear ended on I-275 last Tuesday and my neck and back are
                    killing me.
                    <br />
                    <br />
                    Every word appears here as it is spoken.
                  </>
                )}
              </div>
            ) : (
              turns.map((turn, index) => {
                const growing = index === lastIndex && phase === "live";
                return (
                  <article
                    key={turn.id}
                    className={`turn turn-${turn.role}${growing && agentTalking && turn.role === "agent" ? " is-growing" : ""}`}
                  >
                    <div className="turn-role">{turn.role === "agent" ? "Agent" : "Caller"}</div>
                    <div className="turn-text">{turn.content}</div>
                  </article>
                );
              })
            )}
          </div>

          {endedReason ? <div className="panel-foot mono">Ended: {endedReason.replace(/_/g, " ")}</div> : null}
        </div>
      )}
    </section>
  );
}
