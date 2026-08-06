import "server-only";

import { and, desc, eq, gte, isNull } from "drizzle-orm";

import {
  aggregateActions,
  isImpactConfigured,
  listActionInquiries,
  listActions,
  listInvoices,
  listMediaPartners,
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
//   1. snapshot yesterday's actions into affiliate_metric_daily
//   2. sync the network partner list into affiliate_partner
//   3. queue PENDING partners as application items (+ Slack ping)
//   4. tracking-health alert: zero actions against a non-zero trailing baseline
// Everything is per active impact program; without credentials or an
// externalProgramId the run logs a skip and exits cleanly.

export interface ProgramMonitorResult {
  programId: string;
  skipped?: string;
  actions?: number;
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

/**
 * Tracking-health check: zero actions yesterday while the trailing 7 days
 * averaged ≥1/day smells like broken tracking, not a slow day. One finding per
 * calendar day (dedup key), broadcast as engage.
 */
async function checkTrackingHealth(
  program: PartnerProgram,
  yesterdayActions: number,
): Promise<boolean> {
  if (yesterdayActions > 0) return false;

  const { day } = yesterdayUtc();
  const trailingStart = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const trailing = await db
    .select({
      actions: affiliateMetricDailyTable.actions,
      date: affiliateMetricDailyTable.date,
    })
    .from(affiliateMetricDailyTable)
    .where(
      and(
        eq(affiliateMetricDailyTable.programId, program.id),
        isNull(affiliateMetricDailyTable.partnerId),
        gte(affiliateMetricDailyTable.date, trailingStart),
      ),
    )
    .orderBy(desc(affiliateMetricDailyTable.date));

  const prior = trailing.filter((r) => r.date !== day);
  if (prior.length === 0) return false; // no baseline yet — first days of data
  const avg = prior.reduce((s, r) => s + (r.actions ?? 0), 0) / prior.length;
  if (avg < 1) return false; // program is just quiet

  const inserted = await db
    .insert(affiliateItemTable)
    .values({
      programId: program.id,
      kind: "finding",
      dedupKey: `tracking-health:${day}`,
      title: "Possible tracking break — zero affiliate actions yesterday",
      snippet: `0 actions on ${day} against a trailing average of ${avg.toFixed(1)}/day. Check the Impact tracking status and the Order Completed emitter before partners notice.`,
      suggestedAction: "engage",
      rationale: "Zero-action day against a non-zero baseline.",
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
      const metrics = await snapshotMetrics(program, program.externalProgramId);
      const { synced, pending } = await syncPartners(
        program,
        program.externalProgramId,
      );
      const applicationsQueued = await queueApplications(program, pending);
      const trackingAlert = await checkTrackingHealth(program, metrics.actions);
      const inquiriesQueued = await checkInquiries(
        program,
        program.externalProgramId,
      );
      const overdueInvoices = await checkOverdueInvoices(program);
      results.push({
        programId: program.id,
        actions: metrics.actions,
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
