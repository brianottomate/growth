import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import {
  aggregateActions,
  type ImpactDayPerformance,
  isImpactConfigured,
  listActionInquiries,
  listActions,
  listInvoices,
  listMediaPartners,
  listPerformanceByDay,
} from "@/server/clients/impact.client";
import { db } from "@/server/db";
import {
  affiliateItemTable,
  affiliateMetricDailyTable,
  affiliatePartnerTable,
  partnerProgramTable,
  type AffiliateItem,
  type PartnerProgram,
} from "@/server/db/affiliate-schema";

import {
  postAffiliateItemsToRadio,
  postConversionsToRadio,
} from "./affiliate-notify.service";

// Daily affiliate monitor (Vercel cron → /api/cron/affiliate). Replaces the
// agency's "Daily Performance & Balance" + "Applications" playbook rows
// (docs/affiliate-program-takeover.md §4):
//   1. snapshot yesterday's actions + clicks into affiliate_metric_daily
//   2. sync the network partner list into affiliate_partner
//   3. queue PENDING partners as application items (+ Slack ping)
//   4. tracking-health alert: zero clicks (break) or an improbable run of
//      zero-action days (drought) — see evaluateTrackingHealth
// Everything is per active impact program; without credentials or an
// externalProgramId the run logs a skip and exits cleanly.

export interface ProgramMonitorResult {
  programId: string;
  skipped?: string;
  actions?: number;
  clicks?: number;
  revenue?: number;
  partnersSynced?: number;
  applicationsQueued?: number;
  trackingAlert?: boolean;
  inquiriesQueued?: number;
  overdueInvoices?: number;
}

/** Yesterday as a UTC calendar day: [00:00, 24:00) plus its "YYYY-MM-DD". */
function yesterdayUtc(): { start: Date; end: Date; day: string } {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end, day: start.toISOString().slice(0, 10) };
}

async function snapshotMetrics(
  program: PartnerProgram,
  campaignId: string,
  clicks?: number,
): Promise<{ actions: number; revenue: number }> {
  const { start, end, day } = yesterdayUtc();
  const actions = await listActions({
    campaignId,
    actionDateStart: start,
    actionDateEnd: end,
  });
  const agg = aggregateActions(actions);

  // Program-level row for the day (partnerId null). No unique constraint on
  // nullable partnerId, so upsert manually; re-runs overwrite, never duplicate.
  const existing = await db
    .select({ id: affiliateMetricDailyTable.id })
    .from(affiliateMetricDailyTable)
    .where(
      and(
        eq(affiliateMetricDailyTable.programId, program.id),
        eq(affiliateMetricDailyTable.date, day),
        isNull(affiliateMetricDailyTable.partnerId),
      ),
    )
    .limit(1);

  const values = {
    actions: agg.count,
    clicks: clicks ?? null,
    revenue: agg.revenue,
    commission: agg.commission,
    raw: { actionIds: actions.map((a) => a.Id).slice(0, 500) },
  };
  if (existing[0]) {
    await db
      .update(affiliateMetricDailyTable)
      .set(values)
      .where(eq(affiliateMetricDailyTable.id, existing[0].id));
  } else {
    await db
      .insert(affiliateMetricDailyTable)
      .values({ programId: program.id, date: day, ...values });
    // First snapshot for this day → fire the per-conversion radio feed (a
    // re-run hits the update branch above and never double-posts).
    await postConversionsToRadio(
      actions.map((a) => ({
        id: a.Id,
        partnerName: a.MediaPartnerName,
        amount: typeof a.Amount === "string" ? Number(a.Amount) : a.Amount,
        payout: typeof a.Payout === "string" ? Number(a.Payout) : a.Payout,
        state: a.State,
        eventDate: a.EventDate,
      })),
    );
  }

  console.log(
    `[affiliate-monitor] ${program.id} ${day}: ${agg.count} actions, revenue ${agg.revenue.toFixed(2)}, commission ${agg.commission.toFixed(2)}`,
  );
  return { actions: agg.count, revenue: agg.revenue };
}

async function syncPartners(
  program: PartnerProgram,
  campaignId: string,
): Promise<{
  synced: number;
  pending: Array<{ id: string; name?: string; website?: string }>;
}> {
  const partners = await listMediaPartners({ campaignId });
  const pending: Array<{ id: string; name?: string; website?: string }> = [];

  for (const p of partners) {
    if (!p.Id) continue;
    if (p.State === "PENDING")
      pending.push({ id: p.Id, name: p.Name, website: p.Website });
    await db
      .insert(affiliatePartnerTable)
      .values({
        programId: program.id,
        externalId: p.Id,
        name: p.Name,
        state: p.State,
        website: p.Website,
        raw: p.raw,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          affiliatePartnerTable.programId,
          affiliatePartnerTable.externalId,
        ],
        set: {
          name: p.Name,
          state: p.State,
          website: p.Website,
          raw: p.raw,
          lastSyncedAt: new Date(),
        },
      });
  }

  console.log(
    `[affiliate-monitor] ${program.id}: synced ${partners.length} partner(s), ${pending.length} pending`,
  );
  return { synced: partners.length, pending };
}

/** Queue PENDING partners as application items (idempotent on external id). */
async function queueApplications(
  program: PartnerProgram,
  pending: Array<{ id: string; name?: string; website?: string }>,
): Promise<number> {
  const fresh: AffiliateItem[] = [];
  for (const p of pending) {
    const inserted = await db
      .insert(affiliateItemTable)
      .values({
        programId: program.id,
        kind: "application",
        dedupKey: `application:${p.id}`,
        title: `Partner application: ${p.name ?? p.id}`,
        snippet: p.website ? `Website: ${p.website}` : null,
        suggestedAction: "engage",
        rationale:
          "New partner application is PENDING on Impact — review and approve/decline in the Impact dashboard.",
        receivedAt: new Date(),
        raw: p,
      })
      .onConflictDoNothing({
        target: [affiliateItemTable.programId, affiliateItemTable.dedupKey],
      })
      .returning();
    if (inserted[0]) fresh.push(inserted[0]);
  }
  if (fresh.length > 0) await postAffiliateItemsToRadio(fresh);
  return fresh.length;
}

// Tracking-health thresholds. The retired check ("zero actions yesterday while
// the trailing average is ≥1") sat right on top of the program's real run rate
// (~1.1 actions/day), where a Poisson zero day happens ~1 day in 3 — it paged
// on arithmetic, not on signal (4 pages in the first 9 days of Aug 2026). Two
// signals replace it, both read live from the Performance by Day report so
// late-posting actions are already reflected:
//   - tracking break: zero CLICKS. Clicks run ~40–65/day on the live program,
//     so even one zero-click day means the tracking layer is dead, not quiet.
//   - conversion drought: a run of zero-ACTION days long enough to be
//     improbable against the baseline (run × λ ≥ 4 ⇒ P < e⁻⁴ ≈ 2%).
const CLICK_BASELINE_MIN = 10; // clicks/day before the zero-click signal arms
const DROUGHT_MIN_DAYS = 2;
const DROUGHT_MIN_EXPECTED = 4; // zero-run length × baseline actions/day

export interface TrackingHealthFinding {
  kind: "tracking-break" | "conversion-drought";
  runStart: string; // first day of the zero run — the episode's dedup anchor
  title: string;
  snippet: string;
  rationale: string;
}

/**
 * Decide whether the by-day series warrants a page. `days` is newest-first,
 * one row per calendar day, ending at `yesterday`. Pure — exported for tests.
 */
export function evaluateTrackingHealth(
  days: ImpactDayPerformance[],
  yesterday: string,
): TrackingHealthFinding | null {
  if (days[0]?.date !== yesterday) return null; // report gap — say nothing

  // Zero-click run ending yesterday → the tracking layer itself looks dead.
  if (days[0].clicks === 0) {
    let run = 1;
    while (run < days.length && days[run]!.clicks === 0) run++;
    const prior = days.slice(run, run + 7);
    const clickAvg =
      prior.length > 0
        ? prior.reduce((s, d) => s + d.clicks, 0) / prior.length
        : 0;
    if (clickAvg >= CLICK_BASELINE_MIN) {
      const runStart = days[run - 1]!.date;
      return {
        kind: "tracking-break",
        runStart,
        title: "Tracking break — zero affiliate clicks",
        snippet: `0 clicks since ${runStart} against ~${Math.round(clickAvg)}/day. The tracking layer looks dead, not quiet — check the Impact tracking status and partner links now.`,
        rationale:
          "Clicks are high-volume, so a zero-click day is a hard failure signal — unlike a zero-action day.",
      };
    }
  }

  // Zero-action run ending yesterday, long enough to be improbable.
  let run = 0;
  while (run < days.length && days[run]!.actions === 0) run++;
  if (run < DROUGHT_MIN_DAYS || run >= days.length) return null;
  const prior = days.slice(run, run + 14);
  if (prior.length < 3) return null; // not enough baseline yet
  const lambda = prior.reduce((s, d) => s + d.actions, 0) / prior.length;
  if (run * lambda < DROUGHT_MIN_EXPECTED) return null;

  const runStart = days[run - 1]!.date;
  const pct = Math.exp(-run * lambda) * 100;
  const clicksNote =
    days[0].clicks > 0
      ? ` Clicks are still flowing (${days[0].clicks} yesterday), so suspect the funnel or attribution rather than the tracking layer.`
      : "";
  return {
    kind: "conversion-drought",
    runStart,
    title: `Conversion drought — ${run} zero-action days`,
    snippet: `No actions since ${runStart} against a baseline of ${lambda.toFixed(1)}/day (~${pct < 0.1 ? "<0.1" : pct.toFixed(1)}% odds of a quiet streak this long).${clicksNote}`,
    rationale:
      "A zero-action run this long is improbable at the program's baseline rate.",
  };
}

/**
 * Tracking-health check over the live by-day series. One finding per episode:
 * the dedup key anchors on the zero-run's first day, so an ongoing break or
 * drought pages once and then stays quiet while it persists.
 */
async function checkTrackingHealth(
  program: PartnerProgram,
  byDay: ImpactDayPerformance[] | null,
): Promise<boolean> {
  if (!byDay) return false;
  const { day } = yesterdayUtc();
  const finding = evaluateTrackingHealth(byDay, day);
  if (!finding) return false;

  const inserted = await db
    .insert(affiliateItemTable)
    .values({
      programId: program.id,
      kind: "finding",
      dedupKey: `${finding.kind}:${finding.runStart}`,
      title: finding.title,
      snippet: finding.snippet,
      suggestedAction: "engage",
      rationale: finding.rationale,
      receivedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [affiliateItemTable.programId, affiliateItemTable.dedupKey],
    })
    .returning();
  if (inserted[0]) await postAffiliateItemsToRadio(inserted);
  return inserted.length > 0;
}

/**
 * Open partner disputes (ActionInquiries) → triage items. Field shape is only
 * loosely documented, so titles are best-effort from raw and the full payload
 * rides along. Resolved/closed inquiries are skipped when a status says so.
 */
async function checkInquiries(
  program: PartnerProgram,
  campaignId: string,
): Promise<number> {
  const inquiries = await listActionInquiries(campaignId);
  const fresh: AffiliateItem[] = [];
  for (const inq of inquiries) {
    if (!inq.Id) continue;
    const status = inq.Status?.toUpperCase() ?? "";
    if (["RESOLVED", "CLOSED", "COMPLETED"].includes(status)) continue;
    const r = inq.raw;
    const partner =
      (r.MediaPartnerName as string | undefined) ??
      (r.MediaName as string | undefined);
    const inserted = await db
      .insert(affiliateItemTable)
      .values({
        programId: program.id,
        kind: "inquiry",
        dedupKey: `inquiry:${inq.Id}`,
        title: `Partner dispute ${inq.Id}${partner ? ` — ${partner}` : ""}`,
        snippet: JSON.stringify(r).slice(0, 600),
        suggestedAction: "engage",
        rationale:
          "Open action inquiry on Impact — a partner formally disputes attribution or payout. Review and resolve in the Impact dashboard.",
        receivedAt: new Date(),
        raw: r,
      })
      .onConflictDoNothing({
        target: [affiliateItemTable.programId, affiliateItemTable.dedupKey],
      })
      .returning();
    if (inserted[0]) fresh.push(inserted[0]);
  }
  if (fresh.length > 0) await postAffiliateItemsToRadio(fresh);
  return fresh.length;
}

/**
 * Overdue partner-payout invoice line items → findings. Overdue payouts are
 * how a program quietly burns partner trust (6 were live on the account at
 * build time). Invoices are account-level; with one active program this runs
 * once — revisit the dedup scope if a second program ever activates.
 */
async function checkOverdueInvoices(program: PartnerProgram): Promise<number> {
  const invoices = await listInvoices();
  const fresh: AffiliateItem[] = [];
  for (const inv of invoices) {
    const overdue = inv.LineItems.filter(
      (l) => l.Status?.toUpperCase() === "OVERDUE",
    );
    if (overdue.length === 0) continue;
    const total = overdue.reduce(
      (s, l) => s + (Number(l.TotalItemAmount) || 0),
      0,
    );
    const inserted = await db
      .insert(affiliateItemTable)
      .values({
        programId: program.id,
        kind: "finding",
        dedupKey: `invoice-overdue:${inv.Id}`,
        title: `Overdue partner payout — invoice ${inv.Id}${inv.MediaName ? ` (${inv.MediaName})` : ""}`,
        snippet: `${overdue.length} overdue line item(s) totalling $${total.toFixed(2)}. Due ${overdue[0]?.DueDate?.slice(0, 10) ?? "?"}. Check funding/autopay in the Impact dashboard.`,
        suggestedAction: "engage",
        rationale: "Overdue payouts erode partner trust and program standing.",
        receivedAt: new Date(),
        raw: inv,
      })
      .onConflictDoNothing({
        target: [affiliateItemTable.programId, affiliateItemTable.dedupKey],
      })
      .returning();
    if (inserted[0]) fresh.push(inserted[0]);
  }
  if (fresh.length > 0) await postAffiliateItemsToRadio(fresh);
  return fresh.length;
}

export async function runDailyAffiliateMonitor(): Promise<
  ProgramMonitorResult[]
> {
  const programs = await db
    .select()
    .from(partnerProgramTable)
    .where(eq(partnerProgramTable.status, "active"));

  const results: ProgramMonitorResult[] = [];
  for (const program of programs) {
    if (program.network !== "impact") {
      results.push({
        programId: program.id,
        skipped: `network ${program.network}`,
      });
      continue;
    }
    if (!isImpactConfigured()) {
      console.log(
        `[affiliate-monitor] ${program.id}: IMPACT_* credentials not set — skipping`,
      );
      results.push({ programId: program.id, skipped: "no credentials" });
      continue;
    }
    if (!program.externalProgramId) {
      console.log(
        `[affiliate-monitor] ${program.id}: externalProgramId not set — skipping`,
      );
      results.push({ programId: program.id, skipped: "no externalProgramId" });
      continue;
    }

    try {
      // By-day report: clicks for the snapshot + the health check's series.
      // Trailing ~3 weeks gives the drought check its 14-day baseline even
      // after a multi-day zero run. A report failure must not kill the run —
      // log it and continue; the health check just stays silent that day.
      const { day } = yesterdayUtc();
      let byDay: ImpactDayPerformance[] | null = null;
      try {
        byDay = await listPerformanceByDay({
          campaignId: program.externalProgramId,
          startDay: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          endDay: day,
        });
      } catch (error) {
        console.error(
          `[affiliate-monitor] ${program.id}: by-day report failed — tracking-health check skipped:`,
          error,
        );
      }
      const clicksYesterday = byDay?.find((r) => r.date === day)?.clicks;

      const metrics = await snapshotMetrics(
        program,
        program.externalProgramId,
        clicksYesterday,
      );
      const { synced, pending } = await syncPartners(
        program,
        program.externalProgramId,
      );
      const applicationsQueued = await queueApplications(program, pending);
      const trackingAlert = await checkTrackingHealth(program, byDay);
      const inquiriesQueued = await checkInquiries(
        program,
        program.externalProgramId,
      );
      const overdueInvoices = await checkOverdueInvoices(program);
      results.push({
        programId: program.id,
        actions: metrics.actions,
        clicks: clicksYesterday,
        revenue: metrics.revenue,
        partnersSynced: synced,
        applicationsQueued,
        trackingAlert,
        inquiriesQueued,
        overdueInvoices,
      });
    } catch (error) {
      console.error(`[affiliate-monitor] ${program.id} failed:`, error);
      results.push({
        programId: program.id,
        skipped: `error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return results;
}
