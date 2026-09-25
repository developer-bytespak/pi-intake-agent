/**
 * Demo database schema.
 *
 * The demo_* tables stand in for Lawmatics when the mock gateway is active:
 * contacts, matters, pipeline stages, tags, tasks. The pipeline_events,
 * call_events, consent_events and outbound_messages tables are ours either
 * way, because the firm wants a record of what the agent did regardless of
 * where the matter landed.
 *
 * Every table carries tenant_id. The demo tenant owns the public page; each
 * firm created from the admin console owns its own rows. See lib/tenancy.ts.
 *
 * Kept as a TypeScript string so it bundles into serverless functions with no
 * file system access at runtime. Every statement is idempotent and the
 * "alter table" lines migrate a database created before tenancy in place.
 */

export const SCHEMA_SQL = `
-- ---------- tenancy ----------
-- One row per customer. The demo tenant is created at bootstrap and backs
-- the public page; every other row is created from the admin console.

create table if not exists tenants (
  id               text primary key,
  name             text not null,
  short_name       text not null,
  tagline          text,
  main_number      text,
  timezone         text not null default 'America/New_York',
  plan             text not null default 'trial',
  included_minutes integer not null default 0,
  status           text not null default 'invited',   -- invited, active, suspended
  retell_agent_id  text,
  phone_number     text,
  config           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists tenants_agent on tenants (retell_agent_id) where retell_agent_id is not null;

create table if not exists memberships (
  id                  bigserial primary key,
  tenant_id           text not null references tenants (id) on delete cascade,
  email               text not null,
  name                text,
  role                text not null default 'owner',     -- owner, staff
  clerk_user_id       text,
  clerk_invitation_id text,
  invite_status       text not null default 'pending',   -- pending, sent, accepted, failed
  invite_error        text,
  invited_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  unique (tenant_id, email)
);
create index if not exists memberships_user on memberships (clerk_user_id);

-- ---------- stand-in for Lawmatics ----------

create table if not exists demo_contacts (
  id               text primary key,
  tenant_id        text not null default 'demo',
  first_name       text not null,
  last_name        text not null,
  phone            text not null,
  email            text,
  source           text not null default 'phone',
  created_by_agent boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists demo_contacts_phone on demo_contacts (phone);

create table if not exists demo_matters (
  id               text primary key,
  tenant_id        text not null default 'demo',
  reference        text not null,
  contact_id       text not null,
  case_type        text not null,
  incident_date    date,
  incident_state   text,
  summary          text,
  treated          text,
  fault            text,
  police_report    boolean,
  prior_counsel    text,
  qualification    jsonb,
  score            integer not null default 0,
  stage            text not null default 'new_lead',
  assigned_to      text,
  tags             text[] not null default '{}',
  source           text not null default 'phone',
  created_by_agent boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists demo_matters_created_at on demo_matters (created_at);

-- Every person connected to a matter, for the conflict check. A new caller
-- is checked against the adverse parties of open matters and vice versa.
create table if not exists demo_parties (
  id         bigserial primary key,
  tenant_id        text not null default 'demo',
  matter_id  text,
  name       text not null,
  role       text not null,               -- client, adverse, witness
  created_at timestamptz not null default now()
);

create table if not exists demo_tasks (
  id          bigserial primary key,
  tenant_id        text not null default 'demo',
  created_at  timestamptz not null default now(),
  matter_id   text,
  call_id     text,
  kind        text not null,              -- attorney_callback, conflict_review, referral, callback
  assigned_to text,
  due_at      timestamptz,
  priority    text not null default 'normal',
  note        text,
  status      text not null default 'open'
);
create index if not exists demo_tasks_created_at on demo_tasks (created_at);

-- ---------- web form leads and the stopwatch ----------

create table if not exists demo_leads (
  id            bigserial primary key,
  tenant_id        text not null default 'demo',
  created_at    timestamptz not null default now(),
  first_name    text not null,
  last_name     text not null,
  phone         text not null,
  email         text,
  description   text not null,
  consent_call  boolean not null default false,
  consent_at    timestamptz,
  status        text not null default 'received',  -- received, calling, reached, no_answer, no_number
  call_id       text,
  contacted_at  timestamptz,
  speed_ms      integer,
  matter_id     text
);

-- ---------- ours, regardless of where the matter lands ----------

create table if not exists call_events (
  id            bigserial primary key,
  tenant_id        text not null default 'demo',
  occurred_at   timestamptz not null default now(),
  call_id       text not null,
  action        text not null,
  outcome       text not null,
  detail        jsonb
);
create index if not exists call_events_call_id on call_events (call_id);

create table if not exists pipeline_events (
  id          bigserial primary key,
  tenant_id        text not null default 'demo',
  occurred_at timestamptz not null default now(),
  call_id     text not null,
  step        text not null,
  status      text not null,          -- running, ok, warn, error
  detail      text,
  duration_ms integer
);
create index if not exists pipeline_events_call_id on pipeline_events (call_id);

-- Consent and disclosure, written the moment it happens with the script
-- version, so the firm can show which words were said on which call.
create table if not exists consent_events (
  id             bigserial primary key,
  tenant_id        text not null default 'demo',
  occurred_at    timestamptz not null default now(),
  call_id        text,
  lead_id        bigint,
  kind           text not null,      -- recording_disclosure, ai_disclosure, sms_opt_in, tcpa_form
  granted        boolean not null,
  script_version text not null,
  phone_last4    text
);
create index if not exists consent_events_call_id on consent_events (call_id);

-- Every text, email and e-sign link the agent would send. While Twilio and the
-- e-sign provider are not connected these are queued rather than sent.
create table if not exists outbound_messages (
  id          bigserial primary key,
  tenant_id        text not null default 'demo',
  created_at  timestamptz not null default now(),
  call_id     text,
  matter_id   text,
  to_address  text not null,
  to_label    text not null,          -- lead, attorney, intake
  channel     text not null default 'sms',   -- sms, email, esign
  subject     text,
  body        text not null,
  status      text not null default 'queued',  -- queued, sent, failed
  provider    text not null default 'preview',
  provider_id text,
  error       text
);
create index if not exists outbound_messages_created_at on outbound_messages (created_at);

create table if not exists demo_calls (
  call_id       text primary key,
  tenant_id        text not null default 'demo',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  channel       text not null default 'web',   -- web, phone, outbound
  from_number   text,
  lead_id       bigint,
  qualification text,
  outcome       text,
  after_hours   boolean not null default false,
  matter_id     text,
  fee_value     numeric(10,2),
  summary       text
);

-- ---------- migration for databases created before tenancy ----------
alter table demo_contacts add column if not exists tenant_id text not null default 'demo';
alter table demo_matters add column if not exists tenant_id text not null default 'demo';
alter table demo_parties add column if not exists tenant_id text not null default 'demo';
alter table demo_tasks add column if not exists tenant_id text not null default 'demo';
alter table demo_leads add column if not exists tenant_id text not null default 'demo';
alter table call_events add column if not exists tenant_id text not null default 'demo';
alter table pipeline_events add column if not exists tenant_id text not null default 'demo';
alter table consent_events add column if not exists tenant_id text not null default 'demo';
alter table outbound_messages add column if not exists tenant_id text not null default 'demo';
alter table demo_calls add column if not exists tenant_id text not null default 'demo';
create index if not exists demo_contacts_tenant on demo_contacts (tenant_id);
create index if not exists demo_matters_tenant on demo_matters (tenant_id, created_at);
create index if not exists demo_tasks_tenant on demo_tasks (tenant_id, created_at);
create index if not exists demo_leads_tenant on demo_leads (tenant_id, created_at);
create index if not exists call_events_tenant on call_events (tenant_id, id);
create index if not exists pipeline_events_tenant on pipeline_events (tenant_id, id);
create index if not exists consent_events_tenant on consent_events (tenant_id, id);
create index if not exists outbound_messages_tenant on outbound_messages (tenant_id, id);
create index if not exists demo_calls_tenant on demo_calls (tenant_id, started_at);
`;

/** The tables that hold a tenant's data, in an order safe to clear. */
export const TENANT_TABLES = [
  "pipeline_events",
  "call_events",
  "consent_events",
  "outbound_messages",
  "demo_calls",
  "demo_leads",
  "demo_tasks",
  "demo_parties",
  "demo_matters",
  "demo_contacts",
] as const;
