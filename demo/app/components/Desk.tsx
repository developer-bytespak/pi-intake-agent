"use client";

/**
 * The intake desk. Rendered twice: on the public page as the demo workspace,
 * and at /app as the signed-in firm's own workspace.
 *
 * The demo screen. A scrolling document with a pinned sidebar and three
 * columns: the intake channel on the left, the matter it builds in the
 * middle, the stopwatch and the pipeline on the right. Everything is fed by
 * a single poll of /api/state, so the whole screen agrees with itself at
 * every moment.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import CallPanel, { type IntakeMode, type QualificationBadge, type QualificationStatus } from "@/app/components/CallPanel";
import FollowUpPanel from "@/app/components/FollowUpPanel";
import IntakeForm from "@/app/components/IntakeForm";
import MatterPanel from "@/app/components/MatterPanel";
import PipelinePanel from "@/app/components/PipelinePanel";
import SpeedPanel from "@/app/components/SpeedPanel";
import { FIRM, SCRIPTS, SPEED_TARGET_SECONDS, isAfterHours, onCallIntake } from "@/lib/config";
import { useDemoState, type LeadRow, type MatterRow, type Scope } from "@/app/hooks/useDemoState";
import { useRetellCall } from "@/app/hooks/useRetellCall";
import AccountChip, { type Account } from "@/app/components/AccountChip";

export interface DeskProps {
  /** "demo" reads the public workspace, "app" the signed-in one. */
  scope: Scope;
  /** Who is signed in, for the chip in the sidebar. Absent on the public page. */
  account?: Account;
  /** True when the reset button should show. Public demo, or a platform admin. */
  canReset: boolean;
}

type View = "desk" | "intake" | "matter" | "speed";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "desk", label: "Intake desk", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "intake", label: "Front line", icon: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" },
  { id: "matter", label: "Matters", icon: "M6 3h9l5 5v13H6zM14 3v6h6M9 13h7M9 17h7" },
  { id: "speed", label: "Speed and pipeline", icon: "M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5l3 2M9 2h6" },
];

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

type Theme = "system" | "light" | "dark";

function isStatus(v: unknown): v is QualificationStatus {
  return v === "qualified" || v === "review" || v === "disqualified" || v === "referral";
}

/** "Qualified, score 74, deadline close" comes back from the pipeline row. */
function badgeFromDetail(detail: string | null): QualificationBadge | null {
  if (!detail) return null;
  const parts = detail.split(",").map((p) => p.trim());
  const head = parts[0]?.toLowerCase() ?? "";
  const status: QualificationStatus | null =
    head === "qualified" ? "qualified" : head === "attorney review" ? "review" : head === "declined" ? "disqualified" : head === "referral" ? "referral" : null;
  if (!status) return null;
  const scoreMatch = detail.match(/score (\d+)/);
  const flags = parts.slice(2).map((f) => f.replace(/^\w/, (c) => c.toUpperCase()));
  return { status, score: scoreMatch ? Number(scoreMatch[1]) : null, flags, detail: null };
}

export default function Desk({ scope, account, canReset }: DeskProps) {
  const [theme, setTheme] = useState<Theme>("system");
  const [resetting, setResetting] = useState(false);
  const [view, setView] = useState<View>("desk");
  const [mode, setMode] = useState<IntakeMode>("call");
  const [formLeadId, setFormLeadId] = useState<number | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [systemLight, setSystemLight] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setSystemLight(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const showingLight = theme === "light" || (theme === "system" && systemLight);

  const { state, clear } = useDemoState(scope);
  const call = useRetellCall(scope);

  const [baseline, setBaseline] = useState<{ calls: Set<string>; matters: Set<string> } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!state.loaded || baseline) return;
    setBaseline({ calls: new Set(state.calls.map((c) => c.call_id)), matters: new Set(state.matters.map((m) => m.id)) });
  }, [state.loaded, state.calls, state.matters, baseline]);

  const firmName = state.firm?.name ?? call.config?.firm.name ?? FIRM.name;
  const shortName = state.firm?.shortName ?? call.config?.firm.shortName ?? FIRM.shortName;
  const tagline = state.firm?.tagline ?? call.config?.firm.tagline ?? FIRM.tagline;

  const lawmaticsMode = state.mode?.lawmatics ?? call.config?.integrations.lawmatics.mode ?? "mock";
  const smsMode = state.mode?.sms ?? call.config?.integrations.sms.mode ?? "preview";
  const outbound = state.mode?.outbound ?? call.config?.retell.outbound ?? false;
  const phoneNumber = state.mode?.phoneNumber || call.config?.retell.phoneNumber || "";
  const configured = call.config?.retell.configured ?? false;
  const afterHours = state.mode?.afterHours ?? (mounted ? isAfterHours() : false);
  const onCall = state.mode?.onCall ?? (mounted ? onCallIntake().firstName : "Intake");
  const targetSeconds = state.mode?.speedTargetSeconds ?? SPEED_TARGET_SECONDS;

  /** The web form lead the screen follows: the one just submitted, else the newest after page load. */
  const focusLead = useMemo<LeadRow | null>(() => {
    if (formLeadId !== null) return state.leads.find((l) => Number(l.id) === formLeadId) ?? null;
    return null;
  }, [formLeadId, state.leads]);

  /**
   * The ladder follows the call in front of the client: the web call if there
   * is one, else the outbound call to the form lead, else a call that arrived
   * while this screen has been open. Seeded history stays idle.
   */
  const focusCallId = useMemo(() => {
    if (call.callId) return call.callId;
    if (focusLead) {
      const real = state.calls.find((c) => c.call_id === focusLead.call_id);
      if (real) return real.call_id;
      return `form_${focusLead.id}`;
    }
    const latest = state.calls[0] ?? null;
    if (!latest || !baseline) return null;
    return baseline.calls.has(latest.call_id) ? null : latest.call_id;
  }, [call.callId, focusLead, state.calls, baseline]);

  const focusMatter = useMemo<MatterRow | null>(() => {
    const viaCall = focusCallId ? state.calls.find((c) => c.call_id === focusCallId)?.matter_id : null;
    if (viaCall) {
      const m = state.matters.find((x) => x.id === viaCall);
      if (m) return m;
    }
    if (!baseline) return null;
    return state.matters.find((m) => m.createdByAgent && !baseline.matters.has(m.id)) ?? null;
  }, [focusCallId, state.calls, state.matters, baseline]);

  const qualification = useMemo<QualificationBadge | null>(() => {
    if (!focusCallId) return null;
    for (let i = state.pipeline.length - 1; i >= 0; i--) {
      const row = state.pipeline[i];
      if (row.call_id !== focusCallId || row.step !== "lead_qualified") continue;
      const badge = badgeFromDetail(row.detail);
      if (badge) return badge;
    }
    for (let i = call.toolSignals.length - 1; i >= 0; i--) {
      const signal = call.toolSignals[i];
      if (signal.name !== "qualify_lead" || !signal.result) continue;
      try {
        const body = JSON.parse(signal.result) as { status?: unknown; score?: unknown; flags?: unknown };
        if (!isStatus(body.status)) continue;
        return {
          status: body.status,
          score: typeof body.score === "number" ? body.score : null,
          flags: Array.isArray(body.flags) ? body.flags.map(String) : [],
          detail: null,
        };
      } catch {
        /* A partial result is not worth a broken badge. */
      }
    }
    return null;
  }, [focusCallId, state.pipeline, call.toolSignals]);

  const onReset = useCallback(async () => {
    setResetting(true);
    try {
      await fetch(`/api/reset?scope=${scope}`, { method: "POST" });
    } catch {
      /* The connection tag reports it on the next poll. */
    }
    clear();
    setBaseline(null);
    setFormLeadId(null);
    setResetting(false);
  }, [clear]);

  const staff = state.board?.staff ?? [];
  const stages = state.board?.stages ?? [];

  return (
    <div className="app" data-view={view}>
      <aside className="sidebar" aria-label="Sections">
        <div className="side-brand">
          <span className="brand-mark" aria-hidden="true">
            {shortName.slice(0, 1).toUpperCase()}
          </span>
          <div className="brand-text">
            <span className="brand-name">{firmName}</span>
            <span className="brand-tagline">{scope === "demo" ? "AI client intake, demo" : "AI client intake"}</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav-item"
              title={item.label}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <span className={`hours-flag${afterHours ? " is-after" : ""}`} role="status">
            <span className="flag-dot" aria-hidden="true" />
            <span className="flag-text">
              {afterHours ? (
                <>
                  After hours, <span className="flag-who">{onCall}</span> on intake
                </>
              ) : (
                <>Office open</>
              )}
            </span>
          </span>

          <div className="side-modes">
            <span className={`chip${lawmaticsMode === "live" ? " is-live" : ""}`}>
              <span className="chip-text">Lawmatics: {lawmaticsMode}</span>
            </span>
            <span className={`chip${smsMode === "twilio" ? " is-live" : ""}`}>
              <span className="chip-text">SMS: {smsMode === "twilio" ? "Twilio" : "preview"}</span>
            </span>
            <span className={`chip${outbound ? " is-live" : ""}`}>
              <span className="chip-text">Callback: {outbound ? "dialing" : "no number"}</span>
            </span>
          </div>

          {canReset ? (
            <button type="button" className="side-reset" onClick={onReset} disabled={resetting} title="Reset workspace">
              <svg className="side-reset-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
              </svg>
              <span className="side-reset-label">{resetting ? "Resetting" : scope === "demo" ? "Reset demo" : "Clear workspace"}</span>
              <span className="side-reset-hint">{scope === "demo" ? "Clears the pipeline and the log" : "Removes every lead, matter and message"}</span>
            </button>
          ) : null}

          {account ? <AccountChip account={account} /> : null}
        </div>
      </aside>

      <div className="stage">
        <header className="topbar">
          <div className="greet">
            <h1 className="greet-title">
              {mounted ? greetingForHour(new Date().getHours()) : "Welcome"}, {shortName}
            </h1>
            <p className="greet-sub">{tagline}</p>
          </div>

          {!state.connected ? (
            <span className="tag tag-warn" role="status">
              Reconnecting
            </span>
          ) : null}

          <div className="header-spacer" />

          <div className="header-controls">
            <button type="button" className="btn btn-quiet" onClick={() => setTheme(showingLight ? "dark" : "light")}>
              {showingLight ? "Dark" : "Light"}
            </button>

            <div className="avatar" aria-label={`On intake, ${onCall}`}>
              <span className="avatar-mark" aria-hidden="true">
                {onCall.slice(0, 1).toUpperCase()}
              </span>
              <span className="avatar-text">
                <span className="avatar-name">{onCall}</span>
                <span className="avatar-sub">{afterHours ? "On intake tonight" : "Intake desk"}</span>
              </span>
            </div>
          </div>
        </header>

        <main className="main">
          <div className="col col-intake">
            <CallPanel
              phase={call.phase}
              isLive={call.isLive}
              configured={configured}
            scope={scope}
              callId={call.callId}
              startedAt={call.startedAt}
              agentTalking={call.agentTalking}
              ringing={call.ringing}
              muted={call.muted}
              turns={call.turns}
              qualification={qualification}
              phoneNumber={phoneNumber}
              firmName={firmName}
              error={call.error}
              endedReason={call.endedReason}
              mode={mode}
              onModeChange={setMode}
              form={
                <IntakeForm
                  scope={scope}
                  consentText={call.config?.scripts.tcpaForm ?? SCRIPTS.tcpaForm}
                  outbound={outbound}
                  latestLead={focusLead ?? state.leads[0] ?? null}
                  onSubmitted={(id) => setFormLeadId(id)}
                />
              }
              onStart={() => {
                void call.start();
              }}
              onEnd={() => {
                void call.end();
              }}
              onToggleMute={call.toggleMute}
            />
          </div>

          <div className="col col-matter">
            <MatterPanel matters={state.matters} focus={focusMatter} staff={staff} stages={stages} loaded={state.loaded} />
            <FollowUpPanel tasks={state.tasks} messages={state.messages} consents={state.consents} staff={staff} smsMode={smsMode} />
          </div>

          <div className="col col-right col-speed">
            <SpeedPanel totals={state.totals} lead={focusLead} targetSeconds={targetSeconds} outbound={outbound} />
            <PipelinePanel events={state.pipeline} focusCallId={focusCallId} toolSignals={call.toolSignals} live={call.isLive} />
          </div>
        </main>
      </div>
    </div>
  );
}
