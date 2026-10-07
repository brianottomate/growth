import { openCampaignAction } from "@/server/ai/capabilities/ads";
import {
  draftAdActionOutputSchema,
  draftAdResultSchema,
} from "@/server/ai/capabilities/outputs/ads";
import { strict as assert } from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  adTable,
  campaignTable,
  platformAdTable,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { returnAdToStudio } from "@/server/services/ad-approval.service";
import {
  attachAdSet,
  setAdCopy,
  setAdStatus,
} from "@/server/services/ad-set.service";
import {
  addReviewComment,
  deleteReviewComment,
  listReviewComments,
} from "@/server/services/review-comments.service";
import type { GrowthActionContext } from "@/server/ai/kernel/tool";
if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Run only on a disposable experiment branch");
const brand =
  (await db.query.brandTable.findFirst({
    where: (b, { eq }) => eq(b.slug, "30a-beach-stays"),
  })) ?? (await db.query.brandTable.findFirst());
assert(brand);
assert(brand.organizationId);
const member = await db.query.memberTable.findFirst({
  where: eq(memberTable.organizationId, brand.organizationId),
});
assert(member);
const ctx: GrowthActionContext = {
  orgId: brand.organizationId,
  userId: member.userId,
  surface: "app",
  runId: createId("run"),
};
const campaignId = createId("camp");
const adId = createId("ad");
await db.insert(campaignTable).values({
  id: campaignId,
  brandId: brand.id,
  name: "Ad review verification",
});
await db.insert(adTable).values({
  id: adId,
  brandId: brand.id,
  name: "Review verification",
  type: "text",
  status: "drawn",
  content: {
    headlines: ["Beach stays", "Book direct", "Your next escape"],
    descriptions: [
      "Find your next beach stay.",
      "Beautiful homes, booked direct.",
    ],
  },
});
const target = { type: "ad" as const, id: adId };
const ad = () =>
  db.query.adTable.findFirst({ where: eq(adTable.id, adId) }).then((r) => {
    assert(r);
    return r;
  });
try {
  const home = await db.query.homeTable.findFirst({
    where: (h, { eq }) => eq(h.brandId, brand.id),
  });
  if (home) {
    const catalog = {
      type: "catalog" as const,
      id: home.externalId,
      brandId: brand.id,
    };
    const added = await addReviewComment(
      { target: catalog, body: "Catalog scope check" },
      ctx,
    );
    assert(
      (
        await listReviewComments({ type: "catalog", id: home.id }, ctx.orgId)
      ).some((c) => c.id === added.id),
    );
    await assert.rejects(() => listReviewComments(catalog, "org_other"));
    await deleteReviewComment(added.id, ctx);
  }
  await assert.rejects(() => listReviewComments(target, "org_other"));
  await assert.rejects(() =>
    addReviewComment(
      { target, body: "Forbidden" },
      { ...ctx, orgId: "org_other" },
    ),
  );
  await assert.rejects(() =>
    attachAdSet({
      orgId: ctx.orgId,
      brandId: brand.id,
      campaignId,
      adIds: [adId],
    }),
  );
  await addReviewComment({ target, body: "Human comment" }, ctx);
  await addReviewComment(
    { target, body: "Agent observation" },
    { ...ctx, surface: "mcp" },
  );
  const humanVia = await addReviewComment(
    { target, body: "User words", as: "user" },
    { ...ctx, surface: "mcp" },
  );
  const before = await listReviewComments(target, ctx.orgId);
  assert.equal(before[0]?.actorKind, "user");
  assert.equal(before[0]?.viaAgent, false);
  assert.equal(before[1]?.actorKind, "agent");
  assert.equal(before[1]?.authorId, ctx.userId);
  assert.equal(before[2]?.actorKind, "user");
  assert.equal(before[2]?.viaAgent, true);
  await assert.rejects(() =>
    deleteReviewComment(humanVia.id, { ...ctx, userId: "usr_other" }),
  );
  const draft = await ad();
  await setAdStatus({
    adId,
    orgId: ctx.orgId,
    userId: ctx.userId,
    status: "ready",
    expectedUpdatedAt: draft.updatedAt.toISOString(),
  });
  const firstReady = await ad();
  await setAdCopy({
    adId,
    orgId: ctx.orgId,
    text: firstReady.content as import("@/server/db/ads-schema").AdTextContent,
    expectedUpdatedAt: firstReady.updatedAt.toISOString(),
  });
  const edited = await ad();
  assert.equal(edited.status, "drawn");
  assert.equal(edited.readyAt, null);
  await setAdStatus({
    adId,
    orgId: ctx.orgId,
    userId: ctx.userId,
    status: "ready",
    expectedUpdatedAt: edited.updatedAt.toISOString(),
  });
  const ready = await ad();
  assert(ready.readyAt);
  assert.equal(ready.status, "ready");
  await assert.rejects(() =>
    setAdStatus({
      adId,
      orgId: ctx.orgId,
      userId: ctx.userId,
      status: "approved",
      expectedUpdatedAt: draft.updatedAt.toISOString(),
    }),
  );
  await setAdStatus({
    adId,
    orgId: ctx.orgId,
    userId: ctx.userId,
    status: "approved",
    expectedUpdatedAt: ready.updatedAt.toISOString(),
  });
  const approved = await ad();
  draftAdResultSchema.parse(approved);
  draftAdActionOutputSchema.parse(JSON.parse(JSON.stringify(approved)));
  assert(approved.approvedSnapshot);
  assert.equal(approved.status, "approved");
  await attachAdSet({
    orgId: ctx.orgId,
    brandId: brand.id,
    campaignId,
    adIds: [adId],
  });
  const campaignOutput = await openCampaignAction.run({ campaignId }, ctx);
  openCampaignAction.outputSchema.parse(
    JSON.parse(JSON.stringify(campaignOutput)),
  );
  const assigned = await ad();
  assert.equal(assigned.campaignId, campaignId);
  await assert.rejects(() =>
    attachAdSet({
      orgId: ctx.orgId,
      brandId: brand.id,
      campaignId,
      adIds: [adId],
    }),
  );
  const existingPlatform = await db.query.platformAdTable.findFirst({
    where: eq(platformAdTable.brandId, brand.id),
  });
  let platformId: string | undefined;
  if (existingPlatform) {
    platformId = createId("pad");
    await db.insert(platformAdTable).values({
      ...existingPlatform,
      id: platformId,
      adId,
      businessKey: null,
      externalId: null,
      status: "active",
      pushedCreative: null,
    });
  }
  const platformBefore = platformId
    ? await db.query.platformAdTable.findFirst({
        where: eq(platformAdTable.id, platformId),
      })
    : null;
  await assert.rejects(() =>
    returnAdToStudio(
      { adId, expectedUpdatedAt: assigned.updatedAt.toISOString() },
      { ...ctx, orgId: "org_other" },
    ),
  );
  await returnAdToStudio(
    {
      adId,
      expectedUpdatedAt: assigned.updatedAt.toISOString(),
      comment: "Fix the destination",
    },
    ctx,
  );
  const returned = await ad();
  assert.equal(returned.id, adId);
  assert.equal(returned.campaignId, null);
  assert.equal(returned.status, "drawn");
  assert.equal(returned.approvedSnapshot, null);
  assert.equal(returned.approvedAt, null);
  assert.equal(returned.readyAt, null);
  const after = await listReviewComments(target, ctx.orgId);
  assert.equal(after.length, 4);
  assert.equal(after[3]?.event, "return_to_studio");
  assert(after[3]?.body.includes("Fix the destination"));
  await assert.rejects(() =>
    returnAdToStudio(
      { adId, expectedUpdatedAt: assigned.updatedAt.toISOString() },
      ctx,
    ),
  );
  await assert.rejects(() => deleteReviewComment(after[3]!.id, ctx));
  if (platformId) {
    const platformAfter = await db.query.platformAdTable.findFirst({
      where: eq(platformAdTable.id, platformId),
    });
    assert(platformAfter?.pushedCreative);
    assert.equal(platformAfter.status, platformBefore?.status);
    assert.deepEqual(platformAfter.media, platformBefore?.media);
    await db.delete(platformAdTable).where(eq(platformAdTable.id, platformId));
  }
  await deleteReviewComment(humanVia.id, ctx);
  assert.equal((await listReviewComments(target, ctx.orgId)).length, 3);
  console.log(
    "PASS: scope, attribution, stale approval/return, approved-only consumption, same-ID return, retained comments/events and platform creative",
  );
} finally {
  await db.delete(adTable).where(eq(adTable.id, adId));
  await db.delete(campaignTable).where(eq(campaignTable.id, campaignId));
}
