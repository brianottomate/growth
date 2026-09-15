/**
 * Spend Tracker — first-principles verification (Phase 4 of the port).
 *
 * Recomputes the dashboard's numbers independently from raw sources and
 * prints a reconciliation report. No golden numbers — every figure is
 * derived from what the raw queries actually return today.
 *
 * Run: bun run scripts/spend-verify.ts [--days 90]
 */
import { fetchMetaCampaignDailyInsights } from "@/server/clients/meta.client";
import {
  BLENDED_TAKE_RATE,
  isMarketplaceCampaign,
  resolveFixedCostsForMonth,
} from "@/server/services/spend-tracker/spend-tracker.config";
import { buildMetaDailyRows } from "@/server/services/spend-tracker/spend-tracker.meta-rows";
import {
  computeSpendTracker,
  resolveSpendWindow,
} from "@/server/services/spend-tracker/spend-tracker.service";
import { fetchSpendData } from "@/server/services/spend-tracker/spend-tracker.queries";

const days = (() => {
  const i = process.argv.indexOf("--days");
  return i > -1 ? Number(process.argv[i + 1]) : 90;
})();

const { startDate, endDate } = resolveSpendWindow({ days });
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

console.log(
  `\n═══ Spend Tracker verification — ${startDate} → ${endDate} (${days}d) ═══`,
);

// ---------------------------------------------------------------------------
// 1. Full pipeline output
// ---------------------------------------------------------------------------
const { summary, rows } = await computeSpendTracker(startDate, endDate);
const t = summary.totals;
const e = summary.efficiency;

console.log(`\n── 1. Dashboard summary (pipeline output) ──`);
console.log(
  `  Marketing Spend   ${money(t.totalMarketingSpend)}  (${money(t.adSpend)} ads + ${money(t.fixedCosts)} fixed)`,
);
console.log(
  `  Bookings          ${t.bookings} total / ${t.directBookings} direct (${t.wanderDirectBookings} wander + ${t.manualBookings} manual) / ${t.otaBookings} OTA`,
);
console.log(
  `  GMV               ${money(t.gmv)} total / ${money(t.directGmv)} direct`,
);
console.log(
  `  DCPB (primary)    ${money(e.directCpb)}  (target $${summary.targets.cpbTarget})`,
);
console.log(`  CPB               ${money(e.cpb)}`);
console.log(
  `  ROAS              ${e.roas.toFixed(1)}x  (GMV × ${BLENDED_TAKE_RATE} / ad spend)`,
);
if (summary.northStar) {
  console.log(`  Gross Take        ${money(summary.northStar.grossTake)}`);
  console.log(
    `  Net Take          ${money(summary.northStar.netTake)}  (gross − complete spend)`,
  );
}
console.log(`  Checkouts         ${t.checkoutStarted}`);
console.log(
  `  Data health       ${summary.dataHealth.status}${summary.dataHealth.message ? ` — ${summary.dataHealth.message}` : ""} (other bucket ${summary.dataHealth.otherBucketPercent}%, meta coverage ${summary.dataHealth.metaApiCoverage}%)`,
);

// ---------------------------------------------------------------------------
// 2. KPI recomputation from first principles (bypassing buildSummary)
// ---------------------------------------------------------------------------
console.log(`\n── 2. Independent KPI recomputation ──`);
const adSpendCheck = rows
  .filter((r) => r.dataSource !== "fixed_cost")
  .reduce((s, r) => s + (r.spend ?? 0), 0);
const fixedCheck = rows
  .filter((r) => r.dataSource === "fixed_cost")
  .reduce((s, r) => s + (r.spend ?? 0), 0);
const dcpbCheck =
  t.directBookings > 0 ? (adSpendCheck + fixedCheck) / t.directBookings : 0;
const diff = (a: number, b: number) =>
  Math.abs(a - b) < 0.01 ? "✅ match" : `❌ DIFF (${money(a)} vs ${money(b)})`;
console.log(`  ad spend      ${diff(adSpendCheck, t.adSpend)}`);
console.log(`  fixed costs   ${diff(fixedCheck, t.fixedCosts)}`);
console.log(`  DCPB          ${diff(dcpbCheck, e.directCpb)}`);

// ---------------------------------------------------------------------------
// 3. Meta spend triangulation: marketplace-filtered vs unfiltered vs BQ
// ---------------------------------------------------------------------------
console.log(`\n── 3. Meta spend triangulation ──`);
const campaignDays = await fetchMetaCampaignDailyInsights({
  startDate,
  endDate,
});
const allMeta = campaignDays.reduce(
  (s, r) => s + (parseFloat(r.spend) || 0),
  0,
);
const marketplaceMeta = buildMetaDailyRows(campaignDays).reduce(
  (s, r) => s + r.spend,
  0,
);
const excludedMeta = campaignDays
  .filter((r) => !isMarketplaceCampaign(r.campaign_name))
  .reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
const bqSpend = await fetchSpendData(startDate, endDate);
const bqMeta = bqSpend
  .filter((r) => r.platform.toLowerCase() === "meta")
  .reduce((s, r) => s + r.spend, 0);
console.log(
  `  Meta API, account act_885632589057558, ALL campaigns:     ${money(allMeta)}`,
);
console.log(
  `  Meta API, marketplace-only (dashboard number):            ${money(marketplaceMeta)}`,
);
console.log(
  `  Excluded WanderOS/Listed spend:                           ${money(excludedMeta)} (${((excludedMeta / (allMeta || 1)) * 100).toFixed(0)}%)`,
);
console.log(
  `  BQ adnetwork Meta (ALL Wander accounts — expected higher): ${money(bqMeta)}`,
);
console.log(
  `  Sanity: BQ/API-all ratio ${(bqMeta / (allMeta || 1)).toFixed(2)}× (historically ~1.2-1.6×; >2× or <1× needs a look)`,
);

// ---------------------------------------------------------------------------
// 4. Per-channel table vs true totals (differ BY DESIGN — Decision #9g)
// ---------------------------------------------------------------------------
console.log(`\n── 4. Channel table vs true totals ──`);
const channelBookings = summary.channels.reduce(
  (s, c) => s + (c.bookings ?? 0),
  0,
);
const otherRows = rows.filter((r) => r.channel === "other");
const otherBookings = otherRows.reduce((s, r) => s + (r.bookings ?? 0), 0);
console.log(
  `  channel-table bookings (platform-attributed): ${channelBookings}`,
);
console.log(`  true-total bookings (analytics.bookings):     ${t.bookings}`);
console.log(`  'other' bucket (unattributed, kept visible):  ${otherBookings}`);
console.log(
  `  NOTE: these don't sum to each other by design (§2 of GROWTH_TRACKER_CONTEXT).`,
);

// ---------------------------------------------------------------------------
// 5. Fixed-cost month echo
// ---------------------------------------------------------------------------
console.log(`\n── 5. Fixed-cost config echo (current month) ──`);
const month = endDate.slice(0, 7);
for (const fc of resolveFixedCostsForMonth(month)) {
  console.log(
    `  ${fc.category.padEnd(14)} ${money(fc.monthlyAmount).padStart(10)}/mo  (${fc.partner ?? "—"}, effective ${fc.effectiveMonth}${fc.note ? ` — ${fc.note}` : ""})`,
  );
}

// ---------------------------------------------------------------------------
// 6. Channel table
// ---------------------------------------------------------------------------
console.log(`\n── 6. Channel table ──`);
for (const c of summary.channels) {
  console.log(
    `  ${c.channel.padEnd(13)} spend ${money(c.spend ?? 0).padStart(9)}  bookings ${String(c.bookings ?? 0).padStart(4)}  gmv ${money(c.gmv ?? 0).padStart(11)}  cpb ${c.cpb ? money(c.cpb) : "—"}  roas ${c.roas ? c.roas.toFixed(1) + "x" : "—"}  [${c.dataSource}]`,
  );
}

console.log(`\nDone.\n`);
