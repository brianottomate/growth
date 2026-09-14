import "server-only";

import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";

import {
  createZernioPost,
  getZernioPost,
  isZernioConfigured,
  listZernioAccounts,
  mapZernioPlatform,
  retryZernioPost,
  updateZernioPost,
  type CreateZernioPostInput,
  type ZernioPost,
} from "@/server/clients/zernio.client";
import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  type MediaItem,
  platformPostTable,
} from "@/server/db/schema";
import { isStoryFormat, sequenceScheduledAt } from "@/lib/platform-sequence";
import { buildZernioReschedulePayload } from "@/lib/zernio-reschedule";

export type SocialDeliveryMode = "schedule" | "publish_now";
export type SocialPublishingPlatform =
  "facebook" | "instagram" | "linkedin" | "x";

const SUPPORTED_PLATFORMS = new Set<SocialPublishingPlatform>([
  "facebook",
  "instagram",
  "linkedin",
  "x",
]);

// Zernio posts the first comment for these; X has no first-comment slot.
const FIRST_COMMENT_LIMIT: Partial<Record<string, number>> = {
  instagram: 2_200,
  linkedin: 1_250,
  facebook: 8_000,
};

const ZERNIO_PLATFORM: Record<SocialPublishingPlatform, string> = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  x: "twitter",
};

type DeliveryItem = {
  id: string;
  text: string | null;
  media: MediaItem[] | null;
  sequence: number | null;
  deliveryExternalId: string | null;
  deliveryStatus: string | null;
  deliveryError: string | null;
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

async function requireActiveZernioAccount(input: {
  channelId: string;
  accountId: string;
  platform: SocialPublishingPlatform;
}) {
  const accounts = await listZernioAccounts();
  const account = accounts.find(
    (candidate) => (candidate._id ?? candidate.id) === input.accountId,
  );
  const unavailable =
    !account ||
    account.isActive === false ||
    account.enabled === false ||
    account.platformStatus?.toLowerCase() === "error";
  if (!unavailable) return;

  await db
    .update(channelTable)
    .set({ connectionStatus: "disconnected", isActive: false })
    .where(eq(channelTable.id, input.channelId));
  const label: Record<SocialPublishingPlatform, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    x: "X",
  };
  throw new Error(
    `Reconnect the ${label[input.platform]} account in Zernio before publishing or scheduling. The live provider account is inactive.`,
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

function validateFacebook(item: DeliveryItem) {
  const text = item.text?.trim() ?? "";
  const media = publicMedia(item.media);
  const images = media.filter((entry) => entry.type === "image");
  const videos = media.filter((entry) => entry.type === "video");
  if (!text && !media.length) {
    throw new Error("Add copy or media before publishing");
  }
  if (text.length > 63_206) {
    throw new Error("Facebook posts can contain at most 63,206 characters");
  }
  if (images.length > 10) {
    throw new Error("Facebook supports at most 10 images per post");
  }
  if (videos.length > 1 || (videos.length > 0 && images.length > 0)) {
    throw new Error("Facebook accepts either images or one video, not both");
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

function validateStoryFrame(item: DeliveryItem, frameNumber: number) {
  const media = publicMedia(item.media);
  if (media.length !== 1) {
    throw new Error(
      `Story frame ${frameNumber} needs exactly one image or video`,
    );
  }
  return media;
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
  firstComment?: string | null;
}): DeliveryPayload {
  const root = input.items[0];
  if (!root) throw new Error("Platform post not found");
  const firstComment = input.firstComment?.trim() || null;
  const firstCommentLimit = FIRST_COMMENT_LIMIT[input.platform] ?? null;
  if (firstComment && firstCommentLimit === null) {
    throw new Error("This platform format does not support a first comment");
  }
  if (firstComment && firstComment.length > firstCommentLimit!) {
    throw new Error(
      `First comments can contain at most ${firstCommentLimit} characters`,
    );
  }

  if (input.platform === "linkedin") {
    if (input.items.length > 1) {
      throw new Error("LinkedIn thread groups are not supported");
    }
    return {
      ...validateLinkedIn(root),
      platformSpecificData: firstComment ? { firstComment } : undefined,
    };
  }

  if (input.platform === "facebook") {
    if (input.items.length > 1) {
      throw new Error("Facebook thread groups are not supported");
    }
    return {
      ...validateFacebook(root),
      platformSpecificData: firstComment ? { firstComment } : undefined,
    };
  }
  if (input.platform === "instagram") {
    if (input.items.length > 1) {
      throw new Error("Instagram thread groups are not supported");
    }
    const { text, media, isStory } = validateInstagram(root, input.format);
    return {
      text,
      media,
      platformSpecificData:
        isStory || firstComment
          ? {
              ...(isStory ? { contentType: "story" } : {}),
              ...(firstComment ? { firstComment } : {}),
            }
          : undefined,
    };
  }

  if (input.platform !== "x") {
    throw new Error("This platform format is not available for publishing");
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
          deliveryExternalId: true,
          deliveryStatus: true,
          deliveryError: true,
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
    throw new Error(
      "Zernio publishing supports Facebook, Instagram, LinkedIn, and X",
    );
  }
  const platform = spot.platform as SocialPublishingPlatform;
  const story = isStoryFormat(spot.format);
  if (!isZernioConfigured) throw new Error("Zernio is not configured");

  // A brand with no Zernio profile of its own can still post to its Facebook
  // Page through a connection that manages the Page — Wander's, once the
  // client's Leadsie grant put the Page in Wander's Business Portfolio.
  // Zernio takes the Page per post (platformSpecificData.pageId), which is
  // the one place it lets the account and the identity differ. Instagram,
  // LinkedIn and X have no such switch, so they still need the brand's own
  // connection.
  let pageId: string | null = null;
  let channel = spot.channel;
  if (!spot.brand?.zernioProfileId) {
    if (platform !== "facebook" || !spot.brand?.metaPageId) {
      throw new Error("Connect this brand to a Zernio profile first");
    }
    const shared = await sharedFacebookChannel(
      spot.brand.organizationId,
      spot.brandId,
    );
    if (!shared) {
      throw new Error(
        "No Facebook connection in this organisation can post as this brand's Page",
      );
    }
    channel = shared;
    pageId = spot.brand.metaPageId;
  } else if (
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
      deliveryExternalId: spot.deliveryExternalId,
      deliveryStatus: spot.deliveryStatus,
      deliveryError: spot.deliveryError,
    },
    ...spot.children,
  ].sort(
    (a, b) =>
      (a.sequence ?? Number.MAX_SAFE_INTEGER) -
      (b.sequence ?? Number.MAX_SAFE_INTEGER),
  );
  const payload = story
    ? null
    : deliveryPayload({
        platform,
        format: spot.format,
        items,
        firstComment: spot.firstCommentText,
      });
  if (story) {
    items.forEach((item, index) => validateStoryFrame(item, index + 1));
  }

  return {
    spot,
    channel,
    platform,
    connectedAccountId: channel.externalId,
    /** Set only when posting as a Page through another brand's connection. */
    pageId,
    items,
    payload,
    story,
  };
}

/**
 * A connected Facebook channel elsewhere in the organisation whose token can
 * carry a post for another brand's Page. Any will do: Zernio checks the Page
 * against the connection's own list at publish time.
 */
async function sharedFacebookChannel(
  organizationId: string | null,
  excludeBrandId: string,
) {
  if (!organizationId) return null;
  const rows = await db
    .select({ channel: channelTable })
    .from(channelTable)
    .innerJoin(brandTable, eq(brandTable.id, channelTable.brandId))
    .where(
      and(
        eq(brandTable.organizationId, organizationId),
        ne(channelTable.brandId, excludeBrandId),
        eq(channelTable.platform, "facebook"),
        eq(channelTable.defaultProvider, "zernio"),
        eq(channelTable.connectionStatus, "connected"),
        eq(channelTable.isActive, true),
        isNull(channelTable.deletedAt),
        isNotNull(channelTable.externalId),
      ),
    )
    .limit(1);
  return rows[0]?.channel ?? null;
}

async function persistDelivery(
  spot: Awaited<ReturnType<typeof loadSocialSpot>>["spot"],
  itemIds: string[],
  zernioPost: ZernioPost,
  account: string,
  platform: SocialPublishingPlatform,
  fallbackStatus: string,
  externalTargetId = spot.id,
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
  const deliveryError =
    target?.errorMessage ??
    target?.error ??
    (target?.errorCategory
      ? `${target.errorCategory}${target.errorSource ? ` (${target.errorSource})` : ""}`
      : failed
        ? "Publishing failed"
        : null);

  await db
    .update(platformPostTable)
    .set({
      provider: "zernio",
      deliveryExternalId: zernioPost._id,
      deliveryStatus,
      deliveryError,
      deliveryUpdatedAt: new Date(),
      firstCommentStatus: spot.firstCommentText
        ? published
          ? "posted"
          : failed || cancelled
            ? "failed"
            : "queued"
        : undefined,
      firstCommentError:
        spot.firstCommentText && (failed || cancelled)
          ? (deliveryError ?? "First comment was not delivered")
          : spot.firstCommentText
            ? null
            : undefined,
      firstCommentUpdatedAt: spot.firstCommentText ? new Date() : undefined,
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
    .where(eq(platformPostTable.id, externalTargetId));

  return {
    zernioPostId: zernioPost._id ?? null,
    deliveryStatus,
    externalUrl: target?.platformPostUrl ?? null,
  };
}

export async function deliverSocialPost(input: {
  platformPostId: string;
  mode: SocialDeliveryMode;
  accountValidated?: boolean;
}) {
  const loaded = await loadSocialSpot(input.platformPostId);
  const {
    spot,
    channel,
    platform,
    connectedAccountId,
    pageId,
    items,
    payload,
    story,
  } = loaded;
  if (!input.accountValidated) {
    await requireActiveZernioAccount({
      channelId: channel.id,
      accountId: connectedAccountId,
      platform,
    });
  }
  const handedOffCount = items.filter((item) => item.deliveryExternalId).length;
  if (spot.status !== "approved" && !(story && handedOffCount > 0)) {
    throw new Error(
      `Approve this ${story ? "Story sequence" : platform === "x" ? "X post" : `${platform} post`} before sending it to Zernio`,
    );
  }
  if (!story && spot.deliveryExternalId) {
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

  if (story) {
    const results = [];
    for (const [index, item] of items.entries()) {
      if (item.deliveryExternalId) continue;
      const scheduledFor =
        input.mode === "schedule"
          ? sequenceScheduledAt(spot.scheduledAt!, index).toISOString()
          : undefined;
      try {
        const zernioPost = await createZernioPost(
          {
            mediaItems: validateStoryFrame(item, index + 1),
            platforms: [
              {
                platform: ZERNIO_PLATFORM[platform],
                accountId: connectedAccountId,
                platformSpecificData: {
                  contentType: "story",
                  ...(pageId ? { pageId } : {}),
                },
              },
            ],
            scheduledFor,
            publishNow: input.mode === "publish_now" ? true : undefined,
            timezone: "UTC",
            metadata: {
              growthPlatformPostId: item.id,
              growthStoryRootPlatformPostId: spot.id,
              growthStoryFrame: index + 1,
              growthBrandId: spot.brandId,
            },
          },
          {
            requestId: `growth-story:${item.id}:${input.mode}:${scheduledFor ?? "now"}`,
          },
        );
        results.push(
          await persistDelivery(
            spot,
            [item.id],
            zernioPost,
            connectedAccountId,
            platform,
            input.mode === "schedule" ? "scheduled" : "publishing",
            item.id,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Story publishing failed";
        await db
          .update(platformPostTable)
          .set({
            provider: "zernio",
            deliveryStatus: "failed",
            deliveryError: message,
            deliveryUpdatedAt: new Date(),
          })
          .where(eq(platformPostTable.id, item.id));
        throw new Error(
          `Story frame ${index + 1} could not be handed to Zernio. Earlier frames remain saved. ${message}`,
        );
      }
    }

    if (spot.channelId !== channel.id) {
      await db
        .update(platformPostTable)
        .set({
          channelId: channel.id,
          username: spot.username ?? channel.handle,
        })
        .where(
          inArray(
            platformPostTable.id,
            items.map((item) => item.id),
          ),
        );
    }
    const totalHandedOff = handedOffCount + results.length;
    return {
      deliveryStatus:
        totalHandedOff === items.length
          ? input.mode === "schedule"
            ? "scheduled"
            : "publishing"
          : "partial",
      handedOffCount: results.length,
      frameCount: items.length,
    };
  }

  if (!payload) {
    throw new Error("Could not build the publishing payload");
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
          platformSpecificData: pageId
            ? { ...payload.platformSpecificData, pageId }
            : payload.platformSpecificData,
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

export async function saveSocialFirstComment(input: {
  platformPostId: string;
  firstComment: string | null;
}) {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
  });
  if (!spot) throw new Error("Platform post not found");
  if (spot.parentPlatformPostId) {
    throw new Error("Prepare the first comment on the root post");
  }
  const limit = isStoryFormat(spot.format)
    ? null
    : (FIRST_COMMENT_LIMIT[spot.platform] ?? null);
  if (limit === null) {
    throw new Error("This platform format does not support a first comment");
  }
  const firstComment = input.firstComment?.trim() || null;
  if (firstComment && firstComment.length > limit) {
    throw new Error(`First comments can contain at most ${limit} characters`);
  }
  await db
    .update(platformPostTable)
    .set({
      firstCommentText: firstComment,
      firstCommentStatus: firstComment ? "draft" : null,
      firstCommentError: null,
      firstCommentUpdatedAt: new Date(),
    })
    .where(eq(platformPostTable.id, spot.id));
  return {
    platformPostId: spot.id,
    firstCommentStatus: firstComment ? "draft" : null,
  };
}

/** Provider update for a first comment on an already queued post. */
export async function updateQueuedSocialFirstComment(input: {
  platformPostId: string;
  firstComment: string;
}) {
  const { spot, channel, platform, connectedAccountId, items, story } =
    await loadSocialSpot(input.platformPostId);
  if (story || !(platform in FIRST_COMMENT_LIMIT)) {
    throw new Error("This platform format does not support a first comment");
  }
  if (!spot.deliveryExternalId) {
    throw new Error(
      "Schedule the post in Zernio before updating its first comment",
    );
  }
  if (spot.status === "published" || spot.deliveryStatus === "published") {
    throw new Error("This post is already published");
  }
  const firstComment = input.firstComment.trim();
  if (!firstComment) throw new Error("Write the first comment before updating");
  await requireActiveZernioAccount({
    channelId: channel.id,
    accountId: connectedAccountId,
    platform,
  });
  const payload = deliveryPayload({
    platform,
    format: spot.format,
    items,
    firstComment,
  });
  const current = await getZernioPost(spot.deliveryExternalId);
  if (!current) throw new Error("The Zernio post no longer exists");
  const scheduledFor = current.scheduledFor ?? spot.scheduledAt?.toISOString();
  if (!scheduledFor) throw new Error("The Zernio post has no scheduled time");
  const providerPayload = buildZernioReschedulePayload(current, scheduledFor);
  let matchedTarget = false;
  providerPayload.platforms = providerPayload.platforms.map((target) => {
    if (
      target.platform !== ZERNIO_PLATFORM[platform] ||
      target.accountId !== connectedAccountId
    ) {
      return target;
    }
    matchedTarget = true;
    return {
      ...target,
      platformSpecificData: {
        ...target.platformSpecificData,
        firstComment: payload.platformSpecificData?.firstComment,
      },
    };
  });
  if (!matchedTarget) {
    throw new Error("Zernio returned no matching platform target");
  }
  const providerPost = await updateZernioPost(
    spot.deliveryExternalId,
    providerPayload,
  );
  const status = providerPost.status ?? spot.deliveryStatus ?? "scheduled";
  const failed = ["failed", "partial", "cancelled"].includes(status);
  await db
    .update(platformPostTable)
    .set({
      firstCommentText: firstComment,
      firstCommentStatus:
        status === "published" ? "posted" : failed ? "failed" : "queued",
      firstCommentError: failed
        ? "Zernio did not accept the first comment update"
        : null,
      firstCommentUpdatedAt: new Date(),
      deliveryStatus: status,
      deliveryUpdatedAt: new Date(),
    })
    .where(eq(platformPostTable.id, spot.id));
  return {
    platformPostId: spot.id,
    providerPostId: providerPost._id ?? spot.deliveryExternalId,
    deliveryStatus: status,
    firstCommentStatus:
      status === "published" ? "posted" : failed ? "failed" : "queued",
  };
}

/** Save, approve, and hand the complete publishing unit to Zernio. */
export async function approveAndScheduleSocialPost(input: {
  platformPostId: string;
  scheduledAt: string;
}) {
  const scheduledAt = new Date(input.scheduledAt);
  if (
    Number.isNaN(scheduledAt.getTime()) ||
    scheduledAt.getTime() <= Date.now()
  ) {
    throw new Error("Choose a future publish time");
  }
  const { spot, channel, connectedAccountId, items, platform, story } =
    await loadSocialSpot(input.platformPostId);
  if (!story && spot.deliveryExternalId) {
    throw new Error("This post has already been handed to Zernio");
  }
  await requireActiveZernioAccount({
    channelId: channel.id,
    accountId: connectedAccountId,
    platform,
  });
  await Promise.all(
    items.map((item, index) =>
      db
        .update(platformPostTable)
        .set({
          channelId: channel.id,
          username: spot.username ?? channel.handle,
          scheduledAt: story
            ? sequenceScheduledAt(scheduledAt, index)
            : scheduledAt,
          status: "approved",
        })
        .where(eq(platformPostTable.id, item.id)),
    ),
  );
  return deliverSocialPost({
    platformPostId: spot.id,
    mode: "schedule",
    accountValidated: true,
  });
}

/** Move an existing provider job using its receipt as the payload source. */
export async function rescheduleQueuedSocialPost(input: {
  platformPostId: string;
  scheduledAt: string;
}) {
  const scheduledAt = new Date(input.scheduledAt);
  if (
    Number.isNaN(scheduledAt.getTime()) ||
    scheduledAt.getTime() <= Date.now()
  ) {
    throw new Error("Choose a future publish time");
  }
  const { spot, channel, connectedAccountId, items, platform, story } =
    await loadSocialSpot(input.platformPostId);
  if (spot.status === "published" || spot.deliveryStatus === "published") {
    throw new Error("This post is already published");
  }
  await requireActiveZernioAccount({
    channelId: channel.id,
    accountId: connectedAccountId,
    platform,
  });

  if (story) {
    if (items.some((item) => !item.deliveryExternalId)) {
      throw new Error("Retry the incomplete Story handoff before rescheduling");
    }
    const deliveries = [];
    for (const [index, item] of items.entries()) {
      const current = await getZernioPost(item.deliveryExternalId!);
      if (!current) {
        throw new Error(`Zernio no longer has Story frame ${index + 1}`);
      }
      const nextTime = sequenceScheduledAt(scheduledAt, index).toISOString();
      const updated = await updateZernioPost(
        item.deliveryExternalId!,
        buildZernioReschedulePayload(current, nextTime),
      );
      if (
        !updated.scheduledFor ||
        new Date(updated.scheduledFor).getTime() !==
          new Date(nextTime).getTime()
      ) {
        throw new Error(
          `Zernio did not confirm the new time for Story frame ${index + 1}`,
        );
      }
      deliveries.push(
        await persistDelivery(
          spot,
          [item.id],
          updated,
          connectedAccountId,
          platform,
          "scheduled",
          item.id,
        ),
      );
    }
    return {
      platformPostId: spot.id,
      scheduledAt: scheduledAt.toISOString(),
      deliveries,
    };
  }

  if (!spot.deliveryExternalId)
    throw new Error("This post is not in Zernio yet");
  const current = await getZernioPost(spot.deliveryExternalId);
  if (!current) throw new Error("The Zernio post no longer exists");
  const updated = await updateZernioPost(
    spot.deliveryExternalId,
    buildZernioReschedulePayload(current, scheduledAt.toISOString()),
  );
  if (
    !updated.scheduledFor ||
    new Date(updated.scheduledFor).getTime() !== scheduledAt.getTime()
  ) {
    throw new Error("Zernio did not confirm the new publish time");
  }
  return persistDelivery(
    spot,
    items.map((item) => item.id),
    updated,
    connectedAccountId,
    platform,
    "scheduled",
  );
}

export async function refreshSocialDelivery(platformPostId: string) {
  const { spot, connectedAccountId, items, platform, story } =
    await loadSocialSpot(platformPostId);
  if (story) {
    const refreshable = items.filter((item) => item.deliveryExternalId);
    if (!refreshable.length) {
      throw new Error("This Story sequence is not in Zernio yet");
    }
    const results = [];
    for (const item of refreshable) {
      const zernioPost = await getZernioPost(item.deliveryExternalId!);
      if (!zernioPost) {
        throw new Error(
          `Zernio no longer has Story frame ${(item.sequence ?? 0) + 1}`,
        );
      }
      results.push(
        await persistDelivery(
          spot,
          [item.id],
          zernioPost,
          connectedAccountId,
          platform,
          "unknown",
          item.id,
        ),
      );
    }
    return {
      deliveryStatus: results.some(
        (result) =>
          result.deliveryStatus === "failed" ||
          result.deliveryStatus === "partial",
      )
        ? "partial"
        : results.every((result) => result.deliveryStatus === "published")
          ? "published"
          : "scheduled",
      handedOffCount: refreshable.length,
      frameCount: items.length,
    };
  }
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

/** Signed webhooks are wake-up hints; the provider record remains canonical. */
export async function reconcileZernioPostDelivery(providerPostId: string) {
  const local = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.deliveryExternalId, providerPostId),
    columns: { id: true, parentPlatformPostId: true },
  });
  if (!local) return { matched: false as const };
  const rootPlatformPostId = local.parentPlatformPostId ?? local.id;
  const delivery = await refreshSocialDelivery(rootPlatformPostId);
  return { matched: true as const, rootPlatformPostId, delivery };
}

export async function retrySocialDelivery(platformPostId: string) {
  const { spot, channel, connectedAccountId, items, platform, story } =
    await loadSocialSpot(platformPostId);
  await requireActiveZernioAccount({
    channelId: channel.id,
    accountId: connectedAccountId,
    platform,
  });
  if (story) {
    const retryable = items.filter(
      (item) =>
        item.deliveryExternalId &&
        (item.deliveryStatus === "failed" || item.deliveryStatus === "partial"),
    );
    if (!retryable.length) {
      throw new Error("No failed Story frames are available to retry");
    }
    const results = [];
    for (const item of retryable) {
      const zernioPost = await retryZernioPost(item.deliveryExternalId!);
      results.push(
        await persistDelivery(
          spot,
          [item.id],
          zernioPost,
          connectedAccountId,
          platform,
          "publishing",
          item.id,
        ),
      );
    }
    return {
      deliveryStatus: "publishing",
      handedOffCount: items.filter((item) => item.deliveryExternalId).length,
      frameCount: items.length,
      retriedCount: results.length,
    };
  }
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
