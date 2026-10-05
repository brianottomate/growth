/** Real database regression checks. Requires an explicitly selected disposable Neon branch. */
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  amplifierTable,
  brandTable,
  contentPostTable,
  platformPostTable,
  amplificationTargetTable,
  platformPostLinkTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import {
  requestAmplification,
  saveAmplifier,
  createAmplificationOutput,
  updateAmplification,
  readAmplificationTargets,
} from "@/server/ai/capabilities/amplification";
import { reconcileAmplificationTargetsForPosts } from "@/server/services/amplification.service";
import { notifyAmplificationTarget } from "@/server/services/amplification-notification.service";
import { deliverSocialPost } from "@/server/services/content-publishing.service";
import { matchesAmplificationAction } from "@/lib/amplification-plan";
import { migrateAmplification } from "./migrate-amplification";
import postgres from "postgres";

const host = new URL(process.env.DATABASE_URL!).hostname;
if (
  !process.env.AMPLIFICATION_TEST_DATABASE_HOST ||
  host !== process.env.AMPLIFICATION_TEST_DATABASE_HOST
)
  throw new Error(
    "Set AMPLIFICATION_TEST_DATABASE_HOST to the disposable branch host",
  );
const member = await db.query.memberTable.findFirst();
if (!member) throw new Error("Test branch needs one workspace member");
const ctx = {
  orgId: member.organizationId,
  userId: member.userId,
  surface: "test" as const,
  runId: createId("verify"),
};
const ids = {
  brand: createId("brand"),
  personal: createId("brand"),
  other: createId("brand"),
  content: createId("post"),
  source: createId("pp"),
  live: createId("pp"),
};
let contactId: string | undefined;
try {
  await db.insert(brandTable).values([
    {
      id: ids.brand,
      name: "Amplification test source",
      organizationId: ctx.orgId,
    },
    {
      id: ids.personal,
      name: "Amplification test person",
      type: "personal",
      organizationId: ctx.orgId,
    },
    { id: ids.other, name: "Unowned reference test", type: "personal" },
  ]);
  await db.insert(contentPostTable).values({
    id: ids.content,
    brandId: ids.brand,
    title: "Amplification regression",
  });
  await db.insert(platformPostTable).values({
    id: ids.source,
    contentPostId: ids.content,
    brandId: ids.brand,
    platform: "linkedin",
    source: "owned",
    status: "published",
    externalId: ids.source,
    publishedAt: new Date(),
  });
  const contact = await saveAmplifier.runValidated(
    {
      name: "Regression amplifier",
      handles: [
        { platform: "linkedin", handle: "regression" },
        { platform: "x", handle: "regression" },
      ],
    },
    ctx,
  );
  contactId = contact.id;
  const input = {
    platformPostId: ids.source,
    amplifierId: contact.id,
    destinationPlatform: "x",
    actionKind: "adaptation",
    draftText: "Operator copy",
  };
  const [a, b] = await Promise.all([
    requestAmplification.runValidated(input, ctx),
    requestAmplification.runValidated(input, ctx),
  ]);
  assert.equal(
    a.targetId,
    b.targetId,
    "concurrent requests create one assignment",
  );
  await assert.rejects(
    createAmplificationOutput.runValidated({ targetId: a.targetId }, ctx),
    /Link a personal brand/,
  );
  await assert.rejects(
    saveAmplifier.runValidated(
      { id: contact.id, linkedBrandId: ids.other },
      ctx,
    ),
    /organization/,
  );
  await assert.rejects(
    requestAmplification.runValidated({ ...input, actionKind: "repost" }, ctx),
    /adaptation/,
  );
  await assert.rejects(
    readAmplificationTargets.runValidated(
      { contentPostId: ids.content },
      { ...ctx, orgId: "not-this-workspace" },
    ),
    /organization/,
  );
  await saveAmplifier.runValidated(
    { id: contact.id, linkedBrandId: ids.personal },
    ctx,
  );
  const [first, second] = await Promise.all([
    createAmplificationOutput.runValidated({ targetId: a.targetId }, ctx),
    createAmplificationOutput.runValidated({ targetId: a.targetId }, ctx),
  ]);
  assert.equal(
    first.outputPlatformPostId,
    second.outputPlatformPostId,
    "concurrent promotion creates one output",
  );
  const output = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, first.outputPlatformPostId),
  });
  assert.equal(output?.brandId, ids.personal);
  assert.equal(output?.channelId, null);
  assert.equal(output?.scheduledAt, null);
  assert.equal(output?.status, "draft");
  assert.equal(output?.text, "Operator copy");
  // Both brands are disposable, have no provider profile/account, and cannot send.
  await db
    .update(platformPostTable)
    .set({ brandId: ids.brand })
    .where(eq(platformPostTable.id, first.outputPlatformPostId));
  await assert.rejects(
    deliverSocialPost({
      platformPostId: first.outputPlatformPostId,
      mode: "publish_now",
    }),
    /amplifier’s linked brand/,
  );
  await db
    .update(platformPostTable)
    .set({ brandId: ids.personal })
    .where(eq(platformPostTable.id, first.outputPlatformPostId));
  await assert.rejects(
    deliverSocialPost({
      platformPostId: first.outputPlatformPostId,
      mode: "publish_now",
    }),
    /Connect the amplifier/,
  );
  const links = await db
    .select()
    .from(platformPostLinkTable)
    .where(
      eq(platformPostLinkTable.fromPlatformPostId, first.outputPlatformPostId),
    );
  assert.equal(links.length, 1);
  await assert.rejects(
    saveAmplifier.runValidated({ id: contact.id, linkedBrandId: null }, ctx),
    /output drafts/,
  );
  await assert.rejects(
    updateAmplification.runValidated(
      { targetId: a.targetId, draftText: "Wrong editing location" },
      ctx,
    ),
    /linked output/,
  );
  await updateAmplification.runValidated(
    { targetId: a.targetId, outputText: "Edited once" },
    ctx,
  );
  await requestAmplification.runValidated(
    { ...input, draftText: "Do not overwrite" },
    ctx,
  );
  assert.equal(
    (
      await db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, first.outputPlatformPostId),
      })
    )?.text,
    "Edited once",
  );
  const share = await requestAmplification.runValidated(
    { ...input, destinationPlatform: "linkedin", actionKind: "repost" },
    ctx,
  );
  const quote = await requestAmplification.runValidated(
    { ...input, destinationPlatform: "linkedin", actionKind: "quote" },
    ctx,
  );
  await db.insert(platformPostTable).values({
    id: ids.live,
    brandId: ids.personal,
    platform: "linkedin",
    source: "scraped",
    status: "published",
    publishedAt: new Date(),
    username: "regression",
    externalKind: "retweet",
    amplifiedFrom: { externalId: ids.source },
  });
  assert.equal(await reconcileAmplificationTargetsForPosts([ids.live]), 1);
  const targets = await db.query.amplificationTargetTable.findMany({
    where: eq(amplificationTargetTable.amplifierId, contact.id),
  });
  assert.equal(targets.find((t) => t.id === share.targetId)?.ask, "fulfilled");
  assert.equal(targets.find((t) => t.id === quote.targetId)?.ask, "planned");
  assert.equal(targets.find((t) => t.id === a.targetId)?.ask, "planned");
  assert.equal(
    await reconcileAmplificationTargetsForPosts([ids.live]),
    0,
    "ingest replay is harmless",
  );
  assert.equal(
    matchesAmplificationAction("x", "adaptation", "x", "repost"),
    false,
  );
  await assert.rejects(
    updateAmplification.runValidated(
      { targetId: a.targetId, fulfilledByPostId: ids.live },
      ctx,
    ),
    /destination/,
  );
  await assert.rejects(
    notifyAmplificationTarget({
      targetId: quote.targetId,
      organizationId: ctx.orgId,
    }),
    /manual handoff/,
  );
  await db
    .update(platformPostTable)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(platformPostTable.id, first.outputPlatformPostId));
  assert.equal(
    await reconcileAmplificationTargetsForPosts([first.outputPlatformPostId]),
    1,
    "exact published adaptation completes its assignment",
  );
  assert.equal(
    await reconcileAmplificationTargetsForPosts([first.outputPlatformPostId]),
    0,
  );
  const lateOutputId = createId("pp");
  await db.insert(platformPostTable).values({
    id: lateOutputId,
    brandId: ids.personal,
    platform: "linkedin",
    source: "owned",
    status: "draft",
    text: "Operator copy",
  });
  await db.insert(platformPostLinkTable).values({
    fromPlatformPostId: lateOutputId,
    toPlatformPostId: ids.source,
    kind: "quote",
  });
  await saveAmplifier.runValidated(
    { id: contact.id, handoffPreference: "slack" },
    ctx,
  );
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {
      /* Expected IF NOT EXISTS notices. */
    },
  });
  try {
    await sql.begin(migrateAmplification);
  } finally {
    await sql.end();
  }
  const after = await readAmplificationTargets.runValidated(
    { contentPostId: ids.content },
    ctx,
  );
  assert.equal(after.targets.length, 3);
  assert.equal(
    after.targets.find((t) => t.id === a.targetId)?.draftText,
    "Edited once",
  );
  assert.equal(after.targets[0]?.amplifier.handoffPreference, "slack");
  assert.equal(
    after.targets.find((t) => t.id === quote.targetId)?.outputPlatformPostId,
    null,
    "migration replay does not restore or infer links",
  );
  console.log(
    "PASS: workspace access, manual/brand paths, concurrent retry, copy preservation, publishing identity, exact fulfillment, and migration replay. No provider calls.",
  );
} finally {
  if (contactId)
    await db.delete(amplifierTable).where(eq(amplifierTable.id, contactId));
  await db
    .delete(brandTable)
    .where(inArray(brandTable.id, [ids.brand, ids.personal, ids.other]));
}
