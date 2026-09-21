/**
 * Mock Lawmatics, backed by the demo database.
 *
 * It implements the same interface as the live client and obeys the same
 * rules that matter for the demo: contacts are matched before being created,
 * every matter gets a firm reference, the stage is a real pipeline stage, and
 * the conflict check reads the parties of open matters rather than a list
 * typed into a prompt.
 */

import { q } from "../db";
import { caseTypeById, type Stage } from "../config";
import type {
  Contact,
  ContactInput,
  LawmaticsGateway,
  Matter,
  MatterInput,
  MatterSummary,
  TaskInput,
} from "./types";

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** A date column comes back as a Date from both drivers; the board wants YYYY-MM-DD in local time. */
function dateOnly(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : dateOnly(new Date(s));
}

export class MockLawmatics implements LawmaticsGateway {
  readonly mode = "mock" as const;

  async findContactByPhone(phone: string): Promise<Contact | null> {
    const digits = String(phone ?? "").replace(/\D/g, "").slice(-10);
    if (digits.length < 10) return null;

    const rows = await q<{ id: string; first_name: string; last_name: string; phone: string }>(
      `select id, first_name, last_name, phone from demo_contacts
       where right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $1 limit 1`,
      [digits],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, firstName: r.first_name, lastName: r.last_name, phone: r.phone, existing: true };
  }

  async createContact(input: ContactInput): Promise<Contact> {
    const existing = await this.findContactByPhone(input.phone);
    if (existing) return existing;

    const id = `con_${Date.now().toString(36)}`;
    await q(
      `insert into demo_contacts (id, first_name, last_name, phone, email, source, created_by_agent)
       values ($1,$2,$3,$4,$5,$6,true)`,
      [id, input.firstName, input.lastName, input.phone, input.email ?? null, input.source],
    );
    return { id, firstName: input.firstName, lastName: input.lastName, phone: input.phone, existing: false };
  }

  async createMatter(input: MatterInput): Promise<Matter> {
    const id = `mat_${Date.now().toString(36)}`;
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from demo_matters`);
    const reference = `HP-${new Date().getFullYear()}-${String(412 + Number(n) - 8).padStart(4, "0")}`;

    await q(
      `insert into demo_matters
         (id, reference, contact_id, case_type, incident_date, incident_state, summary,
          treated, fault, police_report, prior_counsel, qualification, score, stage,
          assigned_to, tags, source, created_by_agent)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)`,
      [
        id,
        reference,
        input.contactId,
        input.caseType,
        input.incidentDate,
        input.incidentState,
        input.summary,
        input.treated,
        input.fault,
        input.policeReport,
        input.priorCounsel,
        JSON.stringify(input.qualification),
        input.score,
        input.stage,
        input.assignedTo,
        input.tags,
        input.source,
      ],
    );

    const contact = await q<{ first_name: string; last_name: string }>(
      `select first_name, last_name from demo_contacts where id = $1`,
      [input.contactId],
    );
    if (contact[0]) {
      await q(`insert into demo_parties (matter_id, name, role) values ($1,$2,'client')`, [
        id,
        `${contact[0].first_name} ${contact[0].last_name}`,
      ]);
    }
    if (input.adverseParty) {
      await q(`insert into demo_parties (matter_id, name, role) values ($1,$2,'adverse')`, [id, input.adverseParty]);
    }

    return { id, reference, stage: input.stage, assignedTo: input.assignedTo };
  }

  async setStage(matterId: string, stage: Stage): Promise<void> {
    await q(`update demo_matters set stage = $2, updated_at = now() where id = $1`, [matterId, stage]);
  }

  async createTask(input: TaskInput): Promise<{ taskId: number | string }> {
    const rows = await q<{ id: number }>(
      `insert into demo_tasks (matter_id, call_id, kind, assigned_to, due_at, priority, note)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [
        input.matterId,
        input.callId ?? null,
        input.kind,
        input.assignedTo,
        input.dueAt ? input.dueAt.toISOString() : null,
        input.priority,
        input.note,
      ],
    );
    return { taskId: rows[0]?.id ?? 0 };
  }

  async conflictCheck(name: string): Promise<{ hit: boolean; matterReference?: string; role?: string }> {
    const key = letters(name);
    if (key.length < 4) return { hit: false };

    const rows = await q<{ name: string; role: string; reference: string | null }>(
      `select p.name, p.role, m.reference from demo_parties p
       left join demo_matters m on m.id = p.matter_id
       where m.stage not in ('declined','referred') or m.stage is null`,
    );
    // A conflict is any open matter where this name is already a party, on
    // either side. The intake manager decides what it means; the agent only
    // knows to stop.
    const hit = rows.find((r) => {
      const other = letters(r.name);
      return other === key || (key.length >= 6 && (other.includes(key) || key.includes(other)));
    });
    if (!hit) return { hit: false };
    return { hit: true, matterReference: hit.reference ?? undefined, role: hit.role };
  }

  async listMatters(limit: number): Promise<MatterSummary[]> {
    const rows = await q<{
      id: string;
      reference: string;
      case_type: string;
      stage: Stage;
      score: number;
      assigned_to: string | null;
      tags: string[];
      source: string;
      created_by_agent: boolean;
      created_at: string;
      incident_date: string | Date | null;
      summary: string | null;
      qualification: Record<string, unknown> | null;
      treated: string | null;
      fault: string | null;
      police_report: boolean | null;
      prior_counsel: string | null;
      incident_state: string | null;
      first_name: string | null;
      last_name: string | null;
    }>(
      `select m.id, m.reference, m.case_type, m.stage, m.score, m.assigned_to, m.tags, m.source,
              m.created_by_agent, m.created_at, m.incident_date, m.summary, m.qualification,
              m.treated, m.fault, m.police_report, m.prior_counsel, m.incident_state,
              c.first_name, c.last_name
       from demo_matters m
       left join demo_contacts c on c.id = m.contact_id
       order by m.created_at desc limit $1`,
      [limit],
    );

    return rows.map((r) => {
      const qual = r.qualification && typeof r.qualification === "object" ? r.qualification : null;
      const flags = Array.isArray(qual?.flags) ? (qual!.flags as string[]) : [];
      return {
        id: r.id,
        reference: r.reference,
        // Surname stays as an initial on the board. Intake needs who, not everything.
        contactName:
          [r.first_name, r.last_name ? `${r.last_name[0]}.` : null].filter(Boolean).join(" ") || "Lead",
        caseType: caseTypeById(r.case_type)?.name ?? r.case_type,
        stage: r.stage,
        score: Number(r.score) || 0,
        assignedTo: r.assigned_to,
        tags: r.tags ?? [],
        source: r.source,
        createdByAgent: Boolean(r.created_by_agent),
        createdAt: new Date(r.created_at).toISOString(),
        incidentDate: dateOnly(r.incident_date),
        summary: r.summary,
        qualification: qual,
        flags,
        treated: r.treated,
        fault: r.fault,
        policeReport: r.police_report,
        priorCounsel: r.prior_counsel,
        incidentState: r.incident_state,
      };
    });
  }
}
