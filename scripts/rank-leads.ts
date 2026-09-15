/**
 * Run the lead ranker over domains and write scores back.
 *
 *   bun --conditions=react-server scripts/rank-leads.ts example.com other.com
 *   bun --conditions=react-server scripts/rank-leads.ts --batch pregen-1
 *   bun --conditions=react-server scripts/rank-leads.ts --batch pregen-1 --limit 2 --dry
 *
 * Thin on purpose: all the work is in lead-ranker.service.ts so the same call
 * can back an API route later.
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";
import { rankLeadDomain } from "@/server/services/lead-ranker.service";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
function opt(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}
const batch = opt("batch");
const limit = Number(opt("limit") ?? "0");

let domains = argv.filter((a) => !a.startsWith("--") && a.includes("."));
if (batch) {
  const rows = await db
    .select({ domain: leadDomainTable.domain })
    .from(leadDomainTable)
    .where(eq(leadDomainTable.pregenBatch, batch));
  domains = rows.map((r) => r.domain);
}
if (limit > 0) domains = domains.slice(0, limit);
if (!domains.length)
  throw new Error("no domains: pass domains or --batch <label>");

console.log(JSON.stringify({ count: domains.length, dry, batch }, null, 2));

const CONCURRENCY = 3;
const results: unknown[] = [];
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
        `OK ${domain}  overall=${result.overall}  upside=${r.pregenUpside} assets=${r.assetQuality} design=${r.designQuality} copy=${r.copySpecificity}  imgs=${result.imageCount} shot=${result.screenshotUrl ? "y" : "n"} emails=${result.emailsSeen} notes=${result.activitiesSeen}  ${Date.now() - started}ms`,
      );
    } catch (error) {
      console.error(
        `FAIL ${domain}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n--- ${results.length}/${domains.length} ranked ---`);
console.log(JSON.stringify(results, null, 2));
