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
// Missing data renders as "—", never $0 (tracker house rule).
const moneyOrDash = (n: number | null | undefined) => (n ? money(n) : "—");

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
  if (params.end && /^\d{4}-\d{2}-\d{2}$/.test(params.end) && params.end < endDate) {
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
          <p className="text-muted-foreground mt-1 text-sm">
            Marketing unit economics · {startDate} → {endDate}
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

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Marketing Spend"
          value={compact(t.totalMarketingSpend)}
          hint={`${compact(t.adSpend)} ads + ${compact(t.fixedCosts)} fixed`}
        />
        <StatCard
          label="DCPB · primary"
          value={money(e.directCpb)}
          hint={`target $${CPB_TARGET} · spend / direct bookings`}
          tone={dcpbTone}
        />
        <StatCard
          label="CPB"
          value={money(e.cpb)}
          hint="spend / all bookings incl. OTA"
        />
        <StatCard
          label="ROAS"
          value={`${e.roas.toFixed(1)}x`}
          hint="GMV × 20% take / ad spend"
        />
        <StatCard
          label="Total Bookings"
          value={int(t.bookings)}
          hint={`${int(t.directBookings)} direct (${int(t.wanderDirectBookings)} wander + ${int(t.manualBookings)} manual) · ${int(t.otaBookings)} OTA`}
        />
        <StatCard
          label="Total GMV"
          value={compact(t.gmv)}
          hint={`${compact(t.directGmv)} direct · ${compact(t.otaGmv)} OTA`}
        />
        <StatCard
          label="Gross Take"
          value={summary.northStar ? compact(summary.northStar.grossTake) : "—"}
          hint="dbt north-star model"
        />
        <StatCard
          label="Net Take"
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
        <StatCard
          label="Checkouts Started"
          value={int(t.checkoutStarted)}
          hint="last-touch attribution"
        />
        <StatCard
          label="Account Creations"
          value={int(t.accountCreations)}
          hint={`CPAC ${money(e.cpac)}`}
        />
        <StatCard
          label="Net Take / Direct"
          value={
            summary.northStar && t.directBookings > 0
              ? money(summary.northStar.netTake / t.directBookings)
              : "—"
          }
          hint="profit per direct booking"
        />
        <StatCard
          label="Take Rate Revenue"
          value={compact(t.takeRateRevenue)}
          hint="booking_revenue_recognized (BQ)"
        />
      </div>

      {/* Channel table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 text-right font-medium">Spend</th>
              {showPacing && (
                <th className="px-4 py-3 text-right font-medium">Pacing (EOM)</th>
              )}
              <th className="px-4 py-3 text-right font-medium">Bookings</th>
              <th className="px-4 py-3 text-right font-medium">GMV</th>
              <th className="px-4 py-3 text-right font-medium">CPB</th>
              <th className="px-4 py-3 text-right font-medium">ROAS</th>
              <th className="px-4 py-3 text-right font-medium">Checkouts</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {summary.channels.map((c) => {
              const cfg = CHANNEL_CONFIG[c.channel];
              return (
                <tr key={c.channel} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: cfg.color }}
                      />
                      <span className="font-medium">{cfg.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {moneyOrDash(c.spend)}
                  </td>
                  {showPacing && (
                    <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                      {c.pacing ? money(c.pacing) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.bookings ? int(c.bookings) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {moneyOrDash(c.gmv)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.cpb ? money(c.cpb) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.roas ? `${c.roas.toFixed(1)}x` : "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                    {c.checkoutStarted ? int(c.checkoutStarted) : "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 text-xs">
                    {c.dataSource}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground -mt-6 text-xs">
        Channel rows are platform-attributed (Meta = 28d click + 1d view;
        others = BigQuery last-touch). Top-line KPI cards use finance-aligned
        totals — the two don&apos;t sum to each other by design.
      </p>

      {/* Trend */}
      <MyAreaChart
        data={trend}
        series={series}
        title="Daily spend by channel"
        description={`${startDate} → ${endDate} · fixed costs pro-rated daily, in-progress day = $0`}
      />

      {/* Methodology */}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Methodology — locked decisions
        </summary>
        <div className="text-muted-foreground mt-3 space-y-2 text-sm [&_b]:text-foreground">
          <p>
            <b>DCPB (primary, ${CPB_TARGET} target)</b> = total marketing spend
            / direct bookings. Direct excludes the 4 OTAs (Airbnb, Vrbo,
            Booking.com, Amex — mybookingpal is Amex, not Booking.com).
          </p>
          <p>
            <b>Marketing spend</b> = ad spend + fixed costs. No loyalty points,
            no coupons (revenue reductions, not acquisition costs — Kyle, Mar 19
            2026). Fixed costs are effective-dated config in the repo,
            pro-rated daily; the in-progress UTC day counts $0.
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
            for a fully-settled view. Spend, bookings, and GMV do NOT restate
            — only this metric lags.
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
            Full provenance: <code>docs/GROWTH_TRACKER_CONTEXT.md</code> in
            Brian&apos;s wander-growth-tracker repo, §12 — every constant here
            traces to a locked decision there.
          </p>
        </div>
      </details>
    </div>
  );
}
