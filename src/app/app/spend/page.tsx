import Link from "next/link";
import { redirect } from "next/navigation";

import { StatCard } from "@/components/ui/stat-card";
import { MyAreaChart } from "@/components/ui/charts/MyAreaChart";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/better-auth/server";
import {
  ACTIVE_CHANNELS,
  CHANNEL_CONFIG,
  CPB_TARGET,
} from "@/server/services/spend-tracker/spend-tracker.config";
import {
  buildSpendTrend,
  getSpendTracker,
  resolveSpendWindow,
} from "@/server/services/spend-tracker/spend-tracker.service";

// Spend Tracker — marketing unit-economics dashboard, ported from Brian's
// wander-growth-tracker (Supabase/Railway app retired). Methodology is locked;
// see the section at the bottom of the page and spend-tracker.config.ts.

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "mtd", label: "MTD" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function windowFor(range: RangeKey) {
  if (range === "mtd") {
    const mtdStart = `${new Date().toISOString().slice(0, 7)}-01`;
    return resolveSpendWindow({ start: mtdStart });
  }
  return resolveSpendWindow({ days: Number(range) });
}

const money = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "—"
    : `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
const compact = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
const int = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US");
// House rule: data we don't have renders "—", never $0. A real, measured zero
// DOES render as $0/0 — that's how a paused channel (Comcast, affiliate,
// influencers from Aug 2026) reads as "paused" rather than "missing".
const moneyOr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : money(n);
const compactOr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : compact(n);
const intOr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : int(n);
const roasOr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n.toFixed(1)}x`;

/** Per-channel health dot: CPB against the $500 target; grey = nothing attributed. */
function channelTone(c: {
  bookings: number | null;
  cpb?: number | null;
}): "good" | "bad" | null {
  if (!c.bookings || c.cpb === null || c.cpb === undefined) return null;
  return c.cpb <= CPB_TARGET ? "good" : "bad";
}

/**
 * KPI tile for this page — same StatCard, growth-tracker sizing (roomier card,
 * big mono figure) so the numbers read at a glance on a wall screen.
 */
function Kpi(props: Parameters<typeof StatCard>[0]) {
  return <StatCard {...props} presentation="wall" />;
}

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; end?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const params = await searchParams;
  const range: RangeKey =
    RANGES.find((r) => r.key === params.range)?.key ?? "90";
  let { startDate, endDate } = windowFor(range);
  // Power-user lagged view: ?end=YYYY-MM-DD shifts the whole window back so
  // you can look at fully-settled data (gross take restates for ~a week).
  if (
    params.end &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.end) &&
    params.end < endDate
  ) {
    const days = Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
    );
    endDate = params.end;
    if (range !== "mtd") {
      startDate = new Date(
        new Date(`${params.end}T00:00:00Z`).getTime() - days * 86400000,
      )
        .toISOString()
        .slice(0, 10);
    }
  }
  const { summary, rows } = await getSpendTracker(startDate, endDate);
  const t = summary.totals;
  const e = summary.efficiency;
  const health = summary.dataHealth;

  const dcpbTone =
    e.directCpb <= 400 ? "good" : e.directCpb <= CPB_TARGET ? "warn" : "bad";

  // Pacing projects THIS month's end-of-month spend — only meaningful when the
  // window is the current month. On 30/90d views the variable-channel run-rate
  // formula (windowSpend / daysElapsedThisMonth) extrapolates garbage, so the
  // column is hidden.
  const showPacing = range === "mtd";

  // Trend chart: one series per active channel that actually has spend.
  const trend = buildSpendTrend(rows);
  const series = ACTIVE_CHANNELS.filter((ch) =>
    trend.some((p) => ((p[ch] as number) ?? 0) > 0),
  ).map((ch) => ({
    dataKey: ch,
    label: CHANNEL_CONFIG[ch].name,
    color: CHANNEL_CONFIG[ch].color,
    stackId: "spend",
  }));

  const healthStyles: Record<string, string> = {
    healthy: "bg-emerald-500/15 text-emerald-300",
    stale: "bg-amber-500/15 text-amber-300",
    incomplete: "bg-red-500/15 text-red-300",
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Spend</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Marketing unit economics · {startDate} → {endDate} ·{" "}
            <a href="#methodology" className="underline underline-offset-2">
              what am I looking at?
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              healthStyles[health.status],
            )}
            title={health.message ?? undefined}
          >
            {health.status}
            {health.message ? ` · ${health.message}` : ""}
          </span>
          <div className="flex rounded-lg border p-0.5">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/app/spend?range=${r.key}`}
                className={cn(
                  "rounded-md px-3 py-1 text-sm",
                  r.key === range
                    ? "bg-secondary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* KPI grid — growth-tracker card order */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Kpi
          label="Marketing Spend"
          explainer="Everything spent on marketing in this window: ad platforms (Meta, Google) plus fixed monthly costs (BDRs, TV, content, affiliate) pro-rated per day. Loyalty points and coupons are not included."
          value={compact(t.totalMarketingSpend)}
          hint={`${compact(t.adSpend)} ads + ${compact(t.fixedCosts)} fixed`}
        />
        <Kpi
          label="Total Bookings"
          explainer="Finance-aligned count: confirmed, profit-generating bookings; Sites excluded; cancellations NOT netted. Deliberately does not match the channel table's sum — that view uses platform attribution."
          value={int(t.bookings)}
          hint={`${int(t.directBookings)} direct (${int(t.wanderDirectBookings)} wander + ${int(t.manualBookings)} manual) · ${int(t.otaBookings)} OTA`}
        />
        <Kpi
          label="DCPB · primary"
          explainer="Direct Cost Per Booking — the primary efficiency metric. Total marketing spend ÷ direct bookings (booked on wander.com, not OTAs). Target under $500: green <$400, amber ≤$500, red above."
          value={money(e.directCpb)}
          hint={`target $${CPB_TARGET} · spend / direct bookings`}
          tone={dcpbTone}
        />
        <Kpi
          label="CPB"
          explainer="Spend ÷ ALL bookings including OTAs (Airbnb, Vrbo, Booking.com, Amex). Reference only — OTA bookings arrive without ad spend, so this always looks better than DCPB."
          value={money(e.cpb)}
          hint="spend / all bookings incl. OTA"
        />
        <Kpi
          label="Total GMV"
          explainer="Full booking value at the moment of booking (not revenue-recognized), including bookings later cancelled. Dylan Wright's canonical definition (analytics.report_gmv)."
          value={compact(t.gmv)}
          hint={`${compact(t.directGmv)} direct · ${compact(t.otaGmv)} OTA`}
        />
        <Kpi
          label="Fixed Costs"
          explainer="Pre-committed monthly costs (BDRs + OpenPhone, TV, amortized content, affiliate, SEO, influencers) pro-rated across the days in this window; the in-progress UTC day counts $0. Effective-dated in spend-tracker.config.ts — a cancelled retainer drops to $0 from its effective month."
          value={compact(t.fixedCosts)}
          hint="daily pro-rated"
        />
        <Kpi
          label="Checkouts Started"
          explainer="Checkout starts attributed last-touch. A top-of-funnel volume signal — most don't convert."
          value={int(t.checkoutStarted)}
          hint="last-touch attribution"
        />
        <Kpi
          label="Gross Take"
          explainer="Wander's revenue share (platform + management fees) from the dbt north-star model. Recognition-based: recent days keep filling in for about a week."
          value={summary.northStar ? compact(summary.northStar.grossTake) : "—"}
          hint="dbt north-star model"
        />
        <Kpi
          label="Net Take"
          explainer="Gross take minus ALL marketing spend. Gross take backfills for ~a week while spend is final immediately, so recent windows read low at first — trust the settled figure (both sides clipped to a week ago)."
          value={summary.northStar ? compact(summary.northStar.netTake) : "—"}
          hint={
            summary.northStar?.settled
              ? `recent days still recognizing · settled thru ${summary.northStar.settled.through.slice(5)}: ${compact(summary.northStar.settled.netTake)}`
              : "gross take − complete spend"
          }
          tone={
            summary.northStar
              ? (summary.northStar.settled?.netTake ??
                  summary.northStar.netTake) >= 0
                ? "good"
                : "bad"
              : undefined
          }
        />
        <Kpi
          label="Net Take / Direct"
          explainer="Profit per direct booking after every marketing dollar (ads + fixed costs)."
          value={
            summary.northStar && t.directBookings > 0
              ? money(summary.northStar.netTake / t.directBookings)
              : "—"
          }
          hint="per direct booking"
        />
        <Kpi
          label="Net Take / Total"
          explainer="Profit per booking across every channel including the OTAs, which arrive without ad spend. Always flatters the direct figure — reference only."
          value={
            summary.northStar && t.bookings > 0
              ? money(summary.northStar.netTake / t.bookings)
              : "—"
          }
          hint="per total booking"
        />
        <Kpi
          label="ROAS"
          explainer="For every $1 of AD spend (fixed costs excluded), dollars of estimated take-rate revenue: GMV × 20% blended take rate — a locked, deliberately Operated-leaning constant."
          value={`${e.roas.toFixed(1)}x`}
          hint="GMV × 20% take / ad spend"
        />
        <Kpi
          label="Account Creations"
          explainer="New account signups, last-touch attribution. CPAC = total marketing spend per new account."
          value={int(t.accountCreations)}
          hint={`CPAC ${money(e.cpac)}`}
        />
        <Kpi
          label="Take Rate Revenue"
          explainer="What Wander actually earned on this window's bookings: booking_revenue_recognized summed from BigQuery. The 'real' counterpart to the 20% ROAS proxy."
          value={compact(t.takeRateRevenue)}
          hint="booking_revenue_recognized (BQ)"
        />
      </div>

      {/* Channel table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 text-right font-medium">Spend</th>
              {showPacing && (
                <th
                  className="px-4 py-3 text-right font-medium"
                  title="Projected end-of-month spend, extrapolated from completed days only (the in-progress day is excluded — fixed costs count it as $0 and ad platforms report it late)."
                >
                  Pacing
                </th>
              )}
              <th className="px-4 py-3 text-right font-medium">Bookings</th>
              <th className="px-4 py-3 text-right font-medium">CPB</th>
              <th className="px-4 py-3 text-right font-medium">ROAS</th>
              <th className="px-4 py-3 text-right font-medium">GMV</th>
              {showPacing && (
                <th
                  className="px-4 py-3 text-right font-medium"
                  title="Projected end-of-month GMV on the same completed-days run rate as spend pacing."
                >
                  GMV pacing
                </th>
              )}
              <th className="px-4 py-3 text-right font-medium">Checkouts</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">CPB vs target</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.channels.map((c) => {
              const cfg = CHANNEL_CONFIG[c.channel];
              const tone = channelTone(c);
              return (
                <tr key={c.channel} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: cfg.color }}
                      >
                        {cfg.abbreviation}
                      </span>
                      <span>
                        <span className="block leading-tight font-medium">
                          {cfg.name}
                        </span>
                        <span className="block text-xs leading-tight text-muted-foreground">
                          {c.dataSource}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {compactOr(c.spend)}
                  </td>
                  {showPacing && (
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                      {compactOr(c.pacing)}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {intOr(c.bookings)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {moneyOr(c.cpb)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {roasOr(c.roas)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {compactOr(c.gmv)}
                  </td>
                  {showPacing && (
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                      {compactOr(c.gmvPacing)}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                    {intOr(c.checkoutStarted)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-block size-2 rounded-full",
                        tone === "good" && "bg-emerald-400",
                        tone === "bad" && "bg-red-400",
                        tone === null && "bg-muted-foreground/30",
                      )}
                      title={
                        tone === null
                          ? "No attributed bookings in this window"
                          : `CPB ${money(c.cpb)} vs $${CPB_TARGET} target`
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="-mt-6 text-xs text-muted-foreground">
        Channel rows are platform-attributed (Meta = 28d click + 1d view; others
        = BigQuery last-touch) and labelled with their source under the channel
        name. Top-line KPI cards use finance-aligned totals — the two don&apos;t
        sum to each other by design. The dot reads CPB against the ${CPB_TARGET}{" "}
        target; grey means nothing was attributed to that channel.
      </p>

      {/* Trend */}
      <MyAreaChart
        data={trend}
        series={series}
        title="Daily spend by channel"
        description={`${startDate} → ${endDate} · fixed costs pro-rated daily, in-progress day = $0`}
      />

      {/* Methodology */}
      <details id="methodology" className="scroll-mt-8 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Methodology — locked decisions
        </summary>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground [&_b]:text-foreground">
          <p>
            <b>DCPB (primary, ${CPB_TARGET} target)</b> = total marketing spend
            / direct bookings. Direct excludes the 4 OTAs (Airbnb, Vrbo,
            Booking.com, Amex — mybookingpal is Amex, not Booking.com).
          </p>
          <p>
            <b>Marketing spend</b> = ad spend + fixed costs. No loyalty points,
            no coupons (revenue reductions, not acquisition costs — Kyle, Mar 19
            2026). Fixed costs are effective-dated config in the repo, pro-rated
            daily; the in-progress UTC day counts $0.
          </p>
          <p>
            <b>ROAS</b> = (GMV × 20% blended take rate) / <i>ad</i> spend. The
            20% is a locked Operated-leaning constant (Decision #4) —
            deliberately above the ~12% OTA-loaded blended take.
          </p>
          <p>
            <b>Bookings</b> have two views: top-line cards use{" "}
            <code>analytics.bookings</code> (confirmed, profit, no Sites —
            cancellations not netted); the channel table uses platform
            attribution (Meta API 28d click + 1d view, marketplace campaigns
            only) with BigQuery last-touch for the rest.
          </p>
          <p>
            <b>GMV</b> = full booking value at booking-creation date (not
            revenue-recognized), from <code>analytics.report_gmv</code> (Dylan
            Wright canonical, May 2026). Includes cancelled bookings.
          </p>
          <p>
            <b>Net take</b> = gross take (dbt north-star) − complete marketing
            spend. No 1.70× multiplier (killed May 2026). Gross take is
            recognition-based and <i>restates upward for ~a week</i> (Jul 1–6
            2026 restated +57% within 4 days), so recent-day net take always
            reads low at first — the tile shows a settled-through-T-7 figure
            alongside, and <code>?end=YYYY-MM-DD</code> shifts any window back
            for a fully-settled view. Spend, bookings, and GMV do NOT restate —
            only this metric lags.
          </p>
          <p>
            <b>Meta scope:</b> single ad account act_885632589057558, WanderOS/
            Listed campaigns excluded by denylist (fail-pessimistic). Funnel
            queries always filter <code>attribution_model = last_touch</code>.
          </p>
          <p>
            <b>Demand sales:</b> spend = BDR salaries (fixed costs); bookings +
            GMV reported by the team directly in{" "}
            <code>spend-tracker.config.ts</code> (no more Google Sheets).
          </p>
          <p className="pt-1">
            Full explainer: <code>docs/spend-tracker.md</code> in this repo.
            Decision provenance: <code>docs/GROWTH_TRACKER_CONTEXT.md</code> in
            Brian&apos;s wander-growth-tracker repo, §12 — every constant here
            traces to a locked decision there.
          </p>
        </div>
      </details>
    </div>
  );
}
