import "server-only";

import { and, inArray, isNull } from "drizzle-orm";

import {
  readinessChecklist,
  type ReadinessChecklist,
} from "@/lib/performance-readiness";
import { db } from "@/server/db";
import {
  brandTable,
  performanceCycleTable,
  performanceIntakeTable,
  performancePropertyTable,
  platformAudienceTable,
} from "@/server/db/schema";

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
};

/**
 * The intake summary and the derived production checklist for each brand on
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

  const [intakes, properties, cycles] = accountIds.length
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
        db.query.performanceCycleTable.findMany({
          where: inArray(performanceCycleTable.accountId, accountIds),
          columns: { accountId: true, mediaBudget: true },
          orderBy: (t, { desc }) => desc(t.period),
        }),
      ])
    : [[], [], []];
  const [previewRows, audienceRows] = brandIds.length
    ? await Promise.all([
        db.query.brandTable.findMany({
          where: inArray(brandTable.id, brandIds),
          columns: {
            id: true,
            featuredListingUrl: true,
            adPreviews: true,
            performanceSettings: true,
          },
        }),
        db.query.platformAudienceTable.findMany({
          where: inArray(platformAudienceTable.brandId, brandIds),
          columns: { brandId: true, type: true },
        }),
      ])
    : [[], []];

  const homesByAccount = new Map<string, number>();
  for (const row of properties) {
    homesByAccount.set(
      row.accountId,
      (homesByAccount.get(row.accountId) ?? 0) + 1,
    );
  }
  // Newest cycle with a media budget per account; the intake's figure stands in until one is opened.
  const mediaBudgetByAccount = new Map<string, number>();
  for (const row of cycles) {
    if (row.mediaBudget != null && !mediaBudgetByAccount.has(row.accountId)) {
      mediaBudgetByAccount.set(row.accountId, row.mediaBudget);
    }
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
  const previewByBrand = new Map(
    previewRows.map((row) => [
      row.id,
      {
        featured: Boolean(row.featuredListingUrl),
        kept: row.adPreviews?.length ?? 0,
        settings: row.performanceSettings ?? null,
      },
    ]),
  );
  const audiencesByBrand = new Map<
    string,
    { total: number; lookalikes: number }
  >();
  for (const row of audienceRows) {
    const current = audiencesByBrand.get(row.brandId) ?? {
      total: 0,
      lookalikes: 0,
    };
    current.total += 1;
    if (row.type === "lookalike") current.lookalikes += 1;
    audiencesByBrand.set(row.brandId, current);
  }

  const out = new Map<string, BrandReadiness>();
  for (const brand of brands) {
    const intake = brand.account
      ? (intakeByAccount.get(brand.account.id) ?? null)
      : null;
    const previews = previewByBrand.get(brand.id) ?? {
      featured: false,
      kept: 0,
      settings: null,
    };
    // Settings first, the receipt second: a rep may have set these on behalf.
    const settings = previews.settings;
    const audiences = audiencesByBrand.get(brand.id) ?? {
      total: 0,
      lookalikes: 0,
    };
    const cycleBudget = brand.account
      ? mediaBudgetByAccount.get(brand.account.id)
      : undefined;
    out.set(brand.id, {
      intake,
      checklist: readinessChecklist({
        intakeFiled: Boolean(intake),
        mediaBudget: cycleBudget ?? intake?.budget ?? null,
        accessVerified: intake?.accessVerified ?? false,
        accessClaimed: intake?.accessClaimed ?? false,
        homesOnRecord: brand.account
          ? (homesByAccount.get(brand.account.id) ?? 0)
          : 0,
        homesAll: intake?.homes === "all",
        hasMark: brand.hasMark,
        reportEmails: Boolean(settings?.reportEmails ?? intake?.reportEmails),
        invoiceEmail: Boolean(settings?.invoiceEmail ?? intake?.invoiceEmail),
        creativeFolder:
          Boolean(settings?.creativeDriveUrl) || (intake?.creative ?? false),
        featuredHome: previews.featured,
        previewsKept: previews.kept,
        adsDrafted: brand.campaigns.reduce(
          (sum, campaign) => sum + campaign.adCount,
          0,
        ),
        campaigns: brand.campaigns.length,
        audiences: audiences.total,
        lookalikes: audiences.lookalikes,
        pushed:
          brand.best === "pushed" ||
          brand.best === "live" ||
          brand.best === "ended",
        live: brand.best === "live",
      }),
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
    connect: `/app/performance/brands/${slug}#submission`,
    homes: `/app/performance/brands/${slug}/setup`,
    draw: `/app/performance/brands/${slug}/ads`,
    mark: `/app/performance/brands/${slug}/setup#brand-mark`,
    ads: `/app/performance/brands/${slug}/campaigns`,
  };
}
