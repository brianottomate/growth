/**
 * zernio-ads-dump.ts — THROWAWAY. Dumps the real Zernio /ads/tree payload so we
 * can see the actual field shapes (campaign → adSet → ad → creative) before
 * deciding whether to mirror them into ads-schema the way we did platform_post.
 * Inspect-only; writes nothing.
 *
 *   bun scripts/zernio-ads-dump.ts            # tree shape + counts + one sample of each level
 *   bun scripts/zernio-ads-dump.ts --json     # also dump full raw JSON of one ad
 *   bun scripts/zernio-ads-dump.ts --comments # also fetch comments for the first ad
 */
import {
  getZernioAdComments,
  getZernioAdsTree,
  isZernioConfigured,
} from "@/server/clients/zernio.client";

const argv = process.argv.slice(2);
const DUMP_JSON = argv.includes("--json");
const WITH_COMMENTS = argv.includes("--comments");

function fieldKeys(obj: unknown): string[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.keys(obj).sort();
}

async function main() {
  if (!isZernioConfigured) {
    console.error("ZERNIO_API_KEY not configured — aborting.");
    process.exit(1);
  }

  console.log("=== ADS TREE (GET /ads/tree?source=all) ===");
  const tree = await getZernioAdsTree();
  console.log(`  campaigns: ${tree.length}`);

  let adSetCount = 0;
  let adCount = 0;
  const platforms = new Set<string>();
  const campaignStatuses = new Set<string>();
  const adStatuses = new Set<string>();
  const objectives = new Set<string>();
  for (const c of tree) {
    if (c.platform) platforms.add(c.platform);
    if (c.status) campaignStatuses.add(c.status);
    for (const s of c.adSets ?? []) {
      adSetCount++;
      for (const a of s.ads ?? []) {
        adCount++;
        if (a.platform) platforms.add(a.platform);
        if (a.status) adStatuses.add(a.status);
        if (a.platformObjective) objectives.add(a.platformObjective);
      }
    }
  }
  console.log(`  adSets:    ${adSetCount}`);
  console.log(`  ads:       ${adCount}`);
  console.log(`  platforms:        [${[...platforms].join(", ")}]`);
  console.log(`  campaignStatuses: [${[...campaignStatuses].join(", ")}]`);
  console.log(`  adStatuses:       [${[...adStatuses].join(", ")}]`);
  console.log(`  objectives:       [${[...objectives].join(", ")}]`);

  const firstCampaign = tree[0];
  console.log("\n  campaign keys:", fieldKeys(firstCampaign));
  const firstAdSet = firstCampaign?.adSets?.[0];
  console.log("  adSet keys:   ", fieldKeys(firstAdSet));
  const firstAd = firstAdSet?.ads?.[0];
  console.log("  ad keys:      ", fieldKeys(firstAd));
  console.log("  creative keys:", fieldKeys(firstAd?.creative));

  console.log("\n  sample campaigns:");
  for (const c of tree.slice(0, 8)) {
    const sets = c.adSets?.length ?? 0;
    const ads = (c.adSets ?? []).reduce((n, s) => n + (s.ads?.length ?? 0), 0);
    console.log(
      `    - [${c.status ?? "?"}] ${c.platform ?? "?"} · ${(c.name ?? "?").slice(0, 50)} (${sets} adSets, ${ads} ads)`,
    );
  }

  if (DUMP_JSON && firstAd) {
    console.log("\n  --- RAW AD JSON (first ad) ---");
    console.log(JSON.stringify(firstAd, null, 2));
  }

  // --- TIME SPREAD: campaigns have no own date; derive from their ads' ---
  // platformCreatedAt (fallback createdAt). Bucket campaigns by the month of
  // their EARLIEST ad (≈ launch month).
  console.log(
    "\n=== CAMPAIGN TIME SPREAD (by earliest ad's platformCreatedAt) ===",
  );
  const monthBuckets = new Map<
    string,
    { campaigns: number; ads: number; spend: number }
  >();
  let datedCampaigns = 0;
  const campaignSpans: Array<{
    name: string;
    status?: string;
    first?: string;
    last?: string;
    ads: number;
    spend: number;
  }> = [];
  for (const c of tree) {
    const adDates: number[] = [];
    let ads = 0;
    let spend = 0;
    for (const s of c.adSets ?? []) {
      for (const a of s.ads ?? []) {
        ads++;
        const m = a.metrics as { spend?: number } | undefined;
        if (typeof m?.spend === "number") spend += m.spend;
        const raw = a.platformCreatedAt ?? a.createdAt;
        const t = raw ? Date.parse(raw) : NaN;
        if (!Number.isNaN(t)) adDates.push(t);
      }
    }
    if (adDates.length === 0) {
      campaignSpans.push({
        name: (c.campaignName as string) ?? "?",
        status: c.status,
        ads,
        spend,
      });
      continue;
    }
    datedCampaigns++;
    const min = Math.min(...adDates);
    const max = Math.max(...adDates);
    const firstIso = new Date(min).toISOString();
    const monthKey = firstIso.slice(0, 7);
    const b = monthBuckets.get(monthKey) ?? { campaigns: 0, ads: 0, spend: 0 };
    b.campaigns++;
    b.ads += ads;
    b.spend += spend;
    monthBuckets.set(monthKey, b);
    campaignSpans.push({
      name: (c.campaignName as string) ?? "?",
      status: c.status,
      first: firstIso.slice(0, 10),
      last: new Date(max).toISOString().slice(0, 10),
      ads,
      spend,
    });
  }

  console.log(`  ${datedCampaigns}/${tree.length} campaigns have dated ads\n`);
  console.log("  month   | campaigns |  ads | spend");
  for (const key of [...monthBuckets.keys()].sort()) {
    const b = monthBuckets.get(key)!;
    const bar = "█".repeat(Math.min(40, b.campaigns));
    console.log(
      `  ${key} | ${String(b.campaigns).padStart(9)} | ${String(b.ads).padStart(4)} | $${b.spend.toFixed(0).padStart(7)}  ${bar}`,
    );
  }

  console.log("\n  widest-span campaigns (first ad → last ad):");
  const dated = campaignSpans.filter((c) => c.first);
  dated.sort(
    (a, b) =>
      Date.parse(b.last!) -
      Date.parse(b.first!) -
      (Date.parse(a.last!) - Date.parse(a.first!)),
  );
  for (const c of dated.slice(0, 10)) {
    console.log(
      `    ${c.first} → ${c.last}  [${c.status}] ${c.ads} ads $${c.spend.toFixed(0)}  ${c.name.slice(0, 45)}`,
    );
  }

  if (WITH_COMMENTS && firstAd) {
    const adId =
      firstAd.id ?? firstAd._id ?? firstAd.platformAdId ?? firstAd.platformId;
    if (typeof adId === "string") {
      console.log(`\n=== COMMENTS for ad ${adId} ===`);
      const res = await getZernioAdComments(adId, { limit: 10 });
      if (res.error) console.log("  ERROR:", res.error);
      console.log(`  count: ${res.comments.length}`);
      if (res.comments[0]) console.log("  keys:", fieldKeys(res.comments[0]));
    }
  }

  console.log("\nDone.");
}

void main();
