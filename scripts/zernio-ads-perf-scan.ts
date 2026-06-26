/**
 * zernio-ads-perf-scan.ts — THROWAWAY analysis. Pulls the Zernio /ads/tree with
 * an explicit date window (the client defaults to 90d; we want "previous
 * campaigns") and ranks ads/campaigns by platform metrics (impressions, clicks,
 * CTR, engagement). Buckets by ad destination (/os vs audit vs other) and by
 * objective. Writes JSON to scratchpad + prints a readable digest. Reads nothing
 * but Zernio; writes nothing to our DB.
 *
 *   bun scripts/zernio-ads-perf-scan.ts                 # last 365 days
 *   bun scripts/zernio-ads-perf-scan.ts --days 540      # custom window
 */
import { writeFileSync } from "node:fs";

const KEY = process.env.ZERNIO_API_KEY;
const BASE = "https://zernio.com/api/v1";

const argv = process.argv.slice(2);
const daysArg = argv.indexOf("--days");
const DAYS = daysArg >= 0 ? Number(argv[daysArg + 1]) : 365;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Metrics = {
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  engagement?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  conversions?: number;
  costPerConversion?: number;
  actions?: Record<string, number>;
  actionValues?: Record<string, number>;
  purchaseValue?: number;
  roas?: number;
};

type Creative = {
  body?: string | null;
  linkUrl?: string | null;
  instagramPermalinkUrl?: string | null;
  thumbnailUrl?: string | null;
};

type Ad = {
  _id?: string;
  platformAdId?: string;
  name?: string;
  status?: string;
  platformObjective?: string;
  optimizationGoal?: string;
  creative?: Creative;
  metrics?: Metrics;
  platformCreatedAt?: string;
  createdAt?: string;
};

type Campaign = {
  campaignName?: string;
  name?: string;
  status?: string;
  platformObjective?: string;
  platformAdAccountName?: string;
  metrics?: Metrics;
  adSets?: Array<{ adSetName?: string; ads?: Ad[] }>;
};

async function fetchTree(fromDate: string, toDate: string): Promise<Campaign[]> {
  const all: Campaign[] = [];
  for (let page = 1; page <= 60; page++) {
    const url = `${BASE}/ads/tree?source=all&fromDate=${fromDate}&toDate=${toDate}&page=${page}&limit=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`tree page ${page}: ${res.status} ${await res.text()}`);
    const data: unknown = await res.json();
    const obj = (data && typeof data === "object" ? data : {}) as {
      campaigns?: Campaign[];
      data?: Campaign[];
      pagination?: { pages?: number };
    };
    const items: Campaign[] = Array.isArray(data)
      ? (data as Campaign[])
      : (obj.campaigns ?? obj.data ?? []);
    all.push(...items);
    const pages = obj.pagination?.pages ?? 1;
    if (items.length === 0 || page >= pages) break;
  }
  return all;
}

type FlatAd = Ad & {
  campaignName?: string;
  campaignStatus?: string;
  adSetName?: string;
  destination: string;
  bodyText: string;
  ctrCalc: number;
};

function classifyDestination(ad: Ad): string {
  const link = ad.creative?.linkUrl ?? "";
  const lower = link.toLowerCase();
  if (lower.includes("audit.wander.com") || lower.includes("/audit")) return "audit";
  if (lower.includes("/os") || lower.includes("wanderos")) return "os (WanderOS)";
  if (lower.includes("/list")) return "list";
  if (lower.includes("wander.com")) return "marketplace/wander.com";
  if (link) return "other-link";
  // No link: lead-form / on-FB objectives
  if (ad.platformObjective === "OUTCOME_LEADS") return "lead-form (on-Meta)";
  if (ad.platformObjective === "OUTCOME_ENGAGEMENT" || ad.platformObjective === "POST_ENGAGEMENT")
    return "engagement (on-Meta)";
  return "unknown/no-link";
}

function main() {
  if (!KEY) {
    console.error("ZERNIO_API_KEY not set");
    process.exit(1);
  }
  const toDate = ymd(new Date());
  const fromDate = ymd(new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000));
  console.log(`Window: ${fromDate} → ${toDate} (${DAYS} days)\n`);

  return fetchTree(fromDate, toDate).then((tree) => {
    const flat: FlatAd[] = [];
    for (const c of tree) {
      for (const s of c.adSets ?? []) {
        for (const a of s.ads ?? []) {
          const m = a.metrics ?? {};
          const imp = m.impressions ?? 0;
          const clk = m.clicks ?? 0;
          flat.push({
            ...a,
            campaignName: c.campaignName ?? c.name,
            campaignStatus: c.status,
            adSetName: s.adSetName,
            destination: classifyDestination(a),
            bodyText: (a.creative?.body ?? "").replace(/\s+/g, " ").trim(),
            ctrCalc: imp > 0 ? clk / imp : 0,
          });
        }
      }
    }

    const delivered = flat.filter((a) => (a.metrics?.impressions ?? 0) > 0);

    // ---- Aggregates ----
    const sum = (arr: FlatAd[], f: (m: Metrics) => number) =>
      arr.reduce((n, a) => n + f(a.metrics ?? {}), 0);
    const totals = {
      ads: flat.length,
      delivered: delivered.length,
      spend: sum(delivered, (m) => m.spend ?? 0),
      impressions: sum(delivered, (m) => m.impressions ?? 0),
      clicks: sum(delivered, (m) => m.clicks ?? 0),
      engagement: sum(delivered, (m) => m.engagement ?? 0),
      conversions: sum(delivered, (m) => m.conversions ?? 0),
    };

    const byKey = (key: (a: FlatAd) => string) => {
      const map = new Map<string, { ads: number; spend: number; impressions: number; clicks: number; engagement: number; conversions: number }>();
      for (const a of delivered) {
        const k = key(a);
        const e = map.get(k) ?? { ads: 0, spend: 0, impressions: 0, clicks: 0, engagement: 0, conversions: 0 };
        e.ads++;
        e.spend += a.metrics?.spend ?? 0;
        e.impressions += a.metrics?.impressions ?? 0;
        e.clicks += a.metrics?.clicks ?? 0;
        e.engagement += a.metrics?.engagement ?? 0;
        e.conversions += a.metrics?.conversions ?? 0;
        map.set(k, e);
      }
      return [...map.entries()]
        .map(([k, v]) => ({ key: k, ...v, ctr: v.impressions ? v.clicks / v.impressions : 0, cpc: v.clicks ? v.spend / v.clicks : 0 }))
        .sort((a, b) => b.impressions - a.impressions);
    };

    const byDestination = byKey((a) => a.destination);
    const byObjective = byKey((a) => a.platformObjective ?? "(none)");

    const lite = (a: FlatAd) => ({
      name: a.name,
      campaign: a.campaignName,
      status: a.status,
      objective: a.platformObjective,
      destination: a.destination,
      link: a.creative?.linkUrl ?? null,
      created: (a.platformCreatedAt ?? a.createdAt ?? "").slice(0, 10),
      impressions: a.metrics?.impressions ?? 0,
      clicks: a.metrics?.clicks ?? 0,
      ctr: Number((a.ctrCalc * 100).toFixed(2)),
      engagement: a.metrics?.engagement ?? 0,
      spend: Math.round(a.metrics?.spend ?? 0),
      conversions: a.metrics?.conversions ?? 0,
      cpc: Number((a.metrics?.cpc ?? 0).toFixed(2)),
      body: a.bodyText.slice(0, 280),
    });

    const topByImpressions = [...delivered].sort((a, b) => (b.metrics?.impressions ?? 0) - (a.metrics?.impressions ?? 0)).slice(0, 30).map(lite);
    const topByClicks = [...delivered].sort((a, b) => (b.metrics?.clicks ?? 0) - (a.metrics?.clicks ?? 0)).slice(0, 30).map(lite);
    const MIN_IMP = 5000;
    const topByCtr = delivered.filter((a) => (a.metrics?.impressions ?? 0) >= MIN_IMP).sort((a, b) => b.ctrCalc - a.ctrCalc).slice(0, 30).map(lite);
    const topByEngagement = [...delivered].sort((a, b) => (b.metrics?.engagement ?? 0) - (a.metrics?.engagement ?? 0)).slice(0, 30).map(lite);
    const topBySpend = [...delivered].sort((a, b) => (b.metrics?.spend ?? 0) - (a.metrics?.spend ?? 0)).slice(0, 30).map(lite);

    const out = { window: { fromDate, toDate, days: DAYS }, totals, byDestination, byObjective, topByImpressions, topByClicks, topByCtr, topByEngagement, topBySpend };

    const path = "/private/tmp/claude-501/-Users-kristianeboe-Developer-wander/b3f09ff7-6ab7-45e2-a8f4-1a2403fe45ab/scratchpad/zernio-ads-perf.json";
    writeFileSync(path, JSON.stringify(out, null, 2));

    // ---- Digest ----
    const fmt = (n: number) => n.toLocaleString("en-US");
    console.log(`TOTALS (delivered ads only): ${totals.delivered}/${totals.ads} ads · ${fmt(totals.impressions)} impressions · ${fmt(totals.clicks)} clicks · CTR ${(totals.clicks / totals.impressions * 100).toFixed(2)}% · $${fmt(Math.round(totals.spend))} spend · ${fmt(totals.engagement)} engagement\n`);

    console.log("=== BY DESTINATION ===");
    console.log("dest                        ads   impressions     clicks    CTR%    spend    eng");
    for (const d of byDestination) {
      console.log(`${d.key.padEnd(26)} ${String(d.ads).padStart(4)} ${fmt(d.impressions).padStart(13)} ${fmt(d.clicks).padStart(10)} ${(d.ctr * 100).toFixed(2).padStart(7)} ${("$" + fmt(Math.round(d.spend))).padStart(9)} ${fmt(d.engagement).padStart(7)}`);
    }

    console.log("\n=== BY OBJECTIVE ===");
    console.log("objective                   ads   impressions     clicks    CTR%    spend");
    for (const d of byObjective) {
      console.log(`${d.key.padEnd(26)} ${String(d.ads).padStart(4)} ${fmt(d.impressions).padStart(13)} ${fmt(d.clicks).padStart(10)} ${(d.ctr * 100).toFixed(2).padStart(7)} ${("$" + fmt(Math.round(d.spend))).padStart(9)}`);
    }

    const printTop = (title: string, rows: ReturnType<typeof lite>[]) => {
      console.log(`\n=== ${title} ===`);
      for (const r of rows.slice(0, 15)) {
        console.log(`• [${r.destination}] imp ${fmt(r.impressions)} · clk ${fmt(r.clicks)} · CTR ${r.ctr}% · eng ${fmt(r.engagement)} · $${fmt(r.spend)} · ${r.created}`);
        console.log(`  ${r.name ?? "(no name)"}`);
        if (r.body) console.log(`  copy: "${r.body.slice(0, 160)}"`);
      }
    };
    printTop("TOP 15 BY IMPRESSIONS", topByImpressions);
    printTop("TOP 15 BY CLICKS", topByClicks);
    printTop(`TOP 15 BY CTR (min ${MIN_IMP} impressions)`, topByCtr);
    printTop("TOP 15 BY ENGAGEMENT", topByEngagement);

    console.log(`\nFull JSON → ${path}`);
  });
}

void main();
