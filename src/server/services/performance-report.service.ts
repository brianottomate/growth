import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  brandTable,
  performanceAccountTable,
  performanceReportTable,
} from "@/server/db/schema";
import {
  performanceReportChannels,
  performanceReportDeliverables,
  performanceReportHighlights,
  performanceReportMetrics,
  performanceReportOtherBookingsList,
  performanceReportSources,
} from "@/lib/performance-report";

const isoDate = z.iso.date();

/**
 * Everything a report is written from. There is no in-app editor yet: reports
 * are written by an operator (or an agent) who pulled the numbers, through
 * `scripts/performance-report-upsert.ts`, and this is the one place that
 * checks the content before it can reach a client page.
 */
export const performanceReportWrite = z
  .object({
    /** Omit to create a report; pass to replace an existing one. */
    id: z.string().optional(),
    brandSlug: z.string(),
    cycleId: z.string().nullable().optional(),
    periodLabel: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate,
    channels: performanceReportChannels,
    metrics: performanceReportMetrics,
    otherBookings: performanceReportOtherBookingsList.default([]),
    highlights: performanceReportHighlights.default([]),
    deliverables: performanceReportDeliverables.default([]),
    sources: performanceReportSources.min(1),
    narrative: z.string().nullable().optional(),
    recommendations: z.string().nullable().optional(),
    status: z.enum(["draft", "published"]).default("draft"),
  })
  .strict()
  .refine((report) => report.startDate <= report.endDate, {
    message: "startDate must not be after endDate",
  });
export type PerformanceReportWrite = z.input<typeof performanceReportWrite>;

export async function upsertPerformanceReport(input: PerformanceReportWrite) {
  const report = performanceReportWrite.parse(input);
  const [account] = await db
    .select({ id: performanceAccountTable.id })
    .from(performanceAccountTable)
    .innerJoin(brandTable, eq(brandTable.id, performanceAccountTable.brandId))
    .where(eq(brandTable.slug, report.brandSlug))
    .limit(1);
  if (!account)
    throw new Error(`No Performance account for brand ${report.brandSlug}`);

  const values = {
    accountId: account.id,
    cycleId: report.cycleId ?? null,
    periodLabel: report.periodLabel,
    startDate: report.startDate,
    endDate: report.endDate,
    channels: report.channels,
    metrics: report.metrics,
    otherBookings: report.otherBookings,
    highlights: report.highlights,
    deliverables: report.deliverables,
    sources: report.sources,
    narrative: report.narrative ?? null,
    recommendations: report.recommendations ?? null,
    status: report.status,
  };

  if (report.id) {
    const existing = await db.query.performanceReportTable.findFirst({
      where: eq(performanceReportTable.id, report.id),
      columns: { accountId: true, publishedAt: true },
    });
    if (!existing) throw new Error(`Report not found: ${report.id}`);
    if (existing.accountId !== account.id)
      throw new Error(`Report ${report.id} belongs to another account`);
    const [row] = await db
      .update(performanceReportTable)
      .set({
        ...values,
        publishedAt:
          report.status === "published"
            ? (existing.publishedAt ?? new Date())
            : null,
      })
      .where(eq(performanceReportTable.id, report.id))
      .returning({
        id: performanceReportTable.id,
        token: performanceReportTable.token,
      });
    return row!;
  }

  const [row] = await db
    .insert(performanceReportTable)
    .values({
      ...values,
      token: randomBytes(24).toString("base64url"),
      publishedAt: report.status === "published" ? new Date() : null,
    })
    .returning({
      id: performanceReportTable.id,
      token: performanceReportTable.token,
    });
  return row!;
}

/** The report behind a public link, or null. Drafts load too, marked as such. */
export async function loadPerformanceReportPage(token: string) {
  if (token.length > 64) return null;
  const report = await db.query.performanceReportTable.findFirst({
    where: eq(performanceReportTable.token, token),
    with: {
      account: {
        columns: { name: true },
      },
    },
  });
  if (!report) return null;
  return {
    clientName: report.account.name,
    periodLabel: report.periodLabel,
    startDate: report.startDate,
    endDate: report.endDate,
    status: report.status,
    publishedAt: report.publishedAt,
    channels: performanceReportChannels.parse(report.channels),
    metrics: performanceReportMetrics.parse(report.metrics),
    otherBookings: performanceReportOtherBookingsList.parse(
      report.otherBookings,
    ),
    highlights: performanceReportHighlights.parse(report.highlights),
    deliverables: performanceReportDeliverables.parse(report.deliverables),
    sources: performanceReportSources.parse(report.sources),
    narrative: report.narrative,
    recommendations: report.recommendations,
  };
}
export type PerformanceReportPage = NonNullable<
  Awaited<ReturnType<typeof loadPerformanceReportPage>>
>;

/** Images a report may serve through its same-origin media route. */
export function performanceReportImageUrls(report: PerformanceReportPage) {
  const urls = new Set<string>();
  for (const highlight of report.highlights)
    if (highlight.imageUrl) urls.add(highlight.imageUrl);
  return urls;
}
