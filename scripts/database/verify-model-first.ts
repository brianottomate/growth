import { getPerformanceAccountActionOutputSchema } from "../../src/server/ai/capabilities/outputs/performance";
import assert from "node:assert/strict";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../src/server/db";
import {
  brandTable,
  campaignTable,
  channelTable,
  cadenceTargetTable,
  platformCampaignTable,
  homeTable,
  mediaAssetTable,
  performanceCycleTable,
  performanceAccountTable,
} from "../../src/server/db/schema";
import { saveBaselineTarget } from "../../src/server/services/cadence-target.service";
import {
  setHomeCarousel,
  loadBrandHome,
} from "../../src/server/services/homes.service";
import {
  attachToPerformanceCycle,
  getPerformanceAccount,
  updatePerformanceCycle,
} from "../../src/server/services/performance.service";
import { setPerformanceSettings } from "../../src/server/services/performance-settings.service";
import { loadPerformanceDesk } from "../../src/server/services/performance-desk.service";
import { readPaymentSettings } from "../../src/server/services/performance-payment-state";
if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Run only against an explicit experiment branch");

const series = await db.query.cadenceTargetTable.findFirst({
  where: (t, { isNotNull }) => isNotNull(t.seriesId),
});
assert(series, "Production-derived copy must include a series target");
const baseline = {
  brandId: series.brandId,
  channelId: series.channelId,
  platform: series.platform,
  archetype: series.archetype,
  template: series.template,
  period: series.period,
  count: 31,
};
const first = await saveBaselineTarget(baseline);
const second = await saveBaselineTarget({ ...baseline, count: 32 });
assert.equal(first.id, second.id);
assert.equal(second.count, 32);
assert.equal(second.seriesId, null);
assert.equal(
  (
    await db.query.cadenceTargetTable.findFirst({
      where: eq(cadenceTargetTable.id, series.id),
    })
  )?.count,
  series.count,
);
await Promise.all([
  saveBaselineTarget({ ...baseline, count: 33 }),
  saveBaselineTarget({ ...baseline, count: 34 }),
]);
const matches = await db.query.cadenceTargetTable.findMany({
  where: and(
    eq(cadenceTargetTable.channelId, series.channelId),
    eq(cadenceTargetTable.archetype, series.archetype),
    isNull(cadenceTargetTable.seriesId),
    isNull(cadenceTargetTable.deletedAt),
  ),
});
assert(
  matches.filter(
    (row) => row.template === series.template && row.period === series.period,
  ).length === 1,
);
console.log(
  "Cadence: repeated and concurrent saves keep one baseline and preserve the series",
);

const home = await db.query.homeTable.findFirst({
  where: isNull(homeTable.deletedAt),
});
assert(home);
const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.id, home.brandId),
});
assert(brand?.organizationId && brand.slug);
const photos = [
  { sourceUrl: "https://example.com/a.jpg" },
  { sourceUrl: "https://example.com/b.jpg" },
  { sourceUrl: "https://example.com/a.jpg" },
];
await setHomeCarousel({ homeId: home.id, orgId: brand.organizationId, photos });
const detail = await loadBrandHome({
  brandSlug: brand.slug,
  propertyId: home.externalId,
  orgId: brand.organizationId,
});
assert.deepEqual(
  detail.home.carousel.map((photo) => photo.url),
  photos.map((photo) => photo.sourceUrl),
);
const foreignAsset = await db.query.mediaAssetTable.findFirst({
  where: (t, { ne }) => ne(t.brandId, home.brandId),
});
if (foreignAsset)
  await assert.rejects(
    setHomeCarousel({
      homeId: home.id,
      orgId: brand.organizationId,
      photos: [{ assetId: foreignAsset.id }],
    }),
    /this brand/,
  );
assert.deepEqual(
  (await db.query.homeTable.findFirst({ where: eq(homeTable.id, home.id) }))
    ?.carousel,
  photos,
);
console.log(
  "Carousel: A/B/A survives readback; cross-brand assets cannot overwrite it",
);

const account = await db.query.performanceAccountTable.findFirst({
  where: (t, { isNull }) => isNull(t.deletedAt),
});
assert(account?.brandId);
const cycle = await db.query.performanceCycleTable.findFirst({
  where: eq(performanceCycleTable.accountId, account.id),
});
assert(cycle);
const fixture = `model653_${Date.now()}`;
const [channel] = await db
  .insert(channelTable)
  .values({
    id: `${fixture}_channel`,
    brandId: account.brandId,
    kind: "ad",
    platform: "meta_ads",
  })
  .returning();
assert(channel);
const [parent] = await db
  .insert(campaignTable)
  .values({
    id: `${fixture}_plan`,
    brandId: account.brandId,
    name: "Model audit fixture",
    slug: fixture,
  })
  .returning();
assert(parent);
const [a, b] = await db
  .insert(platformCampaignTable)
  .values(
    ["a", "b"].map((key) => ({
      id: `${fixture}_${key}`,
      channelId: channel.id,
      brandId: account.brandId!,
      platform: "meta_ads" as const,
      campaignId: parent.id,
      name: `Model audit ${key}`,
    })),
  )
  .returning();
assert(a && b);
const actor = { orgId: account.organizationId };
await attachToPerformanceCycle(actor, {
  kind: "platformCampaign",
  id: a.id,
  cycleId: cycle.id,
});
assert.equal(
  (
    await db.query.platformCampaignTable.findFirst({
      where: eq(platformCampaignTable.id, b.id),
    })
  )?.performanceCycleId,
  null,
);
assert.equal(
  (
    await db.query.campaignTable.findFirst({
      where: eq(campaignTable.id, parent.id),
    })
  )?.performanceCycleId,
  null,
);
assert.equal(
  (
    await getPerformanceAccount(actor, account.id)
  ).delivery.platformCampaigns.some((row) => row.id === a.id),
  true,
);
getPerformanceAccountActionOutputSchema.parse(
  JSON.parse(JSON.stringify(await getPerformanceAccount(actor, account.id))),
);
await attachToPerformanceCycle(actor, {
  kind: "platformCampaign",
  id: a.id,
  cycleId: null,
});
assert.equal(
  (
    await db.query.platformCampaignTable.findFirst({
      where: eq(platformCampaignTable.id, a.id),
    })
  )?.campaignId,
  parent.id,
);
console.log(
  "Delivery: attaching/detaching one platform campaign preserves its parent and sibling",
);

const brandFee = account.monthlyFee === 41 ? 42 : 41;
await setPerformanceSettings({
  brandId: account.brandId,
  orgId: account.organizationId,
  by: null,
  from: "agent",
  patch: {
    monthlyFee: brandFee,
    cardState: { billingPeriod: cycle.period, managementPayment: "Paid" },
  },
});
const savedBrand = await db.query.brandTable.findFirst({
  where: eq(brandTable.id, account.brandId),
});
assert(savedBrand);
assert.equal(savedBrand.performanceSettings?.monthlyFee, brandFee);
assert.equal(
  (
    await db.query.performanceAccountTable.findFirst({
      where: eq(performanceAccountTable.id, account.id),
    })
  )?.monthlyFee,
  account.monthlyFee,
);
assert.equal(
  (await loadPerformanceDesk(account.organizationId)).brands.find(
    (row) => row.id === account.brandId,
  )?.settings?.monthlyFee,
  brandFee,
);
console.log(
  "Commercial: cards show brand edits; billing account terms stay unchanged",
);
assert.equal(
  savedBrand.performanceSettings?.cardState?.managementPayment,
  undefined,
);
assert.equal(
  (await readPaymentSettings(savedBrand.id, savedBrand.performanceSettings))
    .cardState?.managementPayment,
  "Paid",
);
await updatePerformanceCycle(actor, { cycleId: cycle.id, feePaid: false });
assert.equal(
  (await readPaymentSettings(savedBrand.id, savedBrand.performanceSettings))
    .cardState?.managementPayment,
  "Open",
);
console.log("Payment: card and billing edits read the same cycle-owned fact");
