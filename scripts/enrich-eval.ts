/**
 * enrich-eval.ts — run discovery + extraction over a set of domains and print
 * a compact comparison table. Inspect-only; writes nothing to the DB.
 *
 *   bun scripts/enrich-eval.ts                      # default eval set
 *   bun scripts/enrich-eval.ts a.com b.com          # specific domains
 *   bun scripts/enrich-eval.ts --json a.com         # also dump full JSON
 *
 * Uses whatever provider keys are configured; missing keys skip gracefully.
 */
import { discoverDomain } from "@/server/services/lead-discovery.service";
import { extractFromDiscovery } from "@/server/services/lead-extraction.service";

const argv = process.argv.slice(2);
const DUMP_JSON = argv.includes("--json");
const domains = argv.filter((a) => !a.startsWith("--"));

// Default set = the marketplace/OTA-heavy top-by-units rows (a stress test:
// the pipeline SHOULD flag these as not-a-PM).
const DEFAULT = [
  "cozycozy.com",
  "expedia.com",
  "vrbo.com",
  "homeaway.com",
  "xreservations.com",
  "bhshamptons.com",
];

const CONCURRENCY = 3;

async function evalDomain(domain: string) {
  try {
    const discovery = await discoverDomain(domain);
    const extraction = await extractFromDiscovery(discovery);
    return { domain, discovery, extraction, error: null as string | null };
  } catch (e) {
    return {
      domain,
      discovery: null,
      extraction: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const targets = domains.length ? domains : DEFAULT;
  console.log(`\nEvaluating ${targets.length} domain(s)…\n`);

  const results: Awaited<ReturnType<typeof evalDomain>>[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(evalDomain))));
    process.stdout.write(`  …${Math.min(i + CONCURRENCY, targets.length)}/${targets.length}\n`);
  }

  console.log(
    "\n" +
      pad("domain", 22) +
      pad("providers", 11) +
      pad("fit", 5) +
      pad("tier", 10) +
      pad("units", 9) +
      pad("conf", 7) +
      "redFlags",
  );
  console.log("-".repeat(110));

  for (const r of results) {
    if (r.error || !r.extraction || !r.discovery) {
      console.log(pad(r.domain, 22) + `ERROR: ${r.error}`);
      continue;
    }
    const s = r.extraction.structured;
    const okp = r.discovery.providers.filter((p) => p.ok).length;
    const totp = r.discovery.providers.length;
    console.log(
      pad(r.domain, 22) +
        pad(`${okp}/${totp}`, 11) +
        pad(String(s.pregenFit.score), 5) +
        pad(s.icpTierGuess, 10) +
        pad(s.portfolio.estimatedUnitCount?.toString() ?? "—", 9) +
        pad(s.confidence, 7) +
        (s.redFlags[0] ?? "—"),
    );
  }

  if (DUMP_JSON) {
    console.log("\n=== FULL JSON ===");
    console.log(
      JSON.stringify(
        results.map((r) => ({
          domain: r.domain,
          error: r.error,
          structured: r.extraction?.structured,
          providers: r.discovery?.providers.map((p) => ({
            source: p.source,
            ok: p.ok,
            ms: p.ms,
          })),
        })),
        null,
        2,
      ),
    );
  }

  process.exit(0);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + " " : s + " ".repeat(n - s.length);
}

void main();
