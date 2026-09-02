/**
 * enrich-batch.ts — run discovery + extraction + unit estimation over a list
 * of domains and WRITE BACK to leads.domain (unit_* columns, pregen-fit score,
 * tier guess, and the raw evidence under enrichment JSONB). No HubSpot writes.
 *
 *   bun scripts/enrich-batch.ts /tmp/lead-sample-100.txt
 *
 * Idempotent: re-running overwrites the same columns. Results also append to
 * <input>.results.jsonl so ranking can happen without re-querying.
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";
import { discoverDomain } from "@/server/services/lead-discovery.service";
import { extractFromDiscovery } from "@/server/services/lead-extraction.service";
import { estimateUnitsFromDiscovery } from "@/server/services/lead-unit-estimate.service";

const inputPath = process.argv[2] ?? "/tmp/lead-sample-100.txt";
const resultsPath = `${inputPath}.results.jsonl`;
const CONCURRENCY = 4;

const domains = readFileSync(inputPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

// Resume support: skip domains already in the results file.
const done = new Set<string>();
if (existsSync(resultsPath)) {
  for (const line of readFileSync(resultsPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add((JSON.parse(line) as { domain: string }).domain);
    } catch {
      /* ignore partial line */
    }
  }
}

async function enrichOne(domain: string) {
  const t0 = Date.now();
  const [row] = await db
    .select({ id: leadDomainTable.id, unitCount: leadDomainTable.unitCount })
    .from(leadDomainTable)
    .where(eq(leadDomainTable.domain, domain));
  if (!row) throw new Error("domain not found in leads.domain");

  const discovery = await discoverDomain(domain);
  const [extraction, unit] = await Promise.all([
    extractFromDiscovery(discovery),
    estimateUnitsFromDiscovery(discovery, { oursPregen: row.unitCount }),
  ]);

  const est = unit.estimate;
  const fit = extraction.structured.pregenFit;

  await db
    .update(leadDomainTable)
    .set({
      unitEstimate: est.estimate,
      unitLow: est.low,
      unitHigh: est.high,
      unitConfidence: est.confidence,
      unitBasis: est.basis,
      unitMethod: est.method,
      unitEstimateModel: unit.model,
      unitEstimatedAt: new Date(),
      scorePregenPotential: fit.score,
      computedTier: extraction.structured.icpTierGuess,
      scoreVersion: "enrich-batch-v1",
      scoredAt: new Date(),
      enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb) || ${JSON.stringify({
        unitEstimate: est,
        extraction: extraction.structured,
        providersUsed: unit.providersUsed,
      })}::jsonb`,
    })
    .where(eq(leadDomainTable.id, row.id));

  return {
    domain,
    ms: Date.now() - t0,
    unitEstimate: est.estimate,
    unitRange: [est.low, est.high],
    unitConfidence: est.confidence,
    unitBasis: est.basis,
    pregenFit: fit.score,
    tier: extraction.structured.icpTierGuess,
    redFlags: extraction.structured.redFlags,
    extractionConfidence: extraction.structured.confidence,
    company: extraction.structured.company.brandName,
    propertyTypes: extraction.structured.portfolio.propertyTypes,
  };
}

async function main() {
  const todo = domains.filter((d) => !done.has(d));
  console.log(`${domains.length} domains, ${done.size} already done, ${todo.length} to go`);

  let ok = 0;
  let failed = 0;
  let i = 0;

  async function worker() {
    while (i < todo.length) {
      const domain = todo[i++]!;
      try {
        const result = await enrichOne(domain);
        appendFileSync(resultsPath, JSON.stringify(result) + "\n");
        ok++;
        console.log(
          `[${ok + failed}/${todo.length}] ${domain} → units=${result.unitEstimate ?? "?"} (${result.unitConfidence}) fit=${result.pregenFit} flags=${result.redFlags.length} (${Math.round(result.ms / 1000)}s)`,
        );
      } catch (e) {
        failed++;
        appendFileSync(
          resultsPath,
          JSON.stringify({ domain, error: e instanceof Error ? e.message : String(e) }) + "\n",
        );
        console.log(`[${ok + failed}/${todo.length}] ${domain} → ERROR: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone. ok=${ok} failed=${failed} → ${resultsPath}`);
  process.exit(0);
}

void main();
