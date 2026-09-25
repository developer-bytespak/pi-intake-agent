"use client";

/**
 * The single poll that feeds the whole screen.
 *
 * GET /api/state is asked roughly twice a second with the highest row id the
 * browser has already seen, so the pipeline, the messages and the consent log
 * append instead of redrawing and their animations stay smooth. Matters,
 * tasks and leads carry no cursor and are replaced wholesale, which is what
 * lets the board show a stage change as well as a new matter.
 *
 * Polling pauses while the tab is hidden and resumes the moment it comes back,
 * and a failed fetch is swallowed and retried. A demo laptop that sleeps in the
 * middle of a meeting reconnects on its own.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 700;
const RETRY_MS = 1400;
const MAX_ROWS = 400;

/** Postgres bigserial arrives as a string over the pg driver and a number over PGlite. */
export type RowId = number | string;

export type StaffTone = "gold" | "teal" | "violet" | "slate";
export type Stage = "new_lead" | "qualified" | "attorney_review" | "retainer_sent" | "signed" | "referred" | "declined";

export interface MatterRow {
  id: string;
  reference: string;
  contactName: string;
  caseType: string;
  stage: Stage;
  score: number;
  assignedTo: string | null;
  tags: string[];
  source: string;
  createdByAgent: boolean;
  createdAt: string;
  incidentDate: string | null;
  summary: string | null;
  qualification: Record<string, unknown> | null;
  flags: string[];
  treated: string | null;
  fault: string | null;
  policeReport: boolean | null;
  priorCounsel: string | null;
  incidentState: string | null;
}

export interface PipelineRow {
  id: RowId;
  occurred_at: string;
  call_id: string;
  step: string;
  status: string;
  detail: string | null;
  duration_ms: number | null;
}

export interface EventRow {
  id: RowId;
  occurred_at: string;
  call_id: string;
  action: string;
  outcome: string;
  detail: Record<string, unknown> | null;
}

export interface MessageRow {
  id: RowId;
  created_at: string;
  call_id: string | null;
  matter_id: string | null;
  to_address: string;
  to_label: string;
  channel: "sms" | "email" | "esign";
  subject: string | null;
  body: string;
  status: string;
  provider: string;
}

export interface ConsentRow {
  id: RowId;
  occurred_at: string;
  call_id: string | null;
  lead_id: RowId | null;
  kind: string;
  granted: boolean;
  script_version: string;
  phone_last4: string | null;
}

export interface TaskRow {
  id: RowId;
  created_at: string;
  matter_id: string | null;
  call_id: string | null;
  kind: string;
  assigned_to: string | null;
  due_at: string | null;
  priority: string;
  note: string | null;
  status: string;
  reference: string | null;
}

export interface LeadRow {
  id: RowId;
  created_at: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
  call_id: string | null;
  contacted_at: string | null;
  speed_ms: number | null;
  matter_id: string | null;
}

export interface CallRow {
  call_id: string;
  started_at: string;
  ended_at: string | null;
  channel: string;
  from_number: string | null;
  lead_id: RowId | null;
  qualification: string | null;
  outcome: string | null;
  after_hours: boolean;
  matter_id: string | null;
  fee_value: number | string | null;
  summary: string | null;
}

export interface Totals {
  calls_total: number;
  calls_after_hours: number;
  forms_total: number;
  qualified: number;
  declined: number;
  matters_by_agent: number;
  retainers_sent: number;
  fee_pipeline: number;
  tasks_open: number;
  avg_speed_ms: number | null;
  best_speed_ms: number | null;
}

export interface BoardStaff {
  id: string;
  name: string;
  firstName: string;
  role: "intake" | "attorney";
  title: string;
  tone: StaffTone;
}

export interface Board {
  staff: BoardStaff[];
  stages: { id: Stage; name: string }[];
  caseTypes: { id: string; name: string; accepted: boolean }[];
}

export interface FirmBadge {
  name: string;
  shortName: string;
  tagline: string;
  mainNumber: string;
  state: string;
}

export interface DemoMode {
  lawmatics: "mock" | "live";
  sms: "preview" | "twilio";
  esign: "preview" | "live";
  outbound: boolean;
  afterHours: boolean;
  onCall: string;
  onCallId: string;
  phoneNumber: string;
  speedTargetSeconds: number;
}

interface Cursors {
  pipeline: number;
  events: number;
  messages: number;
  consents: number;
}

interface StateResponse {
  firm: FirmBadge;
  mode: DemoMode;
  board: Board;
  matters: MatterRow[];
  tasks: TaskRow[];
  leads: LeadRow[];
  pipeline: PipelineRow[];
  events: EventRow[];
  messages: MessageRow[];
  consents: ConsentRow[];
  calls: CallRow[];
  totals: Partial<Totals>;
  cursors: Cursors;
}

export interface DemoState {
  firm: FirmBadge | null;
  mode: DemoMode | null;
  board: Board | null;
  matters: MatterRow[];
  tasks: TaskRow[];
  leads: LeadRow[];
  pipeline: PipelineRow[];
  events: EventRow[];
  messages: MessageRow[];
  consents: ConsentRow[];
  calls: CallRow[];
  totals: Totals;
  connected: boolean;
  loaded: boolean;
}

const EMPTY_TOTALS: Totals = {
  calls_total: 0,
  calls_after_hours: 0,
  forms_total: 0,
  qualified: 0,
  declined: 0,
  matters_by_agent: 0,
  retainers_sent: 0,
  fee_pipeline: 0,
  tasks_open: 0,
  avg_speed_ms: null,
  best_speed_ms: null,
};

const INITIAL: DemoState = {
  firm: null,
  mode: null,
  board: null,
  matters: [],
  tasks: [],
  leads: [],
  pipeline: [],
  events: [],
  messages: [],
  consents: [],
  calls: [],
  totals: EMPTY_TOTALS,
  connected: true,
  loaded: false,
};

function tail<T>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing;
  const next = existing.concat(incoming);
  return next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next;
}

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseTotals(totals: Partial<Totals> | undefined): Totals {
  if (!totals) return EMPTY_TOTALS;
  return {
    calls_total: n(totals.calls_total),
    calls_after_hours: n(totals.calls_after_hours),
    forms_total: n(totals.forms_total),
    qualified: n(totals.qualified),
    declined: n(totals.declined),
    matters_by_agent: n(totals.matters_by_agent),
    retainers_sent: n(totals.retainers_sent),
    fee_pipeline: n(totals.fee_pipeline),
    tasks_open: n(totals.tasks_open),
    avg_speed_ms: nOrNull(totals.avg_speed_ms),
    best_speed_ms: nOrNull(totals.best_speed_ms),
  };
}

export interface UseDemoState {
  state: DemoState;
  /** Drops every appended row and rewinds the cursors, for the reset button. */
  clear: () => void;
}

/** Which workspace the poll reads: the public demo, or the signed-in one. */
export type Scope = "demo" | "app";

export function useDemoState(scope: Scope = "demo"): UseDemoState {
  const [state, setState] = useState<DemoState>(INITIAL);
  const cursors = useRef<Cursors>({ pipeline: 0, events: 0, messages: 0, consents: 0 });
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current += 1;
    cursors.current = { pipeline: 0, events: 0, messages: 0, consents: 0 };
    setState((prev) => ({
      ...prev,
      matters: [],
      tasks: [],
      leads: [],
      pipeline: [],
      events: [],
      messages: [],
      consents: [],
      calls: [],
      totals: EMPTY_TOTALS,
    }));
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number) => {
      if (!alive) return;
      timer = setTimeout(run, ms);
    };

    async function run(): Promise<void> {
      if (!alive) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule(POLL_MS);
        return;
      }

      const mine = generation.current;
      const c = cursors.current;
      const url = `/api/state?scope=${scope}&pipeline=${c.pipeline}&events=${c.events}&messages=${c.messages}&consents=${c.consents}`;

      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`state responded ${response.status}`);
        const data = (await response.json()) as StateResponse;

        if (!alive || generation.current !== mine) {
          schedule(POLL_MS);
          return;
        }

        cursors.current = data.cursors;
        setState((prev) => ({
          firm: data.firm,
          mode: data.mode,
          board: data.board,
          matters: data.matters,
          tasks: data.tasks,
          leads: data.leads,
          pipeline: tail(prev.pipeline, data.pipeline),
          events: tail(prev.events, data.events),
          messages: tail(prev.messages, data.messages),
          consents: tail(prev.consents, data.consents),
          calls: data.calls,
          totals: normaliseTotals(data.totals),
          connected: true,
          loaded: true,
        }));
        schedule(POLL_MS);
      } catch {
        if (alive && generation.current === mine) {
          setState((prev) => (prev.connected ? { ...prev, connected: false } : prev));
        }
        schedule(RETRY_MS);
      }
    }

    const wake = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        if (timer) clearTimeout(timer);
        schedule(0);
      }
    };

    document.addEventListener("visibilitychange", wake);
    void run();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [scope]);

  return { state, clear };
}
