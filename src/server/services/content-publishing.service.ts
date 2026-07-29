import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  createZernioPost,
  getZernioPost,
  isZernioConfigured,
  mapZernioPlatform,
  retryZernioPost,
  type CreateZernioPostInput,
  type ZernioPost,
} from "@/server/clients/zernio.client";
import { db } from "@/server/db";
import {
  channelTable,
  type MediaItem,
  platformPostTable,
} from "@/server/db/schema";

export type SocialDeliveryMode = "schedule" | "publish_now";
export type SocialPublishingPlatform = "instagram" | "linkedin" | "x";

const SUPPORTED_PLATFORMS = new Set<SocialPublishingPlatform>([
  "instagram",
  "linkedin",
  "x",
]);

const ZERNIO_PLATFORM: Record<SocialPublishingPlatform, string> = {
  instagram: "instagram",
  linkedin: "linkedin",
  x: "twitter",
};

type DeliveryItem = {
  id: string;
  text: string | null;
  media: MediaItem[] | null;
  sequence: number | null;
};

type DeliveryPayload = {
  text: string;
  media: NonNullable<CreateZernioPostInput["mediaItems"]>;
  platformSpecificData?: Record<string, unknown>;
};

function accountId(
  value: string | { _id?: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return value?._id ?? null;
}

function platformResult(
  post: ZernioPost,
  account: string,
  platform: SocialPublishingPlatform,
) {
  return (
    post.platforms?.find(
      (target) =>
        mapZernioPlatform(target.platform) === platform &&
        accountId(target.accountId) === account,
    ) ??
    post.platforms?.find(
      (target) => mapZernioPlatform(target.platform) === platform,
    )
  );
}

function publicMedia(
  media: MediaItem[] | null,
): NonNullable<CreateZernioPostInput["mediaItems"]> {
  const items = media ?? [];
  if (items.some((item) => item.type === "carousel")) {
    throw new Error(
      "Carousel placeholders cannot publish. Attach each image or video as its own media item.",
    );
  }
  for (const item of items) {
    if (!item.url.startsWith("https://")) {
      throw new Error("Every media item needs a public HTTPS URL");
    }
  }
  return items.map((item) => ({
    type: item.type as "image" | "video",
    url: item.url,
  }));
}

function validateLinkedIn(item: DeliveryItem) {
  const text = item.text?.trim() ?? "";
  const media = publicMedia(item.media);
  const images = media.filter((entry) => entry.type === "image");
  const videos = media.filter((entry) => entry.type === "video");
  if (!text && !media.length) {
    throw new Error("Add copy or media before publishing");
  }
  if (text.length > 3_000) {
    throw new Error("LinkedIn posts can contain at most 3,000 characters");
  }
  if (images.length > 20) {
    throw new Error("LinkedIn supports at most 20 images per post");
  }
  if (videos.length > 1 || (videos.length > 0 && images.length > 0)) {
    throw new Error("LinkedIn accepts either images or one video, not both");
  }
  return { text, media };
}

function validateInstagram(item: DeliveryItem, format: string | null) {
  const text = item.text?.trim() ?? "";
  const media = publicMedia(item.media);
  const isStory = format?.toLowerCase().includes("story") ?? false;
  if (!media.length) {
    throw new Error("Instagram requires at least one image or video");
  }
  if (text.length > 2_200) {
    throw new Error("Instagram captions can contain at most 2,200 characters");
  }
  if (media.length > 10) {
    throw new Error("Instagram carousels support at most 10 media items");
  }
  if (isStory && media.length !== 1) {
    throw new Error("Instagram Stories require exactly one media item");
  }
  return { text, media, isStory };
}

function validateX(item: DeliveryItem) {
  const text = item.text?.trim() ?? "";
  const media = publicMedia(item.media);
  const images = media.filter((entry) => entry.type === "image");
  const videos = media.filter((entry) => entry.type === "video");
  if (!text && !media.length) {
    throw new Error("Each X post needs copy or media");
  }
  if (text.length > 25_000) {
    throw new Error("X posts can contain at most 25,000 characters");
  }
  if (images.length > 4) {
    throw new Error("X supports at most 4 images per post");
  }
  if (videos.length > 1 || (videos.length > 0 && images.length > 0)) {
    throw new Error("X accepts either images or one video per post, not both");
  }
  return { text, media };
}

function deliveryPayload(input: {
  platform: SocialPublishingPlatform;
  format: string | null;
  items: DeliveryItem[];
}): DeliveryPayload {
  const root = input.items[0];
  if (!root) throw new Error("Platform post not found");

  if (input.platform === "linkedin") {
    if (input.items.length > 1) {
      throw new Error("LinkedIn thread groups are not supported");
    }
    return validateLinkedIn(root);
  }

  if (input.platform === "instagram") {
    if (input.items.length > 1) {
      throw new Error("Instagram thread groups are not supported");
    }
    const { text, media, isStory } = validateInstagram(root, input.format);
    return {
      text,
      media,
      platformSpecificData: isStory ? { contentType: "story" } : undefined,
    };
  }

  const items = input.items.map(validateX);
  if (items.length === 1) return items[0]!;

  return {
    text: items
      .map((item) => item.text)
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 25_000),
    media: [],
    platformSpecificData: {
      threadItems: items.map((item) => ({
        content: item.text,
        mediaItems: item.media.length ? item.media : undefined,
      })),
    },
  };
}

async function loadSocialSpot(platformPostId: string) {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
    with: {
      brand: true,
      channel: true,
      contentPost: { columns: { title: true } },
      children: {
        columns: {
          id: true,
          text: true,
          media: true,
          sequence: true,
        },
      },
    },
  });
  if (!spot) throw new Error("Platform post not found");
  if (spot.parentPlatformPostId) {
    throw new Error("Publish the first post in this thread group");
  }
  if (spot.source !== "owned") throw new Error("Only owned posts can publish");
  if (!SUPPORTED_PLATFORMS.has(spot.platform as SocialPublishingPlatform)) {
    throw new Error("Zernio publishing supports Instagram, LinkedIn, and X");
  }
  const platform = spot.platform as SocialPublishingPlatform;
  if (!isZernioConfigured) throw new Error("Zernio is not configured");
  if (!spot.brand?.zernioProfileId) {
    throw new Error("Connect this brand to a Zernio profile first");
  }

  let channel = spot.channel;
  if (
    !channel?.externalId ||
    channel.platform !== platform ||
    channel.defaultProvider !== "zernio" ||
    channel.connectionStatus !== "connected" ||
    !channel.isActive
  ) {
    channel =
      (await db.query.channelTable.findFirst({
        where: and(
          eq(channelTable.brandId, spot.brandId),
          eq(channelTable.platform, platform),
          eq(channelTable.defaultProvider, "zernio"),
          eq(channelTable.connectionStatus, "connected"),
          eq(channelTable.isActive, true),
          isNull(channelTable.deletedAt),
        ),
      })) ?? null;
  }
  if (!channel?.externalId) {
    throw new Error(
      `This brand has no connected ${platform === "x" ? "X" : platform} account in Zernio`,
    );
  }

  const items: DeliveryItem[] = [
    {
      id: spot.id,
      text: spot.text,
      media: spot.media,
      sequence: spot.sequence,
    },
    ...spot.children,
  ].sort(
    (a, b) =>
      (a.sequence ?? Number.MAX_SAFE_INTEGER) -
      (b.sequence ?? Number.MAX_SAFE_INTEGER),
  );
  const payload = deliveryPayload({
    platform,
    format: spot.format,
    items,
  });

  return {
    spot,
    channel,
    platform,
    connectedAccountId: channel.externalId,
    items,
    payload,
  };
}

async function persistDelivery(
  spot: Awaited<ReturnType<typeof loadSocialSpot>>["spot"],
  itemIds: string[],
  zernioPost: ZernioPost,
  account: string,
  platform: SocialPublishingPlatform,
  fallbackStatus: string,
) {
  const target = platformResult(zernioPost, account, platform);
  const deliveryStatus =
    zernioPost.status === "partial"
      ? "partial"
      : (target?.status ?? zernioPost.status ?? fallbackStatus);
  const published =
    deliveryStatus === "published" || zernioPost.status === "published";
  const failed =
    deliveryStatus === "failed" ||
    deliveryStatus === "partial" ||
    zernioPost.status === "failed" ||
    zernioPost.status === "partial";
  const cancelled =
    deliveryStatus === "cancelled" || zernioPost.status === "cancelled";

  await db
    .update(platformPostTable)
    .set({
      provider: "zernio",
      deliveryExternalId: zernioPost._id,
      deliveryStatus,
      deliveryError: target?.error ?? (failed ? "Publishing failed" : null),
      deliveryUpdatedAt: new Date(),
      status: published
        ? "published"
        : failed || cancelled
          ? "approved"
          : "scheduled",
      scheduledAt: zernioPost.scheduledFor
        ? new Date(zernioPost.scheduledFor)
        : undefined,
      publishedAt: published ? new Date() : undefined,
    })
    .where(inArray(platformPostTable.id, itemIds));

  await db
    .update(platformPostTable)
    .set({
      externalId: target?.platformPostId,
      externalUrl: target?.platformPostUrl,
    })
    .where(eq(platformPostTable.id, spot.id));

  return {
    zernioPostId: zernioPost._id ?? null,
    deliveryStatus,
    externalUrl: target?.platformPostUrl ?? null,
  };
}

export async function deliverSocialPost(input: {
  platformPostId: string;
  mode: SocialDeliveryMode;
}) {
  const { spot, channel, platform, connectedAccountId, items, payload } =
    await loadSocialSpot(input.platformPostId);
  if (spot.status !== "approved") {
    throw new Error(
      `Approve this ${platform === "x" ? "X" : platform} post before sending it to Zernio`,
    );
  }
  if (spot.deliveryExternalId) {
    throw new Error("This post has already been handed to Zernio");
  }
  if (input.mode === "schedule") {
    if (!spot.scheduledAt) {
      throw new Error("Choose a future publish time first");
    }
    if (spot.scheduledAt.getTime() <= Date.now()) {
      throw new Error("The scheduled time must be in the future");
    }
  }

  const scheduledFor =
    input.mode === "schedule" ? spot.scheduledAt?.toISOString() : undefined;
  const zernioPost = await createZernioPost(
    {
      title: spot.contentPost?.title ?? undefined,
      content: payload.text || undefined,
      mediaItems: payload.media.length ? payload.media : undefined,
      platforms: [
        {
          platform: ZERNIO_PLATFORM[platform],
          accountId: connectedAccountId,
          platformSpecificData: payload.platformSpecificData,
        },
      ],
      scheduledFor,
      publishNow: input.mode === "publish_now" ? true : undefined,
      timezone: "UTC",
      metadata: {
        growthPlatformPostId: spot.id,
        growthBrandId: spot.brandId,
      },
    },
    {
      requestId: `growth:${spot.id}:${input.mode}:${scheduledFor ?? "now"}`,
    },
  );

  if (spot.channelId !== channel.id) {
    await db
      .update(platformPostTable)
      .set({ channelId: channel.id, username: spot.username ?? channel.handle })
      .where(
        inArray(
          platformPostTable.id,
          items.map((item) => item.id),
        ),
      );
  }

  return persistDelivery(
    spot,
    items.map((item) => item.id),
    zernioPost,
    connectedAccountId,
    platform,
    input.mode === "schedule" ? "scheduled" : "publishing",
  );
}

export async function refreshSocialDelivery(platformPostId: string) {
  const { spot, connectedAccountId, items, platform } =
    await loadSocialSpot(platformPostId);
  if (!spot.deliveryExternalId) {
    throw new Error("This post is not in Zernio yet");
  }
  const zernioPost = await getZernioPost(spot.deliveryExternalId);
  if (!zernioPost) throw new Error("The Zernio post no longer exists");
  return persistDelivery(
    spot,
    items.map((item) => item.id),
    zernioPost,
    connectedAccountId,
    platform,
    "unknown",
  );
}

export async function retrySocialDelivery(platformPostId: string) {
  const { spot, connectedAccountId, items, platform } =
    await loadSocialSpot(platformPostId);
  if (!spot.deliveryExternalId) {
    throw new Error("This post is not in Zernio yet");
  }
  const zernioPost = await retryZernioPost(spot.deliveryExternalId);
  return persistDelivery(
    spot,
    items.map((item) => item.id),
    zernioPost,
    connectedAccountId,
    platform,
    "publishing",
  );
}
