/**
 * Link pass: match every leads.lead_domain against HubSpot companies by exact
 * domain and store the real hubspotRecordId + live CRM signals. This replaces
 * the stale CSV-snapshot inHubspot flags with ground truth — step 1 of the
 * /leads ↔ HubSpot sync (docs/hubspot-gateway-plan.md).
 *
 *   bun run --conditions=react-server scripts/link-leads-hubspot.ts [--limit N]
 *
 * Read-only against HubSpot (batch domain search, throttled to ~2 req/s so
 * wander.com's live inbound flow keeps rate-limit headroom); writes only to
 * our own leads.lead_domain columns. Rules:
 *   - matched:   hubspotRecordId, hubspotLeadStatus, hubspotOwner (resolved
 *                name), isExistingCustomer (lifecyclestage=customer), inHubspot=true
 *   - unmatched: inHubspot=false ONLY where no hubspotRecordId exists (links
 *                set by trusted paths like applyMerge are preserved)
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/schema";
import {
  findCompaniesByDomains,
  HS_OWNER_NAMES,
  resolveHsLabel,
} from "@/server/clients/hubspot.client";

const CHUNK = 80; // one search request per chunk (client chunks at 80 too)
const THROTTLE_MS = 500; // ~2 req/s of the shared 5 req/s search budget
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const limitArg = process.argv.indexOf("--limit");
const LIMIT =
  limitArg > -1 ? Number(process.argv[limitArg + 1]) || undefined : undefined;

type Update = {
  id: string;
  recordId: string;
  leadStatus: string | null;
  owner: string | null;
  isCustomer: boolean;
};

async function bulkApplyMatches(rows: Update[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000);
    await db.execute(sql`
      UPDATE leads.domain AS d
      SET hubspot_record_id = v.record_id,
          hubspot_lead_status = v.lead_status,
          hubspot_owner = v.owner,
          is_existing_customer = v.is_customer,
          in_hubspot = true,
          updated_at = now()
      FROM (
        SELECT unnest(${sql.raw(`ARRAY[${batch.map((r) => `'${r.id}'`).join(",")}]`)}) AS id,
               unnest(${sql.raw(`ARRAY[${batch.map((r) => `'${r.recordId}'`).join(",")}]`)}) AS record_id,
               unnest(${sql.raw(`ARRAY[${batch.map((r) => (r.leadStatus ? `'${r.leadStatus.replace(/'/g, "''")}'` : "NULL")).join(",")}]::text[]`)}) AS lead_status,
               unnest(${sql.raw(`ARRAY[${batch.map((r) => (r.owner ? `'${r.owner.replace(/'/g, "''")}'` : "NULL")).join(",")}]::text[]`)}) AS owner,
               unnest(${sql.raw(`ARRAY[${batch.map((r) => r.isCustomer).join(",")}]::boolean[]`)}) AS is_customer
      ) AS v
      WHERE d.id = v.id
    `);
  }
}

async function main() {
  const domains = await db
    .select({
      id: leadDomainTable.id,
      domain: leadDomainTable.domain,
      hubspotRecordId: leadDomainTable.hubspotRecordId,
    })
    .from(leadDomainTable);
  const pool = LIMIT ? domains.slice(0, LIMIT) : domains;
  console.log(
    `✓ lead_domains: ${domains.length}${LIMIT ? ` (limited to ${pool.length})` : ""}`,
  );

  const matches: Update[] = [];
  const unmatchedIds: string[] = [];
  const statusCounts = new Map<string, number>();
  let customers = 0;
  const chunks = Math.ceil(pool.length / CHUNK);

  for (let i = 0; i < pool.length; i += CHUNK) {
    const slice = pool.slice(i, i + CHUNK);
    const found = await findCompaniesByDomains(slice.map((d) => d.domain));
    for (const row of slice) {
      const hit = found.get(row.domain.toLowerCase());
      if (hit) {
        const isCustomer = hit.values.lifecyclestage === "customer";
        if (isCustomer) customers++;
        const status = hit.values.hs_lead_status;
        if (status)
          statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
        matches.push({
          id: row.id,
          recordId: hit.id,
          leadStatus: status,
          owner: hit.values.hubspot_owner_id
            ? resolveHsLabel(HS_OWNER_NAMES, hit.values.hubspot_owner_id)
            : null,
          isCustomer,
        });
      } else if (!row.hubspotRecordId) {
        unmatchedIds.push(row.id);
      }
    }
    const done = Math.min(i / CHUNK + 1, chunks);
    if (done % 50 === 0 || done === chunks) {
      console.log(
        `  …${done}/${chunks} chunks · ${matches.length} matched so far`,
      );
    }
    await sleep(THROTTLE_MS);
  }

  console.log(
    `✓ matched ${matches.length}/${pool.length} domains — writing back…`,
  );
  await bulkApplyMatches(matches);

  // Truth-refresh the negatives (only rows with no trusted link).
  for (let i = 0; i < unmatchedIds.length; i += 5000) {
    const batch = unmatchedIds.slice(i, i + 5000);
    await db.execute(sql`
      UPDATE leads.domain
      SET in_hubspot = false, updated_at = now()
      WHERE id = ANY(${sql.raw(`ARRAY[${batch.map((id) => `'${id}'`).join(",")}]`)})
        AND hubspot_record_id IS NULL
        AND in_hubspot = true
    `);
  }

  console.log("\n===== LINK PASS SUMMARY =====");
  console.log(`domains scanned:     ${pool.length}`);
  console.log(
    `matched in HubSpot:  ${matches.length} (${((matches.length / pool.length) * 100).toFixed(1)}%)`,
  );
  console.log(`net-new (no match):  ${pool.length - matches.length}`);
  console.log(`existing customers:  ${customers}`);
  const topStatuses = [...statusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  console.log(`lead-status distribution (top):`);
  for (const [status, n] of topStatuses)
    console.log(`  ${n.toString().padStart(6)}  ${status}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Link pass failed:", err);
  process.exit(1);
});
