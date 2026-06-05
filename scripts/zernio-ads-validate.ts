/**
 * zernio-ads-validate.ts — THROWAWAY. Stress-tests the design assumptions behind
 * the paid-ads surfacing plan against the live /ads/tree payload. Inspect-only.
 *
 *   bun --conditions react-server scripts/zernio-ads-validate.ts
 *
 * Checks:
 *  1. Span distribution — is engine-vs-moment actually bimodal, or a smear?
 *  2. Spend concentration — does a handful of always-on campaigns dominate?
 *  3. platformObjective distribution — usable grouping dimension?
 *  4. Name-convention parseability — can we derive funnel stage reliably?
 *  5. Hero-creative availability — can we pick a thumbnail per campaign?
 *  6. Outliers — what are the pre-2024 campaigns really?
 */
import {
  getZernioAdsTree,
  isZernioConfigured,
  type ZernioAdsTreeCampaign,
} from "@/server/clients/zernio.client";

type CampaignAgg = {
  name: string;
  status?: string;
  objective?: string;
  ads: number;
  spend: number;
  firstMs?: number;
  lastMs?: number;
  spanDays?: number;
  adsWithThumb: number;
  topAdSpend: number;
  topAdHasThumb: boolean;
};

function aggregate(tree: ZernioAdsTreeCampaign[]): CampaignAgg[] {
  return tree.map((c) => {
    const obj = c as Record<string, unknown>;
    let ads = 0;
    let spend = 0;
    let adsWithThumb = 0;
    let topAdSpend = -1;
    let topAdHasThumb = false;
    const dates: number[] = [];
    for (const s of c.adSets ?? []) {
      for (const a of s.ads ?? []) {
        ads++;
        const m = a.metrics as { spend?: number } | undefined;
        const sp = typeof m?.spend === "number" ? m.spend : 0;
        spend += sp;
        const thumb =
          typeof a.creative?.thumbnailUrl === "string" &&
          a.creative.thumbnailUrl.length > 0;
        if (thumb) adsWithThumb++;
        if (sp > topAdSpend) {
          topAdSpend = sp;
          topAdHasThumb = thumb;
        }
        const raw = (a.platformCreatedAt ?? a.createdAt);
        const t = raw ? Date.parse(raw) : NaN;
        if (!Number.isNaN(t)) dates.push(t);
      }
    }
    const firstMs = dates.length ? Math.min(...dates) : undefined;
    const lastMs = dates.length ? Math.max(...dates) : undefined;
    const spanDays =
      firstMs !== undefined && lastMs !== undefined
        ? Math.round((lastMs - firstMs) / 86_400_000)
        : undefined;
    return {
      name: (obj.campaignName as string) ?? (c.name!) ?? "?",
      status: c.status,
      objective: obj.platformObjective as string | undefined,
      ads,
      spend,
      firstMs,
      lastMs,
      spanDays,
      adsWithThumb,
      topAdSpend: Math.max(0, topAdSpend),
      topAdHasThumb,
    };
  });
}

function bar(n: number, max: number, width = 30): string {
  return "█".repeat(Math.max(0, Math.round((n / max) * width)));
}

async function main() {
  if (!isZernioConfigured) {
    console.error("ZERNIO_API_KEY not configured — aborting.");
    process.exit(1);
  }
  const tree = await getZernioAdsTree();
  const agg = aggregate(tree);
  const total = agg.length;
  const totalSpend = agg.reduce((n, c) => n + c.spend, 0);

  // 1. SPAN DISTRIBUTION ------------------------------------------------
  console.log("=== 1. SPAN DISTRIBUTION (engine vs moment?) ===");
  const buckets: Array<[string, (d: number) => boolean]> = [
    ["≤7d   ", (d) => d <= 7],
    ["8–30d ", (d) => d > 7 && d <= 30],
    ["31–90d", (d) => d > 30 && d <= 90],
    ["91–180", (d) => d > 90 && d <= 180],
    ["181–365", (d) => d > 180 && d <= 365],
    [">365d ", (d) => d > 365],
  ];
  const dated = agg.filter((c) => c.spanDays !== undefined);
  for (const [label, test] of buckets) {
    const inB = dated.filter((c) => test(c.spanDays!));
    const sp = inB.reduce((n, c) => n + c.spend, 0);
    console.log(
      `  ${label} | ${String(inB.length).padStart(3)} campaigns | $${sp.toFixed(0).padStart(7)} | ${bar(inB.length, dated.length)}`,
    );
  }
  const engine = dated.filter((c) => (c.spanDays ?? 0) > 90);
  const engineSpend = engine.reduce((n, c) => n + c.spend, 0);
  console.log(
    `  → ENGINE (>90d): ${engine.length}/${total} campaigns hold ${((engineSpend / totalSpend) * 100).toFixed(0)}% of spend`,
  );

  // 2. SPEND CONCENTRATION ---------------------------------------------
  console.log("\n=== 2. SPEND CONCENTRATION ===");
  const spending = agg.filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend);
  console.log(`  campaigns with spend>0: ${spending.length}/${total}`);
  console.log(`  total snapshot spend: $${totalSpend.toFixed(0)}`);
  let cum = 0;
  console.log("  top spenders (cumulative %):");
  for (const c of spending.slice(0, 12)) {
    cum += c.spend;
    console.log(
      `    $${c.spend.toFixed(0).padStart(7)} (${((cum / totalSpend) * 100).toFixed(0).padStart(3)}% cum) [${c.status}] ${c.spanDays ?? "?"}d  ${c.name.slice(0, 42)}`,
    );
  }

  // 3. OBJECTIVE DISTRIBUTION ------------------------------------------
  console.log("\n=== 3. platformObjective (grouping dimension) ===");
  const byObj = new Map<string, { n: number; spend: number }>();
  for (const c of agg) {
    const k = c.objective ?? "(none)";
    const b = byObj.get(k) ?? { n: 0, spend: 0 };
    b.n++;
    b.spend += c.spend;
    byObj.set(k, b);
  }
  for (const [k, b] of [...byObj.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${k.padEnd(26)} | ${String(b.n).padStart(3)} campaigns | $${b.spend.toFixed(0)}`);
  }

  // 4. NAME-CONVENTION PARSEABILITY ------------------------------------
  console.log("\n=== 4. NAME CONVENTION (funnel stage from name) ===");
  const funnelTokens = [
    "Prospecting",
    "Retargeting",
    "Remarketing",
    "DynamicRetargeting",
    "Conversions",
    "CatalogSales",
    "Traffic",
    "TRAFFIC",
    "ASC",
    "NewCustomer",
    "Engagement",
    "Awareness",
  ];
  let matched = 0;
  const tokenHits = new Map<string, number>();
  for (const c of agg) {
    const hits = funnelTokens.filter((t) => c.name.includes(t));
    if (hits.length) matched++;
    for (const h of hits) tokenHits.set(h, (tokenHits.get(h) ?? 0) + 1);
  }
  console.log(`  campaigns matching ≥1 known funnel token: ${matched}/${total} (${((matched / total) * 100).toFixed(0)}%)`);
  for (const [t, n] of [...tokenHits.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(20)} ${n}`);
  }
  console.log("  sample names:");
  for (const c of agg.slice(0, 12)) console.log(`    · ${c.name}`);

  // 5. HERO-CREATIVE AVAILABILITY --------------------------------------
  console.log("\n=== 5. HERO CREATIVE (one thumbnail per campaign) ===");
  const anyThumb = agg.filter((c) => c.adsWithThumb > 0).length;
  const topHasThumb = agg.filter((c) => c.topAdHasThumb).length;
  console.log(`  campaigns with ≥1 ad thumbnail:        ${anyThumb}/${total}`);
  console.log(`  campaigns whose TOP-spend ad has thumb: ${topHasThumb}/${total}`);

  // 6. OUTLIERS ---------------------------------------------------------
  console.log("\n=== 6. PRE-2024 OUTLIERS ===");
  const cutoff = Date.parse("2024-01-01");
  for (const c of agg.filter((c) => c.firstMs !== undefined && c.firstMs < cutoff)) {
    console.log(
      `  ${new Date(c.firstMs!).toISOString().slice(0, 10)} → ${new Date(c.lastMs!).toISOString().slice(0, 10)} [${c.status}] ${c.ads} ads $${c.spend.toFixed(0)} obj=${c.objective}  ${c.name.slice(0, 40)}`,
    );
  }

  console.log("\nDone.");
}

void main();
