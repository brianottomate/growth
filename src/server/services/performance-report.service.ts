import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { r2IsPublicUrl } from "@/server/clients/r2.client";
import { db, withTransaction, type TransactionClient } from "@/server/db";
import {
  brandTable,
  performanceAccountTable,
  performanceCycleTable,
  performanceReportTable,
  performanceReportShareTable,
  type PerformanceReport,
} from "@/server/db/schema";
import {
  performanceReportContent,
  performanceReportSnapshot,
  savePerformanceReportSchema,
  type PerformanceReportSnapshot,
} from "@/lib/performance-report";

async function requireAccount(
  orgId: string,
  brandId: string,
  tx: TransactionClient,
) {
  const [row] = await tx
    .select({ account: performanceAccountTable })
    .from(performanceAccountTable)
    .innerJoin(brandTable, eq(brandTable.id, performanceAccountTable.brandId))
    .where(
      and(
        eq(performanceAccountTable.organizationId, orgId),
        eq(brandTable.organizationId, orgId),
        eq(brandTable.id, brandId),
        isNull(performanceAccountTable.deletedAt),
        isNull(brandTable.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new Error("Performance account not found");
  return row.account;
}

function draft(row: PerformanceReport) {
  return {
    id: row.id,
    cycleId: row.cycleId,
    content: performanceReportContent.parse({
      periodLabel: row.periodLabel,
      startDate: row.startDate,
      endDate: row.endDate,
      channels: row.channels,
      metrics: row.metrics,
      otherBookings: row.otherBookings,
      highlights: row.highlights,
      deliverables: row.deliverables,
      sources: row.sources,
      narrative: row.narrative,
      recommendations: row.recommendations,
    }),
  };
}

export async function getReportWorkspace(orgId: string, brandId: string) {
  return withTransaction(async (tx) => {
    const account = await requireAccount(orgId, brandId, tx);
    const reports = await tx
      .select()
      .from(performanceReportTable)
      .where(eq(performanceReportTable.accountId, account.id))
      .orderBy(desc(performanceReportTable.createdAt));
    const shares = await tx
      .select({
        id: performanceReportShareTable.id,
        reportId: performanceReportShareTable.reportId,
        token: performanceReportShareTable.token,
        expiresAt: performanceReportShareTable.expiresAt,
        revokedAt: performanceReportShareTable.revokedAt,
        createdAt: performanceReportShareTable.createdAt,
      })
      .from(performanceReportShareTable)
      .innerJoin(
        performanceReportTable,
        eq(performanceReportTable.id, performanceReportShareTable.reportId),
      )
      .where(
        and(
          eq(performanceReportTable.accountId, account.id),
          eq(performanceReportShareTable.organizationId, orgId),
        ),
      )
      .orderBy(desc(performanceReportShareTable.createdAt));
    const cycles = await tx
      .select({
        id: performanceCycleTable.id,
        period: performanceCycleTable.period,
      })
      .from(performanceCycleTable)
      .where(eq(performanceCycleTable.accountId, account.id));
    return {
      clientName: account.name,
      reports: reports.map(draft),
      cycles,
      shares: shares.map((share) => ({
        ...share,
        path: `/report/${share.token}`,
        expiresAt: share.expiresAt?.toISOString() ?? null,
        revokedAt: share.revokedAt?.toISOString() ?? null,
        createdAt: share.createdAt.toISOString(),
      })),
    };
  });
}

export async function saveReportDraft(
  orgId: string,
  input: z.input<typeof savePerformanceReportSchema>,
) {
  const parsed = savePerformanceReportSchema.parse(input);
  for (const highlight of parsed.content.highlights) {
    if (highlight.imageUrl && !r2IsPublicUrl(highlight.imageUrl)) {
      throw new Error(
        "Report images must use a stable Growth media URL. Upload the image before adding it.",
      );
    }
  }
  return withTransaction(async (tx) => {
    const account = await requireAccount(orgId, parsed.brandId, tx);
    if (parsed.cycleId) {
      const [cycle] = await tx
        .select({ id: performanceCycleTable.id })
        .from(performanceCycleTable)
        .where(
          and(
            eq(performanceCycleTable.id, parsed.cycleId),
            eq(performanceCycleTable.accountId, account.id),
          ),
        );
      if (!cycle)
        throw new Error(
          "Billing cycle belongs to another account or no longer exists",
        );
    }
    const values = {
      ...parsed.content,
      cycleId: parsed.cycleId,
      status: "draft" as const,
    };
    const [row] = parsed.id
      ? await tx
          .update(performanceReportTable)
          .set(values)
          .where(
            and(
              eq(performanceReportTable.id, parsed.id),
              eq(performanceReportTable.accountId, account.id),
            ),
          )
          .returning()
      : await tx
          .insert(performanceReportTable)
          .values({
            ...values,
            accountId: account.id,
            token: randomBytes(24).toString("base64url"),
          })
          .returning();
    if (!row) throw new Error("Report not found");
    return draft(row);
  });
}

async function requireReport(
  tx: TransactionClient,
  orgId: string,
  brandId: string,
  reportId: string,
) {
  const account = await requireAccount(orgId, brandId, tx);
  const [row] = await tx
    .select()
    .from(performanceReportTable)
    .where(
      and(
        eq(performanceReportTable.id, reportId),
        eq(performanceReportTable.accountId, account.id),
      ),
    )
    .for("update");
  if (!row) throw new Error("Report not found");
  const snapshot = performanceReportSnapshot.parse({
    ...draft(row).content,
    clientName: account.name,
    status: "published",
    publishedAt: null,
  });
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ reportId, orgId, brandId, snapshot }))
    .digest("hex");
  return { row, snapshot, fingerprint };
}

export async function reviewReport(
  orgId: string,
  brandId: string,
  reportId: string,
) {
  return withTransaction(async (tx) => {
    const { snapshot, fingerprint } = await requireReport(
      tx,
      orgId,
      brandId,
      reportId,
    );
    return { snapshot, fingerprint };
  });
}

export async function publishReport(
  orgId: string,
  input: {
    brandId: string;
    reportId: string;
    fingerprint: string;
    expiresInDays: number;
  },
) {
  const days = z.number().int().min(1).max(90).parse(input.expiresInDays);
  return withTransaction(async (tx) => {
    const reviewed = await requireReport(
      tx,
      orgId,
      input.brandId,
      input.reportId,
    );
    if (input.fingerprint !== reviewed.fingerprint)
      throw new Error(
        "Report changed since review. Review it again before publishing.",
      );
    const now = new Date();
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + days * 86_400_000);
    const [share] = await tx
      .insert(performanceReportShareTable)
      .values({
        reportId: input.reportId,
        organizationId: orgId,
        token,
        snapshot: { ...reviewed.snapshot, publishedAt: now.toISOString() },
        expiresAt,
      })
      .returning({ id: performanceReportShareTable.id });
    await tx
      .update(performanceReportTable)
      .set({ status: "published", publishedAt: now })
      .where(eq(performanceReportTable.id, input.reportId));
    return {
      id: share!.id,
      path: `/report/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function revokeReportShare(
  orgId: string,
  input: { brandId: string; shareId: string },
) {
  return withTransaction(async (tx) => {
    const account = await requireAccount(orgId, input.brandId, tx);
    const [share] = await tx
      .select({ id: performanceReportShareTable.id })
      .from(performanceReportShareTable)
      .innerJoin(
        performanceReportTable,
        eq(performanceReportTable.id, performanceReportShareTable.reportId),
      )
      .where(
        and(
          eq(performanceReportShareTable.id, input.shareId),
          eq(performanceReportShareTable.organizationId, orgId),
          eq(performanceReportTable.accountId, account.id),
        ),
      );
    if (!share) throw new Error("Report link not found");
    await tx
      .update(performanceReportShareTable)
      .set({ revokedAt: new Date() })
      .where(eq(performanceReportShareTable.id, share.id));
    return { revoked: true };
  });
}

/** The CLI is a trusted database operator. Organization is explicit because slugs are scoped. */
export const performanceReportWrite = performanceReportContent.safeExtend({
  id: z.string().optional(),
  brandSlug: z.string(),
  organizationId: z.string().min(1),
  cycleId: z.string().nullable().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
export type PerformanceReportWrite = z.input<typeof performanceReportWrite>;
export async function upsertPerformanceReport(input: PerformanceReportWrite) {
  const parsed = performanceReportWrite.parse(input);
  const [brand] = await db
    .select({ id: brandTable.id })
    .from(brandTable)
    .where(
      and(
        eq(brandTable.slug, parsed.brandSlug),
        eq(brandTable.organizationId, parsed.organizationId),
        isNull(brandTable.deletedAt),
      ),
    );
  if (!brand) throw new Error("Brand not found in the specified organization");
  const {
    id,
    brandSlug: _slug,
    organizationId,
    cycleId,
    status,
    expiresInDays,
    ...content
  } = parsed;
  const saved = await saveReportDraft(organizationId, {
    brandId: brand.id,
    id,
    cycleId,
    content,
  });
  if (status === "draft") return { id: saved.id, path: null };
  // The operator reviewed the file. Compare against precisely those saved values,
  // so another edit between save and publish requires a fresh review.
  const reviewed = await reviewReport(organizationId, brand.id, saved.id);
  const {
    clientName: _client,
    status: _status,
    publishedAt: _published,
    ...reviewedContent
  } = reviewed.snapshot;
  if (JSON.stringify(reviewedContent) !== JSON.stringify(saved.content)) {
    throw new Error("Report changed after save; review and publish again");
  }
  const shared = await publishReport(organizationId, {
    brandId: brand.id,
    reportId: saved.id,
    fingerprint: reviewed.fingerprint,
    expiresInDays,
  });
  return { ...shared, id: saved.id, shareId: shared.id };
}

export async function loadPerformanceReportPage(token: string) {
  if (!token || token.length > 64) return null;
  const [share] = await db
    .select({ snapshot: performanceReportShareTable.snapshot })
    .from(performanceReportShareTable)
    .innerJoin(
      performanceReportTable,
      eq(performanceReportTable.id, performanceReportShareTable.reportId),
    )
    .innerJoin(
      performanceAccountTable,
      eq(performanceAccountTable.id, performanceReportTable.accountId),
    )
    .innerJoin(brandTable, eq(brandTable.id, performanceAccountTable.brandId))
    .where(
      and(
        eq(performanceReportShareTable.token, token),
        isNull(performanceReportShareTable.revokedAt),
        or(
          isNull(performanceReportShareTable.expiresAt),
          gt(performanceReportShareTable.expiresAt, new Date()),
        ),
        eq(
          performanceReportShareTable.organizationId,
          performanceAccountTable.organizationId,
        ),
        eq(
          performanceReportShareTable.organizationId,
          brandTable.organizationId,
        ),
        isNull(performanceAccountTable.deletedAt),
        isNull(brandTable.deletedAt),
      ),
    );
  if (!share) return null;
  return reportPage(performanceReportSnapshot.parse(share.snapshot));
}
export function reportPage(snapshot: PerformanceReportSnapshot) {
  return {
    ...snapshot,
    publishedAt: snapshot.publishedAt ? new Date(snapshot.publishedAt) : null,
  };
}
export type PerformanceReportPage = ReturnType<typeof reportPage>;
export function performanceReportImageUrls(report: PerformanceReportPage) {
  return new Set(
    report.highlights.flatMap((highlight) =>
      highlight.imageUrl ? [highlight.imageUrl] : [],
    ),
  );
}
