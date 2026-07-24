import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { and, eq, gte, isNull } from "drizzle-orm";

import {
  isImpactConfigured,
  listActions,
  listInvoices,
  type ImpactAction,
} from "@/server/clients/impact.client";
import { postOnSlack } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import {
  affiliateItemTable,
  affiliateMetricDailyTable,
  affiliatePartnerTable,
  partnerProgramTable,
} from "@/server/db/affiliate-schema";

// Weekly affiliate program report (Mondays, vercel.json) — replaces AP's
// "Weekly Reports" playbook row and folds in their "Weekly Fraud Check": every
// action carries ReferringDomain/Type, IpAddress, PromoCode and CustomerStatus,
// and at this program's volume (single-digit actions/week) an LLM can review
// every single one rather than sampling. Output is a Slack post, not a PDF.

const REPORT_MODEL = anthropic("claude-sonnet-5");

const REPORT_SYSTEM = `You write the weekly report for Wander's affiliate program
(vacation rentals; runs on Impact.com; recently taken in-house from an agency).
Audience: the growth/partnerships team, in Slack.

Structure (Slack mrkdwn — *bold*, bullets with •, no headings/#, no tables):
1. One-line topline: actions, revenue, commission vs the prior week.
2. *Bookings* — one bullet per action: partner, amount → payout, state.
3. *Fraud review* — you ARE the weekly fraud check. For each action, judge the
   referring domain/type, IP presence, promo code use, and customer status
   against the partner's nature (a loyalty partner converting via its own
   domain is normal; a coupon site converting via an unrelated referrer, promo
   codes we did not issue, or duplicate IPs across actions are not). Say
   "nothing suspicious" plainly when that's the verdict — never invent concerns.
4. *Program health* — partner counts by state, pending applications, open desk
   items, overdue/pending payout invoices if any, and (one clause, for audit)
   how many junk emails triage auto-filed this week.
5. *Watch* — at most 2 bullets on what deserves attention next week. Omit the
   section if there's nothing real.

Under 300 words. Plain, factual, no cheerleading. Numbers verbatim from the
data — never recompute or estimate.`;

function summarizeAction(a: ImpactAction): Record<string, unknown> {
  return {
    id: a.Id,
    partner: a.MediaPartnerName,
    amount: a.Amount,
    payout: a.Payout,
    state: a.State,
    eventDate: a.EventDate,
    referringDomain: a.ReferringDomain || null,
    referringType: a.ReferringType || null,
    hasIp: Boolean(a.IpAddress),
    promoCode: a.PromoCode || null,
    customerStatus: a.CustomerStatus || null,
    customerCountry: a.CustomerCountry || null,
  };
}

export interface WeeklyReportResult {
  programId: string;
  skipped?: string;
  posted?: boolean;
  actions?: number;
}

// Same channel as affiliate-notify (#radio-affiliate) — kept local to avoid exporting it.
const RADIO_AFFILIATE_CHANNEL = "C0BH31P8W3S";

export async function runWeeklyAffiliateReport(): Promise<WeeklyReportResult[]> {
  const programs = await db
    .select()
    .from(partnerProgramTable)
    .where(eq(partnerProgramTable.status, "active"));

  const results: WeeklyReportResult[] = [];
  for (const program of programs) {
    if (program.network !== "impact" || !isImpactConfigured() || !program.externalProgramId) {
      results.push({ programId: program.id, skipped: "not configured" });
      continue;
    }

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 864e5);

      const actions = await listActions({
        campaignId: program.externalProgramId,
        actionDateStart: weekAgo,
        actionDateEnd: now,
      });

      // Prior-week comparison from our own snapshots (14d of program-level rows).
      const since = new Date(now.getTime() - 14 * 864e5).toISOString().slice(0, 10);
      const metricRows = await db
        .select()
        .from(affiliateMetricDailyTable)
        .where(
          and(
            eq(affiliateMetricDailyTable.programId, program.id),
            isNull(affiliateMetricDailyTable.partnerId),
            gte(affiliateMetricDailyTable.date, since),
          ),
        );
      const midpoint = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
      const priorWeek = metricRows.filter((r) => r.date < midpoint);

      const partners = await db
        .select({ state: affiliatePartnerTable.state })
        .from(affiliatePartnerTable)
        .where(eq(affiliatePartnerTable.programId, program.id));
      const partnersByState: Record<string, number> = {};
      for (const p of partners) {
        const key = p.state ?? "UNKNOWN";
        partnersByState[key] = (partnersByState[key] ?? 0) + 1;
      }

      const openItems = await db
        .select({ kind: affiliateItemTable.kind })
        .from(affiliateItemTable)
        .where(
          and(
            eq(affiliateItemTable.programId, program.id),
            eq(affiliateItemTable.status, "open"),
          ),
        );
      const openByKind: Record<string, number> = {};
      for (const i of openItems) openByKind[i.kind] = (openByKind[i.kind] ?? 0) + 1;

      // Junk the triage auto-filed this week (resolvedById null = system) — the
      // audit line that keeps silent filtering honest in the report.
      const autoDismissed = await db
        .select({ id: affiliateItemTable.id })
        .from(affiliateItemTable)
        .where(
          and(
            eq(affiliateItemTable.programId, program.id),
            eq(affiliateItemTable.status, "dismissed"),
            isNull(affiliateItemTable.resolvedById),
            gte(affiliateItemTable.resolvedAt, weekAgo),
          ),
        );

      const invoices = await listInvoices();
      const payoutIssues = invoices
        .flatMap((inv) =>
          inv.LineItems.filter((l) =>
            ["OVERDUE", "PENDING"].includes(l.Status?.toUpperCase() ?? ""),
          ).map((l) => ({
            invoice: inv.Id,
            partner: inv.MediaName,
            status: l.Status,
            amount: l.TotalItemAmount,
            due: l.DueDate?.slice(0, 10),
          })),
        )
        .slice(0, 20);

      const data = {
        week: { start: weekAgo.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) },
        actionsThisWeek: actions.map(summarizeAction),
        priorWeekTotals: {
          actions: priorWeek.reduce((s, r) => s + (r.actions ?? 0), 0),
          revenue: priorWeek.reduce((s, r) => s + (r.revenue ?? 0), 0),
          commission: priorWeek.reduce((s, r) => s + (r.commission ?? 0), 0),
          daysCovered: priorWeek.length,
        },
        partnersByState,
        openDeskItemsByKind: openByKind,
        autoDismissedEmailsThisWeek: autoDismissed.length,
        payoutIssues,
      };

      const { text } = await generateText({
        model: REPORT_MODEL,
        system: REPORT_SYSTEM,
        prompt: `Program: ${program.name} (Impact program ${program.externalProgramId})

Data for this week's report:
${JSON.stringify(data, null, 2)}

Write the report.`,
      });

      const result = await postOnSlack({
        text: `Weekly affiliate report — ${program.name}`,
        channel: RADIO_AFFILIATE_CHANNEL,
        blocks: [
          {
            type: "section" as const,
            text: {
              type: "mrkdwn" as const,
              text: `:bar_chart: *Weekly affiliate report* (${data.week.start} → ${data.week.end})\n\n${text}`,
            },
          },
        ],
      });

      console.log(
        `[affiliate-report] ${program.id}: ${actions.length} action(s), posted=${result.success}`,
      );
      results.push({ programId: program.id, posted: result.success, actions: actions.length });
    } catch (error) {
      console.error(`[affiliate-report] ${program.id} failed:`, error);
      results.push({
        programId: program.id,
        skipped: `error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return results;
}
