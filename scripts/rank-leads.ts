/**
 * Run the lead ranker over domains and write scores back.
 *
 *   bun --conditions=react-server scripts/rank-leads.ts example.com other.com
 *   bun --conditions=react-server scripts/rank-leads.ts --batch pregen-1
 *   bun --conditions=react-server scripts/rank-leads.ts --cohort untouched --enrollable --limit 1
 *   bun --conditions=react-server scripts/rank-leads.ts --cohort untouched --enrollable --resume
 *
 * Thin on purpose: all the work is in lead-ranker.service.ts so the same call
 * can back an API route later.
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { PLACEHOLDER_EMAIL_DOMAINS_SQL } from "@/server/services/lead-channel.service";
import { rankLeadDomain } from "@/server/services/lead-ranker.service";

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
const dry = has("dry");
/** Skip anything already carrying a score, so a re-run costs only what failed. */
const resume = has("resume");
/**
 * Narrow a cohort to members we could actually mail: a live contact with a real
 * address, linked in HubSpot, not opted out. This is the same predicate behind
 * the population pill's badge, so `--cohort untouched --enrollable` selects the
 * same set the UI calls "Untouched · 382". Without it you get every member of
 * the list, which is a different and much larger population.
 */
const enrollable = has("enrollable");
function opt(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}
const batch = opt("batch");
const cohort = opt("cohort");
const limit = Number(opt("limit") ?? "0");

async function selectDomains(): Promise<string[]> {
  const conds = [sql`d.deleted_at is null`];
  if (batch) conds.push(sql`d.pregen_batch = ${batch}`);
  if (cohort) {
    conds.push(sql`exists (
      select 1 from leads.hubspot_list_membership m
       where m.domain_id = d.id
         and m.object_type = 'company'
         and m.cohort = ${cohort}
    )`);
  }
  if (enrollable) {
    conds.push(sql`exists (
      select 1 from leads.contact c
       where c.domain_id = d.id
         and c.deleted_at is null
         and nullif(btrim(c.email), '') is not null
         and c.hubspot_contact_id is not null
         and coalesce(c.email_opt_out, false) = false
         and lower(split_part(c.email, '@', 2)) <> all(${PLACEHOLDER_EMAIL_DOMAINS_SQL})
    )`);
  }
  if (resume) conds.push(sql`d.score_pregen_potential is null`);

  const rows = await db.execute<{ domain: string }>(sql`
    select d.domain from leads.domain d
     where ${sql.join(conds, sql` and `)}
     order by d.domain
  `);
  return rows.rows.map((r) => r.domain);
}

let domains = argv.filter((a) => !a.startsWith("--") && a.includes("."));
if (batch || cohort || resume) domains = await selectDomains();
if (limit > 0) domains = domains.slice(0, limit);
if (!domains.length)
  throw new Error("no domains: pass domains, --batch <label> or --cohort <name>");

console.log(
  JSON.stringify({ count: domains.length, dry, batch, cohort, enrollable, resume }, null, 2),
);

const CONCURRENCY = 3;
const results: unknown[] = [];
const failures: { domain: string; reason: string }[] = [];
let cursor = 0;

async function worker() {
  while (cursor < domains.length) {
    const domain = domains[cursor++]!;
    const started = Date.now();
    try {
      const result = await rankLeadDomain(domain, { persist: !dry });
      results.push(result);
      const r = result.rank;
      console.log(
        `OK ${domain}  target=${result.overall}  assets=${r.assetQuality} design=${r.designQuality} brand=${r.brandStrength} copy=${r.copySpecificity}  flags=${r.redFlags.join(",") || "-"}  imgs=${result.imageCount} shot=${result.screenshotUrl ? "y" : "n"} emails=${result.emailsSeen} notes=${result.activitiesSeen}  ${Date.now() - started}ms`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ domain, reason });
      console.error(`FAIL ${domain}: ${reason}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n--- ${results.length}/${domains.length} ranked, ${failures.length} failed ---`);
// A failed scrape no longer scores blind, so failures are real gaps rather than
// silently-bad rows. Re-running with --resume picks up exactly these.
if (failures.length) console.log(JSON.stringify(failures, null, 2));
console.log(JSON.stringify(results, null, 2));
