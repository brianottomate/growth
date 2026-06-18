/**
 * scrub-netnew-hubspot.ts — refresh the LIVE HubSpot status of the net-new
 * outbound candidates and WRITE IT BACK to leads.domain.
 *
 * Fixes the stale `in_hubspot` flag the audit exposed (~30% of "net-new" leads
 * were actually already in HubSpot). For each candidate found in HubSpot we set:
 *     in_hubspot = true, hubspot_record_id, hubspot_lead_status, hubspot_owner
 * …so it drops OUT of the Net-new filter automatically. Leads with no HubSpot
 * company are left untouched (genuinely net-new).
 *
 * Uses a BATCHED domain search (IN operator) — ~7 API calls, not 543 — so it
 * doesn't trip HubSpot's per-second search rate limit.
 *
 * Scope: the ~543 net-new candidates (not flagged in CRM, LIVE_RENTAL, credible
 * contact) — i.e. exactly the leads we'd otherwise cold-email.
 *
 *   bun --conditions react-server scripts/scrub-netnew-hubspot.ts --dry-run  # preview, no writes
 *   bun --conditions react-server scripts/scrub-netnew-hubspot.ts            # write back to our DB
 *
 * HubSpot is read-only here; the ONLY writes are to OUR DB (leads.domain).
 * Idempotent — safe to re-run. Required env: DATABASE_URL, HUBSPOT_ACCESS_TOKEN_OPERATED.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";
import {
  findCompaniesByDomains,
  isHubspotConfigured,
} from "@/server/clients/hubspot.client";

const DRY_RUN = process.argv.includes("--dry-run");

if (!isHubspotConfigured) {
  console.error(
    "HubSpot is not configured (HUBSPOT_ACCESS_TOKEN_OPERATED). Aborting.",
  );
  process.exit(1);
}

type Cand = { id: string; domain: string };

const candRes = await db.execute(sql`
  SELECT d.id, d.domain
  FROM leads.domain d
  WHERE not d.in_hubspot and not d.has_hubspot_deal
    and not d.is_existing_customer and not d.exclude_from_outreach
    and d.pregen_status = 'LIVE_RENTAL'
    and exists (
      select 1 from leads.contact c
      where c.domain_id = d.id and c.deleted_at is null
        and (c.first_name is not null or c.last_name is not null
             or c.email !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')
    )
  ORDER BY d.unit_count DESC NULLS LAST
`);
const candidates = (candRes as unknown as { rows: Cand[] }).rows;

console.log(
  `${DRY_RUN ? "[DRY RUN] " : ""}Scrubbing ${candidates.length} net-new candidates against live HubSpot (batched)…`,
);

// One batched lookup for everything — domain → live HubSpot company.
const hsMap = await findCompaniesByDomains(candidates.map((c) => c.domain));

let found = 0;
let notFound = 0;
const byStatus: Record<string, number> = {};
const flipped: { domain: string; status: string }[] = [];

for (const c of candidates) {
  const company = hsMap.get(c.domain.toLowerCase());
  if (!company) {
    notFound++;
    continue;
  }
  found++;
  const status = company.values.hs_lead_status ?? "(no status)";
  byStatus[status] = (byStatus[status] ?? 0) + 1;
  flipped.push({ domain: c.domain, status });
  if (!DRY_RUN) {
    await db
      .update(leadDomainTable)
      .set({
        inHubspot: true,
        hubspotRecordId: company.id,
        hubspotLeadStatus: company.values.hs_lead_status,
        hubspotOwner: company.values.hubspot_owner_id,
      })
      .where(eq(leadDomainTable.id, c.id));
  }
}

const total = candidates.length;
const pct = (n: number) => `${Math.round((n / Math.max(total, 1)) * 100)}%`;
console.log(`\n${"─".repeat(56)}`);
console.log(
  `Checked ${total} · already in HubSpot ${found} (${pct(found)}) · genuinely net-new ${notFound}`,
);
console.log(
  DRY_RUN
    ? `\n[DRY RUN] would flip ${found} to in_hubspot=true (they'd drop out of Net-new). Re-run without --dry-run to write.`
    : `\nWrote in_hubspot=true + status to ${found} domains — they now drop out of the Net-new pill. Net-new pool is now ~${notFound}.`,
);

console.log("\nFound-in-HubSpot by lead status:");
for (const [status, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${status}`);
}
console.log(`\nFirst 30 that ${DRY_RUN ? "would flip" : "flipped"}:`);
for (const f of flipped.slice(0, 30)) {
  console.log(`  ${f.domain.padEnd(38)} ${f.status}`);
}

process.exit(0);
