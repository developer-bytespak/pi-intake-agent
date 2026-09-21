/**
 * The narrow slice of Lawmatics the intake agent actually needs.
 *
 * Both the live REST client and the mock implement this, so the tool handlers
 * never know which one they are talking to. That is what lets the demo run
 * today with no accounts and flip to the firm's real Lawmatics by setting one
 * environment variable.
 *
 * Lawmatics objects, in their words: a Contact is the person, a Matter is the
 * case file, a Pipeline Stage is where the matter sits, Tags mark the source,
 * and a Task is a to-do assigned to a user. The mock keeps the same shapes.
 */

import type { Stage } from "../config";

export type ContactInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  source: string;
};

export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** True when we matched an existing record rather than creating one. */
  existing: boolean;
};

export type MatterInput = {
  contactId: string;
  caseType: string;
  incidentDate: string | null;
  incidentState: string | null;
  summary: string;
  treated: string;
  fault: string;
  policeReport: boolean | null;
  priorCounsel: string;
  qualification: Record<string, unknown>;
  score: number;
  stage: Stage;
  assignedTo: string;
  tags: string[];
  source: string;
  adverseParty?: string | null;
};

export type Matter = {
  id: string;
  /** The human reference the agent reads out, for example HP-2026-0412. */
  reference: string;
  stage: Stage;
  assignedTo: string;
};

export type TaskInput = {
  matterId: string | null;
  callId?: string | null;
  kind: "attorney_callback" | "conflict_review" | "referral" | "callback";
  assignedTo: string | null;
  dueAt: Date | null;
  priority: "urgent" | "high" | "normal";
  note: string;
};

export type MatterSummary = {
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
};

/**
 * Everything the intake agent can do to Lawmatics. Deliberately small: if a
 * tool needs something that is not here, it does not belong in a phone call.
 */
export interface LawmaticsGateway {
  readonly mode: "mock" | "live";

  /** Match on phone first, so a repeat caller is not duplicated. */
  findContactByPhone(phone: string): Promise<Contact | null>;
  createContact(input: ContactInput): Promise<Contact>;

  createMatter(input: MatterInput): Promise<Matter>;
  setStage(matterId: string, stage: Stage): Promise<void>;
  createTask(input: TaskInput): Promise<{ taskId: number | string }>;

  /** Names on the other side of open matters, for the conflict check. */
  conflictCheck(name: string): Promise<{ hit: boolean; matterReference?: string; role?: string }>;

  /** Drives the intake board. */
  listMatters(limit: number): Promise<MatterSummary[]>;
}
