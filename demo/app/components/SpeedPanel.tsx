"use client";

/**
 * The number the listing is judged by.
 *
 * Speed to lead is the hero: the seconds between a lead arriving and a
 * conversation starting. A phone call is answered on the first ring, so its
 * number is effectively zero and the stopwatch only has something to say for
 * a web form. The tiles underneath are what an intake manager counts at the
 * end of a night.
 */

import { useEffect, useMemo, useState } from "react";
import type { LeadRow, Totals } from "@/app/hooks/useDemoState";

export interface SpeedPanelProps {
  totals: Totals;
  /** The web form lead the screen is following, if any. */
  lead: LeadRow | null;
  targetSeconds: number;
  outbound: boolean;
}

function fmt(ms: number | null): string {
  if (ms === null) return "–";
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function SpeedPanel({ totals, lead, targetSeconds, outbound }: SpeedPanelProps) {
  const [tick, setTick] = useState(0);
  const running = Boolean(lead && lead.speed_ms === null && (lead.status === "calling" || lead.status === "received"));

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 100);
    return () => window.clearInterval(id);
  }, [running]);

  const hero = useMemo(() => {
    void tick;
    if (lead && lead.speed_ms !== null) {
      const ms = Number(lead.speed_ms);
      return { label: lead.status === "reached" ? "Lead on the phone in" : "Lead texted and tasked in", value: fmt(ms), tone: ms <= targetSeconds * 1000 ? "ok" : "warn" };
    }
    if (lead && running) {
      return { label: lead.status === "calling" ? "Dialing the lead" : "Working the lead", value: fmt(Date.now() - new Date(lead.created_at).getTime()), tone: "live" };
    }
    if (totals.best_speed_ms !== null) {
      return { label: "Fastest contact tonight", value: fmt(totals.best_speed_ms), tone: totals.best_speed_ms <= targetSeconds * 1000 ? "ok" : "warn" };
    }
    return { label: "Target speed to lead", value: `< ${targetSeconds}s`, tone: "idle" };
  }, [lead, running, tick, totals.best_speed_ms, targetSeconds]);

  const money = useMemo(() => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }), []);

  return (
    <section className="panel" aria-label="Speed to lead">
      <div className="panel-head">
        <h2 className="panel-title">Speed to lead</h2>
        <p className="panel-sub">Since the last reset</p>
        <div className="panel-head-end">
          <span className={`tag${totals.matters_by_agent > 0 ? " tag-ok" : ""} num`}>
            {totals.calls_total + totals.forms_total} {totals.calls_total + totals.forms_total === 1 ? "lead" : "leads"}
          </span>
        </div>
      </div>

      <div className="panel-body">
        <div className="rev">
          <div className={`rev-hero speed-${hero.tone}`}>
            <span className="rev-hero-label">{hero.label}</span>
            <span className="rev-hero-n num" aria-live="polite">
              {hero.value}
            </span>
            <span className="speed-target">
              Target under {targetSeconds} seconds. {outbound ? "Web forms are dialed back automatically." : "Phone calls answer on the first ring; add a number and web forms are dialed back too."}
            </span>
          </div>

          <div className="counts">
            <div className="count">
              <span className="count-n num">{totals.calls_after_hours}</span>
              <span className="count-l">After hours calls</span>
            </div>
            <div className="count">
              <span className="count-n num">{totals.qualified}</span>
              <span className="count-l">Qualified</span>
            </div>
            <div className="count">
              <span className="count-n num">{totals.retainers_sent}</span>
              <span className="count-l">Retainers sent</span>
            </div>
            <div className="count is-accent">
              <span className="count-n num">{money.format(totals.fee_pipeline)}</span>
              <span className="count-l">Fee value opened</span>
            </div>
          </div>

          <p className="rev-caption">
            Fee value is an estimate from the firm's typical fee per case type, never spoken to a caller. Swap in
            real averages and the figure follows.
          </p>
        </div>
      </div>
    </section>
  );
}
