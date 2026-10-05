/** Read-only evidence snapshot for a human-reviewed, one-time card-state initialization. */
import { writeFile } from "node:fs/promises";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  organizationTable,
  performanceAccountTable,
  performanceIntakeTable,
  homeTable,
  campaignTable,
  platformCampaignTable,
  platformPostTable,
  workflowRunTable,
} from "@/server/db/schema";

const org = await db.query.organizationTable.findFirst({
  where: eq(organizationTable.slug, "wander"),
  columns: { id: true },
});
if (!org) throw new Error("Wander organization not found");
const brands = await db.query.brandTable.findMany({
  where: and(
    eq(brandTable.organizationId, org.id),
    inArray(brandTable.relationship, ["client", "prospect"]),
    isNull(brandTable.deletedAt),
  ),
  columns: {
    id: true,
    name: true,
    relationship: true,
    slug: true,
    businessStage: true,
    businessStageAt: true,
    deliveryStage: true,
    deliveryStageAt: true,
    wanderOsWebsiteId: true,
    wanderOsEnabled: true,
    wanderOsCheckedAt: true,
    performanceSettings: true,
    emailSender: true,
  },
  orderBy: (t, { asc }) => asc(t.name),
});
const ids = brands.map((b) => b.id);
if (!ids.length) throw new Error("No client records");
const [accounts, homes, campaigns, platforms, emails, exports] =
  await Promise.all([
    db.query.performanceAccountTable.findMany({
      where: and(
        inArray(performanceAccountTable.brandId, ids),
        isNull(performanceAccountTable.deletedAt),
      ),
      columns: { id: true, brandId: true, status: true },
    }),
    db.query.homeTable.findMany({
      where: and(inArray(homeTable.brandId, ids), isNull(homeTable.deletedAt)),
      columns: {
        brandId: true,
        catalogExcluded: true,
        catalogApproval: true,
        catalogTitle: true,
        catalogFinishedAssetId: true,
        updatedAt: true,
      },
    }),
    db.query.campaignTable.findMany({
      where: and(
        inArray(campaignTable.brandId, ids),
        isNull(campaignTable.deletedAt),
      ),
      columns: { brandId: true },
      with: { ads: { columns: { status: true } } },
    }),
    db.query.platformCampaignTable.findMany({
      where: and(inArray(platformCampaignTable.brandId, ids)),
      columns: {
        brandId: true,
        platform: true,
        status: true,
        updatedAt: true,
        externalId: true,
      },
    }),
    db.query.platformPostTable.findMany({
      where: and(
        inArray(platformPostTable.brandId, ids),
        eq(platformPostTable.source, "owned"),
        eq(platformPostTable.platform, "newsletter"),
        inArray(platformPostTable.format, [
          "newsletter.broadcast",
          "newsletter.blast",
        ]),
      ),
      columns: { brandId: true, status: true, updatedAt: true },
    }),
    db.query.workflowRunTable.findMany({
      where: and(
        inArray(workflowRunTable.brandId, ids),
        eq(workflowRunTable.workflowType, "catalog-export"),
      ),
      columns: {
        brandId: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: (t, { desc }) => desc(t.createdAt),
    }),
  ]);
const intakes = accounts.length
  ? await db.query.performanceIntakeTable.findMany({
      where: or(
        inArray(performanceIntakeTable.brandId, ids),
        inArray(
          performanceIntakeTable.accountId,
          accounts.map((a) => a.id),
        ),
      ),
      columns: {
        accountId: true,
        brandId: true,
        status: true,
        submittedAt: true,
      },
      orderBy: (t, { desc }) => desc(t.submittedAt),
    })
  : [];
const count = (values: string[]) =>
  values.reduce<Record<string, number>>(
    (out, v) => ({ ...out, [v]: (out[v] ?? 0) + 1 }),
    {},
  );
const snapshot = brands.map((brand) => {
  const rows = homes.filter(
    (h) => h.brandId === brand.id && !h.catalogExcluded,
  );
  const account = accounts.find((a) => a.brandId === brand.id);
  const settings = brand.performanceSettings;
  return {
    id: brand.id,
    name: brand.name,
    relationship: brand.relationship,
    slug: brand.slug,
    business: brand.businessStage,
    businessRecordedAt: brand.businessStageAt,
    delivery: brand.deliveryStage,
    deliveryRecordedAt: brand.deliveryStageAt,
    accountStatus: account?.status ?? null,
    pipelineStage: settings?.pipelineStage ?? null,
    currentState: settings?.cardState ?? {},
    management: settings?.monthlyFee ?? null,
    spend: settings?.agreedAdSpend ?? null,
    siteLiveText: settings?.siteLive ?? null,
    siteLinked: Boolean(brand.wanderOsWebsiteId) && brand.wanderOsEnabled,
    siteCheckedAt: brand.wanderOsCheckedAt,
    emailDnsPrepared: Boolean(brand.emailSender?.marketingDomain),
    intake:
      intakes.find(
        (i) =>
          i.brandId === brand.id || (account && i.accountId === account.id),
      ) ?? null,
    homes: {
      included: rows.length,
      approved: rows.filter((h) => h.catalogApproval).length,
      customized: rows.filter((h) => h.catalogTitle || h.catalogFinishedAssetId)
        .length,
      lastUpdated: rows.reduce(
        (date, h) => (h.updatedAt > date ? h.updatedAt : date),
        new Date(0),
      ),
    },
    adStatuses: count(
      campaigns
        .filter((c) => c.brandId === brand.id)
        .flatMap((c) => c.ads.map((a) => a.status)),
    ),
    platforms: platforms
      .filter((p) => p.brandId === brand.id)
      .map((p) => ({
        platform: p.platform,
        status: p.status,
        updatedAt: p.updatedAt,
        external: Boolean(p.externalId),
      })),
    emailStatuses: count(
      emails.filter((e) => e.brandId === brand.id).map((e) => e.status),
    ),
    latestCatalogExport: exports.find((e) => e.brandId === brand.id) ?? null,
  };
});
await writeFile(
  "/tmp/wander-performance-state-audit.json",
  JSON.stringify(
    {
      auditedAt: new Date().toISOString(),
      organizationId: org.id,
      accounts: snapshot,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    snapshot.map(({ id, intake, latestCatalogExport, ...b }) => ({
      ...b,
      intake: intake
        ? { status: intake.status, submittedAt: intake.submittedAt }
        : null,
      latestCatalogExport: latestCatalogExport
        ? {
            status: latestCatalogExport.status,
            completedAt: latestCatalogExport.completedAt,
          }
        : null,
    })),
    null,
    2,
  ),
);
