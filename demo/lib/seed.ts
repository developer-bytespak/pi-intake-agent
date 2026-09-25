/**
 * Seeds a believable intake pipeline for a mid sized injury firm.
 *
 * Every person here is invented. The pipeline is deliberately busy but not
 * full, and one existing client's adverse party is a name the demo caller can
 * give, so the conflict check has something to hit.
 */

import { raw } from "./db";
import { CASE_TYPES, STAFF, type Stage } from "./config";

export const DEMO_CONTACTS = [
  // Existing clients. The demo caller is nobody on this list, which is the
  // normal case: a new lead. Use the phone numbers to show a repeat caller.
  { id: "con_001", first: "Renata", last: "Villalobos", phone: "+18135550151", email: "renata.v@example.com" },
  { id: "con_002", first: "Marcus", last: "Bell", phone: "+18135550162", email: "mbell@example.com" },
  { id: "con_003", first: "Aisha", last: "Rahman", phone: "+18135550173", email: "aisha.r@example.com" },
  { id: "con_004", first: "Tomás", last: "Herrera", phone: "+18135550184", email: null },
  { id: "con_005", first: "Gwen", last: "Talbot", phone: "+18135550195", email: "gtalbot@example.com" },
  { id: "con_006", first: "Devon", last: "Pruitt", phone: "+18135550106", email: null },
  { id: "con_007", first: "Ingrid", last: "Solberg", phone: "+18135550117", email: "ingrid.s@example.com" },
  { id: "con_008", first: "Caleb", last: "Nwosu", phone: "+18135550128", email: null },
];

/**
 * Open matters, with the party on the other side. "Brightline Logistics" is
 * the adverse party to give during the demo to trigger the conflict check:
 * the firm is already suing them for Marcus Bell, so a caller who wants to
 * sue them too can be taken, but a caller who works for them cannot.
 */
const SEED_MATTERS: {
  id: string;
  ref: string;
  contact: string;
  caseType: string;
  daysAgo: number;
  stage: Stage;
  assigned: string;
  adverse: string;
  summary: string;
}[] = [
  { id: "mat_001", ref: "HP-2026-0388", contact: "con_001", caseType: "auto", daysAgo: 41, stage: "signed", assigned: "st_castellano", adverse: "Dale Kirchner", summary: "Rear ended on I-275 at Fowler, neck and back, ER visit same day." },
  { id: "mat_002", ref: "HP-2026-0391", contact: "con_002", caseType: "auto", daysAgo: 33, stage: "signed", assigned: "st_okoro", adverse: "Brightline Logistics", summary: "Box truck ran a red on Dale Mabry, fractured wrist, surgery scheduled." },
  { id: "mat_003", ref: "HP-2026-0396", contact: "con_003", caseType: "premises", daysAgo: 19, stage: "retainer_sent", assigned: "st_castellano", adverse: "Sunbay Grocers Inc", summary: "Slipped on unmarked wet floor, knee injury, incident report filed at the store." },
  { id: "mat_004", ref: "HP-2026-0402", contact: "con_004", caseType: "dog_bite", daysAgo: 12, stage: "attorney_review", assigned: "st_okoro", adverse: "Patricia Lund", summary: "Bitten on forearm by neighbour's dog, urgent care, stitches." },
  { id: "mat_005", ref: "HP-2026-0405", contact: "con_005", caseType: "auto", daysAgo: 8, stage: "qualified", assigned: "st_whitlock", adverse: "Unknown driver, hit and run", summary: "Hit and run in a parking lot, uninsured motorist claim likely." },
  { id: "mat_006", ref: "HP-2026-0407", contact: "con_006", caseType: "premises", daysAgo: 5, stage: "qualified", assigned: "st_ferreira", adverse: "Riverwalk Apartments LLC", summary: "Fell on broken stair at apartment complex, ankle fracture." },
  { id: "mat_007", ref: "HP-2026-0409", contact: "con_007", caseType: "product", daysAgo: 3, stage: "new_lead", assigned: "st_whitlock", adverse: "Volta Home Appliances", summary: "Space heater caught fire, burns to hand, product kept." },
  { id: "mat_008", ref: "HP-2026-0411", contact: "con_008", caseType: "auto", daysAgo: 1, stage: "new_lead", assigned: "st_ferreira", adverse: "Sofia Marin", summary: "Side impact at a four way stop, shoulder pain, saw a chiropractor." },
];

function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export async function seed(tenantId = "demo"): Promise<void> {
  for (const c of DEMO_CONTACTS) {
    await raw(
      `insert into demo_contacts (id, first_name, last_name, phone, email, source, tenant_id)
       values ($1,$2,$3,$4,$5,'phone',$6) on conflict (id) do nothing`,
      [c.id, c.first, c.last, c.phone, c.email, tenantId],
    );
  }

  for (const m of SEED_MATTERS) {
    const type = CASE_TYPES.find((c) => c.id === m.caseType)!;
    const contact = DEMO_CONTACTS.find((c) => c.id === m.contact)!;
    const incident = daysAgo(m.daysAgo + 4);
    const created = daysAgo(m.daysAgo);
    const score = m.stage === "signed" ? 88 : m.stage === "retainer_sent" ? 82 : m.stage === "attorney_review" ? 61 : 74;

    await raw(
      `insert into demo_matters
         (id, reference, contact_id, case_type, incident_date, incident_state, summary,
          treated, fault, police_report, prior_counsel, qualification, score, stage,
          assigned_to, tags, source, created_at, updated_at, tenant_id)
       values ($1,$2,$3,$4,$5,'FL',$6,'yes','other',true,'no',$7,$8,$9,$10,$11,'phone',$12,$12,$13)
       on conflict (id) do nothing`,
      [
        m.id,
        m.ref,
        m.contact,
        m.caseType,
        incident.toISOString().slice(0, 10),
        m.summary,
        JSON.stringify({ status: "qualified", score, reasons: ["Seeded matter"], flags: [] }),
        score,
        m.stage,
        m.assigned,
        [type.name, "Phone"],
        created.toISOString(),
        tenantId,
      ],
    );

    await raw(`insert into demo_parties (matter_id, name, role, tenant_id) values ($1,$2,'client',$3)`, [
      m.id,
      `${contact.first} ${contact.last}`,
      tenantId,
    ]);
    await raw(`insert into demo_parties (matter_id, name, role, tenant_id) values ($1,$2,'adverse',$3)`, [m.id, m.adverse, tenantId]);
  }

  // A couple of open tasks so the follow up panel is not empty before the first call.
  const attorney = STAFF.find((s) => s.role === "attorney")!;
  await raw(
    `insert into demo_tasks (matter_id, kind, assigned_to, due_at, priority, note, status, created_at, tenant_id)
     values ('mat_004','attorney_callback',$1,$2,'normal','Review dog bite intake, owner identified.','open',$3,$4)`,
    [attorney.id, daysAgo(0, 15).toISOString(), daysAgo(1, 9).toISOString(), tenantId],
  );
  await raw(
    `insert into demo_tasks (matter_id, kind, assigned_to, due_at, priority, note, status, created_at, tenant_id)
     values ('mat_007','attorney_callback',$1,$2,'normal','Product liability, confirm the heater is preserved.','open',$3,$4)`,
    [attorney.id, daysAgo(0, 16).toISOString(), daysAgo(0, 8).toISOString(), tenantId],
  );
}
