#!/usr/bin/env tsx
/**
 * Resets and reseeds the demo database from the command line.
 *
 *   npm run seed
 *
 * Works against PGlite locally and against Postgres when DATABASE_URL is set.
 */

import { q, resetDemo } from "./db";
import { lawmatics } from "./lawmatics";
import { smsMode } from "./messages";

async function main() {
  await resetDemo();
  const [counts] = await q<{ contacts: number; matters: number; tasks: number }>(
    `select (select count(*)::int from demo_contacts) as contacts,
            (select count(*)::int from demo_matters)  as matters,
            (select count(*)::int from demo_tasks)    as tasks`,
  );
  console.log(
    `Seeded. Lawmatics: ${lawmatics().mode}, SMS: ${smsMode()}. ` +
      `${counts.contacts} contacts, ${counts.matters} matters, ${counts.tasks} open tasks.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
