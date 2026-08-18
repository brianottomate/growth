/**
 * Capture the before/after pair for a whole pregen batch.
 *
 * `capturePreviewVisual` has only ever been reachable one domain at a time,
 * from the button on the lead page, so exactly one of the ten had pictures. The
 * comparison is the pitch, and a reviewer scanning the list wants to see it
 * without opening ten tabs and clicking Capture in each.
 *
 * Skips domains that already have a pair unless --recapture, because each run
 * is four Firecrawl scrapes (their site and ours, desktop and mobile) and the
 * shots do not go stale the way the ranker's presigned Firecrawl URL does.
 * Sequential on purpose: Firecrawl rate-limits, and a batch this size does not
 * need the concurrency.
 *
 *   bun --conditions=react-server scripts/capture-pregen-previews.ts
 *   bun --conditions=react-server scripts/capture-pregen-previews.ts --recapture
 *   bun --conditions=react-server scripts/capture-pregen-previews.ts --batch pregen-2
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";

import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";
import { capturePreviewVisual } from "@/server/services/pregen/preview-visual";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const recapture = process.argv.includes("--recapture");
const batch = arg("batch") ?? CURRENT_PREGEN_BATCH;
const only = arg("domain");

const rows = await db
  .select({
    domain: leadDomainTable.domain,
    enrichment: leadDomainTable.enrichment,
  })
  .from(leadDomainTable)
  .where(
    and(
      eq(leadDomainTable.pregenBatch, batch),
      // No assigned preview means there is no "after" to shoot; the pair is the
      // whole point, so those are skipped rather than half-captured.
      isNotNull(leadDomainTable.pregenSiteUrl),
      isNull(leadDomainTable.deletedAt),
    ),
  );

console.log(`${batch}: ${rows.length} domain(s) with a preview\n`);

let captured = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  if (only && row.domain !== only) continue;

  const existing = (
    row.enrichment as { previewVisual?: { ours?: unknown[] } } | null
  )?.previewVisual;
  if (existing?.ours?.length && !recapture) {
    console.log(`skip  ${row.domain}: already captured`);
    skipped += 1;
    continue;
  }

  try {
    const receipt = await capturePreviewVisual(row.domain);
    console.log(
      `shot  ${row.domain}: ${receipt.theirs.length} of theirs, ${receipt.ours.length} of ours`,
    );
    captured += 1;
  } catch (error) {
    console.log(
      `FAIL  ${row.domain}: ${error instanceof Error ? error.message : String(error)}`,
    );
    failed += 1;
  }
}

console.log(`\ncaptured ${captured}, skipped ${skipped}, failed ${failed}`);
process.exit(0);
