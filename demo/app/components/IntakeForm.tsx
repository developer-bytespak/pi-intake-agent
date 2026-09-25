"use client";

/**
 * The firm's web form, on the demo screen.
 *
 * The person giving the demo types their own mobile number, ticks the consent
 * box, and submits. With a phone number on the Retell account the agent dials
 * them back within seconds, and the stopwatch on the right stops when they
 * answer. Without one the form is still recorded, a text is composed and an
 * intake task opens, and the status line says exactly which happened.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { LeadRow } from "@/app/hooks/useDemoState";

export interface IntakeFormProps {
  /** Which workspace the lead lands in. */
  scope?: "demo" | "app";
  consentText: string;
  outbound: boolean;
  /** The most recent lead, so the form can show what happened to it. */
  latestLead: LeadRow | null;
  onSubmitted: (leadId: number) => void;
}

const EXAMPLE = "I was rear ended on I-275 near Fowler last Tuesday. My neck and back hurt and I went to the ER that night. The other driver got a ticket.";

function speed(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function IntakeForm({ scope = "demo", consentText, outbound, latestLead, onSubmitted }: IntakeFormProps) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const mine = submittedId !== null && latestLead && Number(latestLead.id) === submittedId ? latestLead : null;

  // A live stopwatch while the callback is being placed.
  useEffect(() => {
    if (!mine || mine.speed_ms !== null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 100);
    return () => window.clearInterval(id);
  }, [mine]);

  const waitingMs = useMemo(() => {
    if (!mine) return 0;
    void tick;
    return Date.now() - new Date(mine.created_at).getTime();
  }, [mine, tick]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/lead?scope=${scope}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ first_name: first, last_name: last, phone, email, description, consent }),
      });
      const json = (await res.json()) as { ok?: boolean; lead_id?: number; error?: string };
      if (!res.ok || !json.ok || !json.lead_id) throw new Error(json.error || `The form could not be sent (${res.status}).`);
      setSubmittedId(json.lead_id);
      onSubmitted(json.lead_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The form could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSubmittedId(null);
    setDescription("");
    setConsent(false);
  };

  if (mine) {
    const done = mine.speed_ms !== null;
    return (
      <div className="lead-result" aria-live="polite">
        <div className={`lead-clock${done ? " is-done" : ""}`}>
          <span className="lead-clock-label">{done ? "Lead contacted in" : mine.status === "calling" ? "Calling the lead" : "Working"}</span>
          <span className="lead-clock-n num">{speed(done ? Number(mine.speed_ms) : waitingMs)}</span>
        </div>
        <p className="lead-result-text">
          {mine.status === "calling" ? (
            <>
              <strong>Your phone should be ringing.</strong> Answer it and the intake agent takes it from there. The
              stopwatch stops the moment you pick up.
            </>
          ) : mine.status === "reached" ? (
            <>
              <strong>Answered.</strong> The rest of this screen is now following that call.
            </>
          ) : mine.status === "no_answer" ? (
            <>
              <strong>No answer.</strong> A text went out and an urgent task is on the intake desk, so the lead is not
              lost.
            </>
          ) : (
            <>
              <strong>No outbound number on this deployment.</strong> The lead was recorded, a text was composed with
              the firm's number, and an urgent task opened for the on call intake specialist. Add a Retell phone number
              and this same form rings the lead back instead.
            </>
          )}
        </p>
        <button type="button" className="btn" onClick={reset}>
          Send another
        </button>
      </div>
    );
  }

  return (
    <form className="lead-form" onSubmit={submit}>
      <p className="lead-form-intro">
        <strong>Were you injured?</strong> Tell us what happened and we will call you right away, day or night.
      </p>

      <div className="lead-grid">
        <label className="lead-field">
          <span>First name</span>
          <input value={first} onChange={(e) => setFirst(e.target.value)} required autoComplete="given-name" />
        </label>
        <label className="lead-field">
          <span>Last name</span>
          <input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
        </label>
        <label className="lead-field">
          <span>Mobile number</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="(813) 555 0100" autoComplete="tel" />
        </label>
        <label className="lead-field">
          <span>Email, optional</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </label>
      </div>

      <label className="lead-field">
        <span>What happened?</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required placeholder={EXAMPLE} />
      </label>

      <label className="lead-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>{consentText}</span>
      </label>

      {error ? (
        <p className="call-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-cta" disabled={busy || !consent}>
        {busy ? "Sending" : outbound ? "Send and get a call back now" : "Send"}
      </button>

      <p className="lead-form-note">
        {outbound
          ? "Use your own mobile. The intake agent dials it back within seconds and the stopwatch stops when you answer."
          : "No outbound number is attached yet, so the lead is recorded, texted and tasked rather than dialed."}
      </p>
    </form>
  );
}
