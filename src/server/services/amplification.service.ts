import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  amplificationTargetTable,
  amplifierTable,
  brandTable,
  contentPostTable,
  initiativeTable,
  platformPostTable,
} from "@/server/db/schema";
import { amplifierHandlesAccount } from "./amplification-matching";

/**
 * Best-effort reconciliation after canonical post ingest. A repost/quote made by
 * a recruited account fulfills its target when the original post belongs to a
 * content item attached to that moment.
 */
export async function reconcileAmplificationTargetsForPosts(postIds: string[]) {
  if (!postIds.length) return 0;
  const posts = await db.query.platformPostTable.findMany({
    where: inArray(platformPostTable.id, postIds),
  });
  let fulfilled = 0;

  for (const post of posts) {
    const originalExternalId = post.amplifiedFrom?.externalId;
    if (!originalExternalId) continue;
    const originals = await db.query.platformPostTable.findMany({
      where: and(
        eq(platformPostTable.platform, post.platform),
        eq(platformPostTable.externalId, originalExternalId),
      ),
    });
    const original = originals.find((candidate) => candidate.contentPostId);
    if (!original?.contentPostId) continue;

    const content = await db.query.contentPostTable.findFirst({
      where: eq(contentPostTable.id, original.contentPostId),
    });
    if (!content?.initiativeId) continue;
    const initiative = await db.query.initiativeTable.findFirst({
      where: eq(initiativeTable.id, content.initiativeId),
    });
    if (!initiative) continue;
    const brand = await db.query.brandTable.findFirst({
      where: eq(brandTable.id, initiative.brandId),
    });
    if (!brand?.organizationId) continue;

    const amplifiers = await db.query.amplifierTable.findMany({
      where: eq(amplifierTable.organizationId, brand.organizationId),
    });
    const amplifier = amplifiers.find(
      (candidate) =>
        candidate.promotedBrandId === post.brandId ||
        amplifierHandlesAccount(
          candidate.handles,
          post.platform,
          post.username,
        ),
    );
    if (!amplifier) continue;

    const [updated] = await db
      .update(amplificationTargetTable)
      .set({
        ask: "fulfilled",
        fulfilledAt: new Date(),
        fulfilledByPostId: post.id,
      })
      .where(
        and(
          eq(amplificationTargetTable.momentId, initiative.id),
          eq(amplificationTargetTable.amplifierId, amplifier.id),
        ),
      )
      .returning({ id: amplificationTargetTable.id });
    if (updated) fulfilled++;
  }

  return fulfilled;
}
