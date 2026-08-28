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
//   4. tracking-break alert: zero clicks against a healthy click baseline —
//      see evaluateTrackingHealth
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
  platformCampaignId: string,
  clicks?: number,
): Promise<{ actions: number; revenue: number }> {
  const { start, end, day } = yesterdayUtc();
  const actions = await listActions({
    platformCampaignId,
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
  platformCampaignId: string,
): Promise<{
  synced: number;
  pending: Array<{ id: string; name?: string; website?: string }>;
}> {
  const partners = await listMediaPartners({ platformCampaignId });
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

// Tracking-break alarm. The retired check ("zero actions yesterday while the
// trailing average is ≥1") sat right on top of the program's real run rate
// (~1.1 actions/day), where a Poisson zero day happens ~1 day in 3 — it paged
// on arithmetic, not on signal (4 pages in the first 9 days of Aug 2026).
// Clicks are the signal that can't false-alarm: they run ~40–65/day on the
// live program and never touch anything Wander owns (partner link → Impact's
// sjv.io redirect → wander.com), so a zero-click day means the Impact-side
// tracking layer is dead — program suspended, top partner pulled links, or
// redirect breakage. Actions alone never page: slow conversion weeks belong to
// the weekly report, not an alert.
const CLICK_BASELINE_MIN = 10; // clicks/day before the zero-click alarm arms

export interface TrackingHealthFinding {
  runStart: string; // first day of the zero-click run — the episode's dedup anchor
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
  if (days[0].clicks > 0) return null;

  let run = 1;
  while (run < days.length && days[run]!.clicks === 0) run++;
  const prior = days.slice(run, run + 7);
  const clickAvg =
    prior.length > 0
      ? prior.reduce((s, d) => s + d.clicks, 0) / prior.length
      : 0;
  if (clickAvg < CLICK_BASELINE_MIN) return null; // low-click program — no signal

  const runStart = days[run - 1]!.date;
  return {
    runStart,
    title: "Tracking break — zero affiliate clicks",
    snippet: `0 clicks since ${runStart} against ~${Math.round(clickAvg)}/day. The tracking layer looks dead, not quiet — check the Impact tracking status and partner links now.`,
    rationale:
      "Clicks are high-volume and live on Impact's infrastructure, so a zero-click day is a hard failure signal — unlike a zero-action day.",
  };
}

/**
 * Tracking-break check over the live by-day series. One finding per episode:
 * the dedup key anchors on the zero-run's first day, so an ongoing break
 * pages once and then stays quiet while it persists.
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
      dedupKey: `tracking-break:${finding.runStart}`,
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
  platformCampaignId: string,
): Promise<number> {
  const inquiries = await listActionInquiries(platformCampaignId);
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
      // By-day report: clicks for the snapshot + the break check's series
      // (yesterday + a 7-day click baseline, with slack for a short zero run).
      // A report failure must not kill the run — log it and continue; the
      // break check just stays silent that day.
      const { day } = yesterdayUtc();
      let byDay: ImpactDayPerformance[] | null = null;
      try {
        byDay = await listPerformanceByDay({
          platformCampaignId: program.externalProgramId,
          startDay: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)
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
