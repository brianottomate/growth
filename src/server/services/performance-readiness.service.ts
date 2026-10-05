import "server-only";

import { and, inArray, isNull } from "drizzle-orm";

import { type ReadinessChecklist } from "@/lib/performance-readiness";
import { db } from "@/server/db";
import {
  brandTable,
  performanceIntakeTable,
  performancePropertyTable,
} from "@/server/db/schema";

import {
  emptyLaunchRecord,
  recordedLaunchChecklist,
} from "@/lib/launch-checklist";

import type { DeskBrand } from "./performance-desk.service";

/** The newest intake per account, read whole; the receipt is verbatim. */
export type IntakeSummary = {
  status: string;
  submittedAt: Date;
  by: string | null;
  budget: number | null;
  budgetIsRecommendation: boolean;
  homes: number | "all" | null;
  homesOnRecord: number;
  reportEmails: string | null;
  invoiceEmail: string | null;
  creative: boolean;
  guestList: boolean;
  ugc: string | null;
  accessClaimed: boolean;
  accessVerified: boolean;
  notes: string | null;
};

export type BrandReadiness = {
  intake: IntakeSummary | null;
  checklist: ReadinessChecklist;
  revision: number;
};

/**
 * The intake summary and the explicitly recorded launch checklist for each brand on
 * the desk, in a handful of queries however many brands there are. The
 * Clients list reads every client; a brand's Overview reads one.
 */
export async function loadBrandReadiness(
  brands: DeskBrand[],
): Promise<Map<string, BrandReadiness>> {
  const brandIds = brands.map((brand) => brand.id);
  const accountIds = brands
    .map((brand) => brand.account?.id)
    .filter((id): id is string => Boolean(id));

  const [intakes, properties] = accountIds.length
    ? await Promise.all([
        db.query.performanceIntakeTable.findMany({
          where: inArray(performanceIntakeTable.accountId, accountIds),
          orderBy: (t, { desc }) => desc(t.submittedAt),
        }),
        db.query.performancePropertyTable.findMany({
          where: and(
            inArray(performancePropertyTable.accountId, accountIds),
            isNull(performancePropertyTable.deletedAt),
          ),
          columns: { accountId: true },
        }),
      ])
    : [[], []];
  const recordedRows = brandIds.length
    ? await db.query.brandTable.findMany({
        where: inArray(brandTable.id, brandIds),
        columns: {
          id: true,
          performanceChecklist: true,
          wanderOsEnabled: true,
          wanderOsWebsiteId: true,
        },
      })
    : [];
  const records = new Map(
    recordedRows.map((row) => [
      row.id,
      row.performanceChecklist?.launch ?? emptyLaunchRecord(),
    ]),
  );
  const connected = new Map(
    recordedRows.map((row) => [
      row.id,
      Boolean(row.wanderOsEnabled && row.wanderOsWebsiteId),
    ]),
  );

  const homesByAccount = new Map<string, number>();
  for (const row of properties) {
    homesByAccount.set(
      row.accountId,
      (homesByAccount.get(row.accountId) ?? 0) + 1,
    );
  }
  const intakeByAccount = new Map<string, IntakeSummary>();
  for (const row of intakes) {
    if (intakeByAccount.has(row.accountId)) continue;
    const answers = row.answers;
    intakeByAccount.set(row.accountId, {
      status: row.status,
      submittedAt: row.submittedAt,
      by: row.submittedByName ?? row.submittedByEmail ?? null,
      budget: row.mediaBudgetDollars,
      budgetIsRecommendation: row.budgetIsRecommendation,
      homes: answers.allProperties
        ? "all"
        : answers.propertyUrls?.length
          ? answers.propertyUrls.length
          : null,
      homesOnRecord: homesByAccount.get(row.accountId) ?? 0,
      reportEmails: answers.reportEmails?.trim() || null,
      invoiceEmail: answers.invoiceEmail?.trim() || null,
      creative: Boolean(answers.creativeDriveUrl),
      guestList: Boolean(answers.guestListDriveUrl),
      ugc: answers.ugcPermission?.trim() || null,
      accessClaimed: Boolean(row.accessClaimedAt),
      accessVerified: Boolean(row.zernioVerifiedAt),
      notes:
        [answers.propertyNotes, answers.anythingElse]
          .map((value) => value?.trim())
          .filter(Boolean)
          .join(" · ") || null,
    });
  }
  const out = new Map<string, BrandReadiness>();
  for (const brand of brands) {
    const record = records.get(brand.id) ?? emptyLaunchRecord();
    const intake = brand.account
      ? (intakeByAccount.get(brand.account.id) ?? null)
      : null;
    out.set(brand.id, {
      intake,
      checklist: recordedLaunchChecklist(record, {
        intakeFiledAt: intake?.submittedAt ?? null,
        wanderOsConnected: connected.get(brand.id) ?? false,
      }),
      revision: record.revision,
    });
  }
  return out;
}

/** The links an unticked checklist item offers, for one brand. */
export function readinessLinks(
  brand: Pick<DeskBrand, "id" | "slug" | "intakeUrl">,
) {
  const slug = brand.slug ?? brand.id;
  return {
    intake: brand.intakeUrl,
    connect: `/app/performance/clients/${slug}#submission`,
    wanderos: `/app/performance/clients/${slug}/wanderos`,
    finance: "/app/performance/finance",
  };
}
