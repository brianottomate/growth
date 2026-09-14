/**
 * Exact additive DDL for the demand-sales HubSpot link table
 * (src/server/db/demand-schema.ts).
 *
 * Development and production currently share one Neon database, so this is an
 * intentional production operation. It is idempotent and additive; do not
 * replace it with a broad unattended `drizzle-kit push`.
 *
 *   bun --conditions=react-server scripts/apply-demand-crm-link-schema.ts
 */
import { applyDemandCrmLinkSchema } from "@/server/services/demand/schema-apply";

await applyDemandCrmLinkSchema();
console.log("Demand CRM link schema is ready.");
