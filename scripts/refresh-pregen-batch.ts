/**
 * Bring one pregen batch fully up to date: rank, then regenerate the sequence.
 *
 * Unlike `/api/cron/pregen-batch`, which is skip-if-done and exists to converge
 * a batch cheaply, this deliberately redoes both passes. It is what you run
 * after changing the generator, when the point is that every draft in the batch
 * was written by the current code rather than by whatever shipped that week.
 *
 * Sequential on purpose. The batch is ten companies, each pass is a Firecrawl
 * scrape and an LLM call, and running them concurrently mostly buys rate-limit
 * errors that have to be untangled one at a time anyway.
 *
 *   bun --conditions=react-server scripts/refresh-pregen-batch.ts
 *   bun --conditions=react-server scripts/refresh-pregen-batch.ts --batch pregen-2 --skip-rank
 */
import { and, eq, isNull } from "drizzle-orm";

import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";
import { rankLeadDomain } from "@/server/services/lead-ranker.service";
import { generateAndStoreSequence } from "@/server/services/pregen/generate-sequence";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const batch = arg("batch") ?? CURRENT_PREGEN_BATCH;
const skipRank = process.argv.includes("--skip-rank");
const only = arg("domain")?.trim().toLowerCase();

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const rows = await db
  .select({
    id: leadDomainTable.id,
    domain: leadDomainTable.domain,
    pregenSiteUrl: leadDomainTable.pregenSiteUrl,
  })
  .from(leadDomainTable)
  .where(
    and(
      eq(leadDomainTable.pregenBatch, batch),
      isNull(leadDomainTable.deletedAt),
      ...(only ? [eq(leadDomainTable.domain, only)] : []),
    ),
  );

console.log(`${batch}: ${rows.length} domain(s)\n`);

for (const row of rows) {
  console.log(`── ${row.domain}`);

  if (!skipRank) {
    try {
      const ranked = await rankLeadDomain(row.domain, { persist: true });
      console.log(`   rank ${ranked.overall}`);
    } catch (error) {
      // A rank failure is not fatal to the sequence: the generator reads the
      // stored rank if there is one and says "(not ranked yet)" if there is not.
      console.log(`   rank FAILED ${reason(error)}`);
    }
  }

  if (!row.pregenSiteUrl) {
    console.log("   sequence skipped, no preview assigned");
    continue;
  }

  try {
    const created = await generateAndStoreSequence(row.id);
    const context = created.generationContext;
    console.log(
      `   sequence ${context?.motion} → ${context?.recipient?.name ?? "company-level"} (site from ${context?.website.source ?? "?"})`,
    );
  } catch (error) {
    console.log(`   sequence FAILED ${reason(error)}`);
  }
}

console.log("\ndone");
process.exit(0);
