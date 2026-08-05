import type {
  CreateZernioPostInput,
  ZernioPost,
} from "@/server/clients/zernio.client";

function connectedAccountId(
  value: NonNullable<ZernioPost["platforms"]>[number]["accountId"],
) {
  return typeof value === "string" ? value : value?._id;
}

/**
 * A Zernio PUT replaces the composer payload. Use the provider receipt as the
 * source so moving a time cannot smuggle newer, unapproved local copy/media.
 */
export function buildZernioReschedulePayload(
  post: ZernioPost,
  scheduledFor: string,
): CreateZernioPostInput {
  const platforms = (post.platforms ?? []).map((target) => {
    const accountId = connectedAccountId(target.accountId);
    if (!target.platform || !accountId) {
      throw new Error("Zernio returned an incomplete platform target");
    }
    return {
      platform: target.platform,
      accountId,
      customContent: target.customContent,
      platformSpecificData: target.platformSpecificData,
    };
  });
  if (!platforms.length) throw new Error("Zernio returned no platform targets");

  const mediaItems = (post.mediaItems ?? []).map((item) => {
    if (!item.type || !item.url) {
      throw new Error("Zernio returned an incomplete media item");
    }
    return { type: item.type, url: item.url };
  });
  return {
    title: post.title,
    content: post.content,
    mediaItems: mediaItems.length ? mediaItems : undefined,
    platforms,
    scheduledFor,
    timezone: post.timezone ?? "UTC",
    metadata: post.metadata,
  };
}
