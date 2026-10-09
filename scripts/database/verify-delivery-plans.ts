/** Run on an experiment: read contracts + ownership/platform rejection, no provider calls. */
import { strict as assert } from "node:assert";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  campaignTable,
  brandTable,
  memberTable,
  platformDeliveryGroupTable,
} from "@/server/db/schema";
import { openCampaignAction } from "@/server/ai/capabilities/ads";
import {
  getDraftCampaign,
  setDeliveryGroup,
  updateAudience,
} from "@/server/services/ads-draft.service";

if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Requires a disposable database experiment");
const campaignId = process.argv[2] ?? "camp_f982BUJT3yMVAVA6";
const campaign = await db.query.campaignTable.findFirst({
  where: eq(campaignTable.id, campaignId),
});
assert(campaign);
const brand = await db.query.brandTable.findFirst({
  where: and(eq(brandTable.id, campaign.brandId), isNull(brandTable.deletedAt)),
});
assert(brand?.organizationId);
const member = await db.query.memberTable.findFirst({
  where: eq(memberTable.organizationId, brand.organizationId),
});
assert(member);
const draft = await getDraftCampaign(brand.organizationId, campaignId);
assert(!draft.audiences.some((a) => "homeIds" in a || "keywords" in a));
const google = draft.platformCampaigns.find((p) => p.platform === "google_ads");
const meta = draft.platformCampaigns.find((p) => p.platform === "meta_ads");
assert(google && meta);
assert(
  draft.audiences.every((a) => a.geography?.states?.join(",") === "OH,PA,IN"),
);
// Editing shared intent must never silently change executable platform targeting.
const audience = draft.audiences[0]!;
try {
  await updateAudience({
    organizationId: brand.organizationId,
    audienceId: audience.id,
    geography: { states: ["CA"] },
  });
  const edited = await getDraftCampaign(brand.organizationId, campaignId);
  assert.deepEqual(
    edited.audiences.find((a) => a.id === audience.id)?.geography,
    { states: ["CA"] },
  );
  assert.deepEqual(edited.platformCampaigns, draft.platformCampaigns);
} finally {
  await updateAudience({
    organizationId: brand.organizationId,
    audienceId: audience.id,
    geography: audience.geography,
  });
}
assert.equal(google.deliveryGroups.length, 4);
assert.equal(meta.deliveryGroups.length, 4);
assert.deepEqual(google.settings?.google?.geography?.states, [
  "OH",
  "PA",
  "IN",
]);
assert.equal(
  google.deliveryGroups.reduce(
    (sum, g) =>
      sum +
      (g.configuration?.platform === "google_ads"
        ? (g.configuration.keywords?.length ?? 0)
        : 0),
    0,
  ),
  20,
);
assert(!draft.platformCampaigns.some((p) => p.externalId));
const group = google.deliveryGroups[0]!;
assert(group.configuration);
await assert.rejects(
  setDeliveryGroup({
    organizationId: "org_foreign_verification",
    deliveryGroupId: group.id,
    configuration: group.configuration,
  }),
);
await assert.rejects(
  setDeliveryGroup({
    organizationId: brand.organizationId,
    deliveryGroupId: group.id,
    configuration: {
      platform: "meta_ads",
      targeting: { geography: { countries: ["US"] } },
    },
  }),
  /does not match/,
);
const after = await db.query.platformDeliveryGroupTable.findFirst({
  where: eq(platformDeliveryGroupTable.id, group.id),
});
assert.deepEqual(after?.configuration, group.configuration);
await openCampaignAction.runValidated(
  { campaignId },
  {
    orgId: brand.organizationId,
    userId: member.userId,
    runId: "delivery-plan-verification",
    surface: "test",
  },
);
console.log(
  "Verified: four Meta groups, four Google groups, 20 search terms, OH/PA/IN, strict read contract, rejected foreign-workspace and wrong-platform edits; no provider writes.",
);
