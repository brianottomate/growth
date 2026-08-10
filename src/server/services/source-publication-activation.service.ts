import "server-only";

import { and, eq } from "drizzle-orm";

import { appendLiveUrlToPlatformPost } from "@/lib/platform-post-link";
import { db } from "@/server/db";
import { platformPostLinkTable, platformPostTable } from "@/server/db/schema";

export async function activatePublishedSourcePost(
  sourcePlatformPostId: string,
) {
  const source = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, sourcePlatformPostId),
    columns: { id: true, externalUrl: true, deliveryStatus: true },
  });
  if (source?.deliveryStatus !== "published" || !source.externalUrl) {
    return { activatedDrafts: 0, blockedDrafts: 0 };
  }

  const links = await db.query.platformPostLinkTable.findMany({
    where: and(
      eq(platformPostLinkTable.toPlatformPostId, source.id),
      eq(platformPostLinkTable.injectUrlAtPublish, true),
    ),
    with: {
      from: {
        columns: {
          id: true,
          text: true,
          publishedAt: true,
          deliveryExternalId: true,
        },
      },
    },
  });
  let activatedDrafts = 0;
  let blockedDrafts = 0;
  for (const link of links) {
    const draft = link.from;
    if (!draft || draft.publishedAt || draft.deliveryExternalId) {
      blockedDrafts += 1;
      continue;
    }
    const text = appendLiveUrlToPlatformPost(draft.text, source.externalUrl);
    if (!text) continue;
    await db
      .update(platformPostTable)
      .set({ text })
      .where(eq(platformPostTable.id, draft.id));
    activatedDrafts += 1;
  }
  return { activatedDrafts, blockedDrafts };
}
