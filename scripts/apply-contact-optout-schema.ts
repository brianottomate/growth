/**
 * Exact additive DDL for the mirrored HubSpot email opt-out flag.
 *
 * Growth is still db:push-managed, so additive contact columns are applied
 * explicitly and idempotently rather than letting a broad interactive push
 * reconcile drift against a production database.
 *
 * Nullable on purpose: null means HubSpot has not told us this contact's
 * opt-out state, which is not the same as "cleared to email".
 *
 *   bun --conditions=react-server scripts/apply-contact-optout-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table leads.contact
    add column if not exists email_opt_out boolean
`);

console.log("leads.contact.email_opt_out is ready.");
