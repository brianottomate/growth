import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import {
  createZernioPost,
  getZernioPost,
  isZernioConfigured,
  type ZernioPost,
} from "@/server/clients/zernio.client";
import { db } from "@/server/db";
import {
  channelTable,
  type MediaItem,
  platformPostTable,
} from "@/server/db/schema";

export type LinkedInDeliveryMode = "schedule" | "publish_now";

function accountId(
  value: string | { _id?: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return value?._id ?? null;
}

function platformResult(post: ZernioPost, account: string) {
  return (
    post.platforms?.find(
      (target) =>
        target.platform?.toLowerCase() === "linkedin" &&
        accountId(target.accountId) === account,
    ) ?? post.platforms?.find((target) => target.platform === "linkedin")
  );
}

function linkedInMedia(media: MediaItem[] | null) {
  const items = media ?? [];
  if (items.some((item) => item.type === "carousel")) {
    throw new Error(
      "LinkedIn document carousels need a document asset; image carousels should use individual image items.",
    );
  }
  const images = items.filter((item) => item.type === "image");
  const videos = items.filter((item) => item.type === "video");
  if (images.length > 20) {
    throw new Error("LinkedIn supports at most 20 images per post");
  }
  if (videos.length > 1 || (videos.length && images.length)) {
    throw new Error("LinkedIn accepts either images or one video, not both");
  }
  for (const item of items) {
    if (!item.url.startsWith("https://")) {
      throw new Error("Every LinkedIn media item needs a public HTTPS URL");
    }
  }
  return items.map((item) => ({
    type: item.type as "image" | "video",
    url: item.url,
  }));
}

async function loadLinkedInSpot(platformPostId: string) {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
    with: {
      brand: true,
      channel: true,
      contentPost: { columns: { title: true } },
    },
  });
  if (!spot) throw new Error("Platform post not found");
  if (spot.source !== "owned") throw new Error("Only owned posts can publish");
  if (spot.platform !== "linkedin") {
    throw new Error("This publishing spike currently supports LinkedIn only");
  }
  if (!isZernioConfigured) throw new Error("Zernio is not configured");
  if (!spot.brand?.zernioProfileId) {
    throw new Error("Connect this brand to a Zernio profile first");
  }

  let channel = spot.channel;
  if (
    !channel?.externalId ||
    channel.defaultProvider !== "zernio" ||
    channel.connectionStatus !== "connected"
  ) {
    channel =
      (await db.query.channelTable.findFirst({
        where: and(
          eq(channelTable.brandId, spot.brandId),
          eq(channelTable.platform, "linkedin"),
          eq(channelTable.defaultProvider, "zernio"),
          eq(channelTable.connectionStatus, "connected"),
          eq(channelTable.isActive, true),
          isNull(channelTable.deletedAt),
        ),
      })) ?? null;
  }
  if (!channel?.externalId) {
    throw new Error("This brand has no connected LinkedIn account in Zernio");
  }
  const connectedAccountId = channel.externalId;

  const text = spot.text?.trim() ?? "";
  const media = linkedInMedia(spot.media);
  if (!text && !media.length)
    throw new Error("Add copy or media before publishing");
  if (text.length > 3_000) {
    throw new Error("LinkedIn posts can contain at most 3,000 characters");
  }

  return { spot, channel, connectedAccountId, text, media };
}

async function persistDelivery(
  platformPostId: string,
  zernioPost: ZernioPost,
  account: string,
  fallbackStatus: string,
) {
  const target = platformResult(zernioPost, account);
  const deliveryStatus = target?.status ?? zernioPost.status ?? fallbackStatus;
  const published =
    deliveryStatus === "published" || zernioPost.status === "published";
  const failed = deliveryStatus === "failed" || zernioPost.status === "failed";

  await db
    .update(platformPostTable)
    .set({
      provider: "zernio",
      deliveryExternalId: zernioPost._id,
      deliveryStatus,
      deliveryError: target?.error ?? (failed ? "Publishing failed" : null),
      deliveryUpdatedAt: new Date(),
      status: published ? "published" : failed ? "approved" : "scheduled",
      scheduledAt: zernioPost.scheduledFor
        ? new Date(zernioPost.scheduledFor)
        : undefined,
      publishedAt: published ? new Date() : undefined,
      externalId: target?.platformPostId,
      externalUrl: target?.platformPostUrl,
    })
    .where(eq(platformPostTable.id, platformPostId));

  return {
    zernioPostId: zernioPost._id ?? null,
    deliveryStatus,
    externalUrl: target?.platformPostUrl ?? null,
  };
}

export async function deliverLinkedInPost(input: {
  platformPostId: string;
  mode: LinkedInDeliveryMode;
}) {
  const { spot, channel, connectedAccountId, text, media } =
    await loadLinkedInSpot(input.platformPostId);
  if (spot.status !== "approved") {
    throw new Error("Approve this LinkedIn post before sending it to Zernio");
  }
  if (spot.deliveryExternalId) {
    throw new Error("This post has already been handed to Zernio");
  }
  if (input.mode === "schedule") {
    if (!spot.scheduledAt)
      throw new Error("Choose a future publish time first");
    if (spot.scheduledAt.getTime() <= Date.now()) {
      throw new Error("The scheduled time must be in the future");
    }
  }

  const zernioPost = await createZernioPost(
    {
      title: spot.contentPost?.title ?? undefined,
      content: text || undefined,
      mediaItems: media.length ? media : undefined,
      platforms: [{ platform: "linkedin", accountId: connectedAccountId }],
      scheduledFor:
        input.mode === "schedule" ? spot.scheduledAt?.toISOString() : undefined,
      publishNow: input.mode === "publish_now" ? true : undefined,
      timezone: "UTC",
      metadata: {
        growthPlatformPostId: spot.id,
        growthBrandId: spot.brandId,
      },
    },
    { requestId: crypto.randomUUID() },
  );

  if (spot.channelId !== channel.id) {
    await db
      .update(platformPostTable)
      .set({ channelId: channel.id, username: spot.username ?? channel.handle })
      .where(eq(platformPostTable.id, spot.id));
  }

  return persistDelivery(
    spot.id,
    zernioPost,
    connectedAccountId,
    input.mode === "schedule" ? "scheduled" : "publishing",
  );
}

export async function refreshLinkedInDelivery(platformPostId: string) {
  const { spot, connectedAccountId } = await loadLinkedInSpot(platformPostId);
  if (!spot.deliveryExternalId)
    throw new Error("This post is not in Zernio yet");
  const zernioPost = await getZernioPost(spot.deliveryExternalId);
  if (!zernioPost) throw new Error("The Zernio post no longer exists");
  return persistDelivery(spot.id, zernioPost, connectedAccountId, "unknown");
}
