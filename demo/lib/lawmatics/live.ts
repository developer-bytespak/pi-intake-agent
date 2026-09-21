/**
 * Live Lawmatics client, REST.
 *
 * Lawmatics exposes a REST API at api.lawmatics.com with a bearer token issued
 * per firm (OAuth for marketplace apps, a personal token for a single firm).
 * The endpoints below follow their documented resource names: contacts,
 * matters, pipeline stages, tags and tasks. Field ids for custom fields and
 * the pipeline stage ids are per firm, so they come from the environment
 * rather than being hard coded.
 *
 * This client is intentionally thin and untested against a real account: the
 * demo runs on the mock, and this is the shape the production build fills in
 * once the firm's token and stage ids are available. Each method degrades to
 * the same result type as the mock, so the tool handlers do not change.
 */

import { MockLawmatics } from "./mock";
import type {
  Contact,
  ContactInput,
  LawmaticsGateway,
  Matter,
  MatterInput,
  MatterSummary,
  TaskInput,
} from "./types";
import type { Stage } from "../config";

const BASE = process.env.LAWMATICS_BASE_URL ?? "https://api.lawmatics.com/v1";

async function lm<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.LAWMATICS_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Lawmatics ${method} ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/** Stage ids differ per firm. LAWMATICS_STAGE_MAP="new_lead:123,qualified:124,..." */
function stageId(stage: Stage): string | null {
  const map = process.env.LAWMATICS_STAGE_MAP ?? "";
  const pair = map.split(",").map((p) => p.trim().split(":")).find((p) => p[0] === stage);
  return pair?.[1] ?? null;
}

export class LiveLawmatics implements LawmaticsGateway {
  readonly mode = "live" as const;
  /** The board still reads from the demo tables, so the screen keeps working while writes go to Lawmatics. */
  private mirror = new MockLawmatics();

  async findContactByPhone(phone: string): Promise<Contact | null> {
    const res = await lm<{ data?: { id: string; attributes: { first_name: string; last_name: string; phone: string } }[] }>(
      "GET",
      `/contacts?filter[phone]=${encodeURIComponent(phone)}`,
    );
    const hit = res.data?.[0];
    if (!hit) return null;
    return {
      id: hit.id,
      firstName: hit.attributes.first_name,
      lastName: hit.attributes.last_name,
      phone: hit.attributes.phone,
      existing: true,
    };
  }

  async createContact(input: ContactInput): Promise<Contact> {
    const existing = await this.findContactByPhone(input.phone);
    if (existing) return existing;
    const res = await lm<{ data: { id: string } }>("POST", "/contacts", {
      data: {
        type: "contacts",
        attributes: {
          first_name: input.firstName,
          last_name: input.lastName,
          phone: input.phone,
          email: input.email ?? undefined,
          lead_source: input.source,
        },
      },
    });
    await this.mirror.createContact(input);
    return { id: res.data.id, firstName: input.firstName, lastName: input.lastName, phone: input.phone, existing: false };
  }

  async createMatter(input: MatterInput): Promise<Matter> {
    const res = await lm<{ data: { id: string; attributes?: { case_number?: string } } }>("POST", "/matters", {
      data: {
        type: "matters",
        attributes: {
          contact_id: input.contactId,
          practice_area: input.caseType,
          description: input.summary,
          pipeline_stage_id: stageId(input.stage) ?? undefined,
          tags: input.tags,
          assigned_to_id: process.env.LAWMATICS_INTAKE_USER_ID ?? undefined,
        },
      },
    });
    const mirrored = await this.mirror.createMatter(input);
    return {
      id: res.data.id,
      reference: res.data.attributes?.case_number ?? mirrored.reference,
      stage: input.stage,
      assignedTo: input.assignedTo,
    };
  }

  async setStage(matterId: string, stage: Stage): Promise<void> {
    const id = stageId(stage);
    if (id) {
      await lm("PATCH", `/matters/${matterId}`, { data: { type: "matters", attributes: { pipeline_stage_id: id } } });
    }
  }

  async createTask(input: TaskInput): Promise<{ taskId: number | string }> {
    const res = await lm<{ data: { id: string } }>("POST", "/tasks", {
      data: {
        type: "tasks",
        attributes: {
          name: input.note.slice(0, 120),
          description: input.note,
          due_date: input.dueAt ? input.dueAt.toISOString() : undefined,
          priority: input.priority,
          matter_id: input.matterId ?? undefined,
          assigned_to_id: process.env.LAWMATICS_ATTORNEY_USER_ID ?? undefined,
        },
      },
    });
    await this.mirror.createTask(input);
    return { taskId: res.data.id };
  }

  async conflictCheck(name: string) {
    // Lawmatics has no conflict endpoint. The production build searches
    // contacts and the matter "adverse party" custom field. Until the field
    // id is known, the mirror's party table is the source.
    return this.mirror.conflictCheck(name);
  }

  async listMatters(limit: number): Promise<MatterSummary[]> {
    return this.mirror.listMatters(limit);
  }
}
