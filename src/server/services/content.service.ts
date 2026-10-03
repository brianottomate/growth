import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db, withTransaction } from "../db";
import {
  archetypeForFormat,
  getPlatformFormat,
  platformFormatsFor,
} from "../content/formats";
import {
  platformTextLength,
  threadFormatForPlatform,
} from "@/lib/platform-thread";
import { isStoryFormat, sequenceScheduledAt } from "@/lib/platform-sequence";
import { firstCommentDraftPatch, firstCommentLimit } from "@/lib/first-comment";
import {
  serializePlatformPostDocument,
  writePlatformPostDocument,
  type PlatformPostDocument,
} from "@/lib/platform-post-document";
import {
  type channelPlatformEnum,
  channelTable,
  type DeliveryProvider,
  contentPostTable,
  type MediaItem,
  messageSendTable,
  platformPostLinkTable,
  platformPostTable,
} from "../db/schema";

/**
 * Content domain logic — the transport-agnostic core. oRPC procedures call
 * these now; the /overview chat capabilities will call the SAME functions next
 * (and an MCP / oRPC layer later) so the UI and the chat never drift.
 *
 * Auth lives at the edge (the procedure / capability resolves the brand's org
 * and asserts membership); these functions are pure data logic — they assume
 * the caller is already authorized.
 */

type ChannelPlatform = (typeof channelPlatformEnum.enumValues)[number];

export type CreatePlatformPostInput = {
  brandId: string;
  platform: ChannelPlatform;
  ownerId: string;
  text?: string | null;
  title?: string | null;
  pillar?: string | null;
  scheduledAt?: string | null;
  format?: string | null;
  referencePlatformPostId?: string | null;
};

/**
 * Start with one concrete channel draft. This intentionally creates NO
 * content_post: the operator can write and schedule something native first,
 * then promote it only if it earns a wider life.
 */
async function createPlatformPost(input: CreatePlatformPostInput): Promise<{
  id: string | undefined;
}> {
  const channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, input.brandId),
      eq(channelTable.platform, input.platform),
      isNull(channelTable.deletedAt),
    ),
  });
  const format =
    input.format ?? platformFormatsFor(input.platform)[0]?.id ?? undefined;
  const [row] = await db
    .insert(platformPostTable)
    .values({
      brandId: input.brandId,
      channelId: channel?.id,
      platform: input.platform,
      username: channel?.handle,
      format,
      archetype: format ? archetypeForFormat(format) : undefined,
      pillar: input.pillar ?? undefined,
      source: "owned",
      status: "draft",
      origin: "human",
      ownerId: input.ownerId,
      text: input.text ?? undefined,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      metadata: {
        platformFirst: true,
        ...(input.title ? { workingTitle: input.title } : {}),
        ...(input.referencePlatformPostId
          ? { referencePlatformPostId: input.referencePlatformPostId }
          : {}),
      },
    })
    .returning({ id: platformPostTable.id });

  if (row?.id && input.referencePlatformPostId) {
    await db.insert(platformPostLinkTable).values({
      fromPlatformPostId: row.id,
      toPlatformPostId: input.referencePlatformPostId,
      kind: "repurposes",
      metadata: { source: "platform-first" },
    });
  }
  return { id: row?.id };
}

export type PromotePlatformPostInput = {
  platformPostId: string;
  title?: string | null;
  pillar?: string | null;
  seriesId?: string | null;
  crossPostPlatforms?: ChannelPlatform[];
  ownerId: string;
  createdById: string;
};

const fallbackTitle = (text?: string | null) => {
  const first = text
    ?.split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return "Untitled content idea";
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
};

/** Promote one useful platform draft/history item into the canonical layer. */
async function promotePlatformPost(
  input: PromotePlatformPostInput,
): Promise<{ id: string; platformPostId: string; alreadyPromoted: boolean }> {
  const post = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
  });
  if (!post) throw new Error("Platform post not found");
  if (post.contentPostId) {
    return {
      id: post.contentPostId,
      platformPostId: post.id,
      alreadyPromoted: true,
    };
  }
  const metadata = (post.metadata ?? {}) as { workingTitle?: string };
  const [content] = await db
    .insert(contentPostTable)
    .values({
      brandId: post.brandId,
      title:
        input.title?.trim() ||
        metadata.workingTitle ||
        fallbackTitle(post.text),
      pillar: input.pillar ?? post.pillar ?? undefined,
      seriesId: input.seriesId ?? undefined,
      plannedAt: post.scheduledAt,
      hook: post.text
        ?.split("\n")
        .map((line) => line.trim())
        .find(Boolean),
      ownerId: post.ownerId ?? input.ownerId,
      createdById: input.createdById,
      status: post.status,
      origin: "human",
    })
    .returning({ id: contentPostTable.id });
  if (!content) throw new Error("Could not promote platform post");

  await db
    .update(platformPostTable)
    .set({
      contentPostId: content.id,
      pillar: input.pillar ?? post.pillar,
      metadata: {
        ...metadata,
        platformFirst: true,
        promotedAt: new Date().toISOString(),
      },
    })
    .where(eq(platformPostTable.id, post.id));

  const extraPlatforms = (input.crossPostPlatforms ?? []).filter(
    (platform) => platform !== post.platform,
  );
  if (extraPlatforms.length) {
    await addSpots(content.id, post.brandId, extraPlatforms);
  }
  return {
    id: content.id,
    platformPostId: post.id,
    alreadyPromoted: false,
  };
}

export type CreateIdeaInput = {
  brandId: string;
  title: string;
  ownerId: string;
  createdById: string;
  pillar?: string | null;
  seriesId?: string | null;
  plannedAt?: string | null; // ISO 8601
  // ---- editorial brief (written once at the idea level) ----
  hook?: string | null;
  captionDirection?: string | null;
  visualDirection?: string | null;
  ctaText?: string | null;
  ctaKeyword?: string | null;
  kpi?: string | null;
  // Channels to fan this idea out to immediately, as owned spots at the
  // platform's primary format. The cross-post manifest, materialized eagerly.
  platforms?: ChannelPlatform[];
  // Concrete spots when the content type matters beyond the surface default
  // (for example newsletter.blast vs the recurring newsletter issue).
  spots?: { platform: ChannelPlatform; format?: string | null }[];
};

/**
 * Create a content idea (the master `content_post`), optionally fanning it out
 * to a set of channel spots in one shot. This is the write behind "Add idea"
 * — and the same handler the chat's create tool will call.
 */
async function createIdea(
  input: CreateIdeaInput,
): Promise<{ id: string | undefined }> {
  const [row] = await db
    .insert(contentPostTable)
    .values({
      brandId: input.brandId,
      title: input.title,
      pillar: input.pillar ?? undefined,
      seriesId: input.seriesId ?? undefined,
      plannedAt: input.plannedAt ? new Date(input.plannedAt) : undefined,
      hook: input.hook ?? undefined,
      captionDirection: input.captionDirection ?? undefined,
      visualDirection: input.visualDirection ?? undefined,
      ctaText: input.ctaText ?? undefined,
      ctaKeyword: input.ctaKeyword ?? undefined,
      kpi: input.kpi ?? undefined,
      ownerId: input.ownerId,
      createdById: input.createdById,
      status: "draft",
      origin: "human",
    })
    .returning({ id: contentPostTable.id });

  const id = row?.id;
  if (id && input.spots?.length) {
    await addSpotTargets(id, input.brandId, input.spots);
  } else if (id && input.platforms?.length) {
    await addSpots(id, input.brandId, input.platforms);
  }
  return { id };
}

/** Fan an idea out to channel spots at each platform's primary format. */
async function addSpots(
  contentPostId: string,
  brandId: string,
  platforms: ChannelPlatform[],
): Promise<void> {
  await addSpotTargets(
    contentPostId,
    brandId,
    [...new Set(platforms)].map((platform) => ({ platform })),
  );
}

/** Fan an idea out with an explicit concrete format where needed. */
async function addSpotTargets(
  contentPostId: string,
  brandId: string,
  spots: { platform: ChannelPlatform; format?: string | null }[],
): Promise<void> {
  const seen = new Set<string>();
  const rows = spots.flatMap((spot) => {
    const format =
      spot.format ?? platformFormatsFor(spot.platform)[0]?.id ?? undefined;
    const key = `${spot.platform}|${format ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return {
      brandId,
      contentPostId,
      platform: spot.platform,
      format,
      archetype: format ? archetypeForFormat(format) : undefined,
      source: "owned" as const,
      status: "draft" as const,
      origin: "human" as const,
    };
  });
  if (rows.length) await db.insert(platformPostTable).values(rows);
}

export type UpdateBriefInput = {
  id: string;
  title?: string;
  hook?: string | null;
  captionDirection?: string | null;
  visualDirection?: string | null;
  ctaText?: string | null;
  ctaKeyword?: string | null;
  kpi?: string | null;
  pillar?: string | null;
  seriesId?: string | null;
  plannedAt?: string | null; // ISO 8601
};

/** Partial edit of the idea-level brief — only provided keys are written. */
async function updateBrief(input: UpdateBriefInput): Promise<{ id: string }> {
  const { id, plannedAt, ...rest } = input;
  const patch: Record<string, unknown> = { ...rest };
  if (plannedAt !== undefined) {
    patch.plannedAt = plannedAt ? new Date(plannedAt) : null;
  }
  await db
    .update(contentPostTable)
    .set(patch)
    .where(eq(contentPostTable.id, id));
  return { id };
}

export type SaveSpotThreadItemInput = {
  id?: string;
  text: string | null;
  textDocument?: PlatformPostDocument;
  media: MediaItem[];
  assetLinks: string[];
};

export type SaveSpotThreadInput = {
  rootPlatformPostId: string;
  expectedUpdatedAt: string;
  items: SaveSpotThreadItemInput[];
  firstComment?: string | null;
};

const cleanThreadItem = (item: SaveSpotThreadItemInput) => {
  const seenMedia = new Set<string>();
  const media = item.media.filter((mediaItem) => {
    const key = mediaItem.assetId ?? mediaItem.url;
    if (seenMedia.has(key)) return false;
    seenMedia.add(key);
    return true;
  });
  return {
    text: item.text?.trim() || null,
    textDocument: item.textDocument,
    media: media.length ? media : null,
    assetLinks: [
      ...new Set(item.assetLinks.map((link) => link.trim()).filter(Boolean)),
    ],
  };
};

/**
 * Save one platform publishing unit. X and Threads may contain ordered reply
 * rows, but they remain one channel rendering under the canonical content item.
 * Every reply points to the root; `sequence` carries the native publish order.
 */
async function saveSpotThread(
  input: SaveSpotThreadInput,
): Promise<{ id: string; updatedAt: Date; itemIds: string[] } | null> {
  if (input.items.length === 0) {
    throw new Error("A platform post needs at least one item.");
  }

  return withTransaction(async (tx) => {
    const [root] = await tx
      .select()
      .from(platformPostTable)
      .where(eq(platformPostTable.id, input.rootPlatformPostId))
      .limit(1);
    if (!root || root.parentPlatformPostId) {
      throw new Error("Thread editing must start from the root platform post.");
    }
    const firstComment =
      input.firstComment === undefined
        ? undefined
        : input.firstComment?.trim() || null;
    const firstCommentMax = firstCommentLimit(root.platform, root.format);
    if (firstComment && firstCommentMax === null) {
      throw new Error("This platform format does not support a first comment.");
    }
    if (firstComment && firstComment.length > firstCommentMax!) {
      throw new Error(
        `First comments can contain at most ${firstCommentMax} characters.`,
      );
    }
    if (
      input.firstComment !== undefined &&
      root.deliveryExternalId &&
      root.firstCommentText &&
      !firstComment
    ) {
      throw new Error(
        "Removing a first comment from an existing Zernio job needs an approved provider update.",
      );
    }
    const formatDefinition = root.format
      ? getPlatformFormat(root.format)
      : undefined;
    const isStory = formatDefinition?.archetype === "story";
    const supportsSequence =
      formatDefinition?.sequence === true ||
      root.platform === "x" ||
      root.platform === "threads";
    if (input.items.length > 1 && !supportsSequence) {
      throw new Error(
        "This platform format does not support an ordered sequence.",
      );
    }
    if (
      isStory &&
      input.items.some(
        (item) =>
          item.media.length !== 1 ||
          !["image", "video"].includes(item.media[0]?.type ?? ""),
      )
    ) {
      throw new Error("Every Story frame needs exactly one image or video.");
    }

    const characterLimit =
      root.platform === "x" ? 280 : root.platform === "threads" ? 500 : null;
    if (
      characterLimit &&
      input.items.some(
        (item) =>
          platformTextLength(item.text ?? "", root.platform) > characterLimit,
      )
    ) {
      throw new Error(
        `${root.platform === "x" ? "X" : "Threads"} posts must be ${characterLimit} characters or fewer.`,
      );
    }
    for (const item of input.items) {
      if (
        item.textDocument &&
        serializePlatformPostDocument(item.textDocument, root.platform) !==
          (item.text ?? "").replace(/\r\n?/g, "\n").trim()
      ) {
        throw new Error(
          "The structured editor document does not match the platform copy.",
        );
      }
    }

    const existingChildren = await tx
      .select()
      .from(platformPostTable)
      .where(
        eq(platformPostTable.parentPlatformPostId, input.rootPlatformPostId),
      );
    const existingById = new Map(
      existingChildren.map((child) => [child.id, child]),
    );
    for (const item of input.items.slice(1)) {
      if (item.id && !existingById.has(item.id)) {
        throw new Error("A thread reply does not belong to this root post.");
      }
    }

    const now = new Date();
    const rootItem = cleanThreadItem(input.items[0]!);
    const threadFormat = isStory
      ? { format: root.format ?? undefined, archetype: "story" }
      : threadFormatForPlatform(root.platform, input.items.length);
    const firstCommentPatch = firstCommentDraftPatch(
      root.firstCommentText,
      input.firstComment,
      now,
    );
    const [savedRoot] = await tx
      .update(platformPostTable)
      .set({
        text: rootItem.text,
        metadata: rootItem.textDocument
          ? writePlatformPostDocument(root.metadata, rootItem.textDocument)
          : root.metadata,
        media: rootItem.media,
        assetLinks: rootItem.assetLinks.length ? rootItem.assetLinks : null,
        ...threadFormat,
        ...firstCommentPatch,
        parentPlatformPostId: null,
        sequence: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(platformPostTable.id, input.rootPlatformPostId),
          eq(platformPostTable.updatedAt, new Date(input.expectedUpdatedAt)),
        ),
      )
      .returning({
        id: platformPostTable.id,
        updatedAt: platformPostTable.updatedAt,
      });
    if (!savedRoot) return null;

    const keptChildIds: string[] = [];
    for (const [index, inputItem] of input.items.slice(1).entries()) {
      const item = cleanThreadItem(inputItem);
      const existing = inputItem.id
        ? existingById.get(inputItem.id)
        : undefined;
      if (existing) {
        const [saved] = await tx
          .update(platformPostTable)
          .set({
            text: item.text,
            media: item.media,
            assetLinks: item.assetLinks.length ? item.assetLinks : null,
            metadata: item.textDocument
              ? writePlatformPostDocument(existing.metadata, item.textDocument)
              : existing.metadata,
            format: threadFormat.format,
            archetype: threadFormat.archetype,
            sequence: index + 1,
            updatedAt: now,
          })
          .where(eq(platformPostTable.id, existing.id))
          .returning({ id: platformPostTable.id });
        if (saved) keptChildIds.push(saved.id);
        continue;
      }

      const [created] = await tx
        .insert(platformPostTable)
        .values({
          brandId: root.brandId,
          contentPostId: root.contentPostId,
          channelId: root.channelId,
          platform: root.platform,
          username: root.username,
          format: threadFormat.format,
          archetype: threadFormat.archetype,
          template: root.template,
          pillar: root.pillar,
          parentPlatformPostId: root.id,
          sequence: index + 1,
          source: root.source,
          status: root.status,
          origin: root.origin,
          ownerId: root.ownerId,
          provider: root.provider,
          text: item.text,
          media: item.media,
          assetLinks: item.assetLinks.length ? item.assetLinks : null,
          scheduledAt: root.scheduledAt,
          isSeed: root.isSeed,
          metadata: item.textDocument
            ? writePlatformPostDocument(
                {
                  ...(typeof root.metadata === "object" && root.metadata
                    ? root.metadata
                    : {}),
                  sequenceRootPlatformPostId: root.id,
                },
                item.textDocument,
              )
            : {
                ...(typeof root.metadata === "object" && root.metadata
                  ? root.metadata
                  : {}),
                sequenceRootPlatformPostId: root.id,
              },
        })
        .returning({ id: platformPostTable.id });
      if (created) keptChildIds.push(created.id);
    }

    const removedIds = existingChildren
      .map((child) => child.id)
      .filter((id) => !keptChildIds.includes(id));
    if (removedIds.length) {
      await tx
        .delete(platformPostTable)
        .where(inArray(platformPostTable.id, removedIds));
    }

    return {
      id: savedRoot.id,
      updatedAt: savedRoot.updatedAt,
      itemIds: [savedRoot.id, ...keptChildIds],
    };
  });
}

type ContentStatus = (typeof contentPostTable.$inferSelect)["status"];

/**
 * Move one platform publishing unit, the root and its ordered children, as a
 * whole. Children are real provider jobs, so Story frames get deterministic
 * one-minute schedule offsets while staying on the root's calendar day.
 * A published row keeps a ship time it already has; otherwise it takes the
 * given schedule, or the earlier of its saved schedule and now.
 */
async function setPublishingUnit(input: {
  rootPlatformPostId: string;
  status?: ContentStatus;
  scheduledAt?: string | null;
}): Promise<{ id: string }> {
  return withTransaction(async (tx) => {
    const now = new Date();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const rows = await tx
      .select({
        id: platformPostTable.id,
        sequence: platformPostTable.sequence,
        format: platformPostTable.format,
        scheduledAt: platformPostTable.scheduledAt,
        publishedAt: platformPostTable.publishedAt,
      })
      .from(platformPostTable)
      .where(
        or(
          eq(platformPostTable.id, input.rootPlatformPostId),
          eq(platformPostTable.parentPlatformPostId, input.rootPlatformPostId),
        ),
      );
    for (const row of rows) {
      const patch: Partial<typeof platformPostTable.$inferInsert> = {};
      let itemSchedule = row.scheduledAt;
      if (input.scheduledAt !== undefined) {
        itemSchedule = scheduledAt
          ? isStoryFormat(row.format)
            ? sequenceScheduledAt(scheduledAt, row.sequence ?? 0)
            : scheduledAt
          : null;
        patch.scheduledAt = itemSchedule;
      }
      if (input.status !== undefined) patch.status = input.status;
      if (input.status === "published" && !row.publishedAt) {
        patch.publishedAt =
          input.scheduledAt !== undefined
            ? (itemSchedule ?? now)
            : itemSchedule && itemSchedule < now
              ? itemSchedule
              : now;
      }
      if (!Object.keys(patch).length) continue;
      await tx
        .update(platformPostTable)
        .set(patch)
        .where(eq(platformPostTable.id, row.id));
    }
    return { id: input.rootPlatformPostId };
  });
}

/**
 * Record a publish that happened outside Wander Growth — posted by hand in the
 * app, sent straight from Customer.io. No provider job exists to send a receipt
 * back, so this writes the receipt: every owned spot in the unit goes
 * `published` with a real ship time, and the idea follows once nothing owned
 * under it is still unshipped.
 *
 * Idea status alone is not enough. The calendar, the Feed and the pipeline
 * counts all read `platform_post.status`, so an idea marked published over
 * draft spots reads as "still a draft" everywhere the team actually looks.
 *
 * This writes no `message_send` row: the send ledger records sends WE made.
 */
async function recordExternalPublish(input: {
  platformPostIds: string[];
  publishedAt: Date;
  /** How it actually shipped — natively in the app by default. */
  provider?: DeliveryProvider;
  externalUrl?: string | null;
}): Promise<{
  platformPostIds: string[];
  contentPostIds: string[];
  liveProviderJobs: string[];
}> {
  return withTransaction(async (tx) => {
    const units = await tx
      .select({
        id: platformPostTable.id,
        contentPostId: platformPostTable.contentPostId,
        publishedAt: platformPostTable.publishedAt,
        provider: platformPostTable.provider,
        externalUrl: platformPostTable.externalUrl,
        deliveryExternalId: platformPostTable.deliveryExternalId,
        deliveryStatus: platformPostTable.deliveryStatus,
      })
      .from(platformPostTable)
      .where(
        and(
          eq(platformPostTable.source, "owned"),
          or(
            inArray(platformPostTable.id, input.platformPostIds),
            inArray(
              platformPostTable.parentPlatformPostId,
              input.platformPostIds,
            ),
          ),
        ),
      );

    // A queued provider job is the provider's to finish. Marking it published
    // here would leave Zernio holding a job nobody believes in any more.
    const liveProviderJobs = units
      .filter(
        (row) =>
          row.deliveryExternalId &&
          row.deliveryStatus !== "published" &&
          row.deliveryStatus !== "failed",
      )
      .map((row) => row.id);
    const shippable = units.filter((row) => !liveProviderJobs.includes(row.id));

    for (const row of shippable) {
      await tx
        .update(platformPostTable)
        .set({
          status: "published" as const,
          publishedAt: row.publishedAt ?? input.publishedAt,
          provider: row.provider ?? input.provider ?? "native",
          ...(input.externalUrl && !row.externalUrl
            ? { externalUrl: input.externalUrl }
            : {}),
        })
        .where(eq(platformPostTable.id, row.id));
    }

    // Roll each touched idea up, but only when every owned spot under it has
    // shipped or been taken off the board — a piece with one channel still to
    // go is not published.
    const contentPostIds = [
      ...new Set(
        shippable.flatMap((row) =>
          row.contentPostId ? [row.contentPostId] : [],
        ),
      ),
    ];
    const rolledUp: string[] = [];
    for (const contentPostId of contentPostIds) {
      const siblings = await tx
        .select({ status: platformPostTable.status })
        .from(platformPostTable)
        .where(
          and(
            eq(platformPostTable.contentPostId, contentPostId),
            eq(platformPostTable.source, "owned"),
          ),
        );
      const pending = siblings.filter(
        (sibling) =>
          !["published", "rejected", "archived"].includes(sibling.status),
      );
      if (pending.length) continue;
      await tx
        .update(contentPostTable)
        .set({ status: "published" as const })
        .where(eq(contentPostTable.id, contentPostId));
      rolledUp.push(contentPostId);
    }

    return {
      platformPostIds: shippable.map((row) => row.id),
      contentPostIds: rolledUp,
      liveProviderJobs,
    };
  });
}

/** Set the content-level media pool (`content_post.media`). Deduped by assetId
 *  — the same dedupe the spot attach-list uses. */
async function setPoolMedia(input: {
  contentPostId: string;
  media: MediaItem[];
}): Promise<{ id: string }> {
  const seen = new Set<string>();
  const deduped = input.media.filter((m) => {
    if (!m.assetId) return true;
    if (seen.has(m.assetId)) return false;
    seen.add(m.assetId);
    return true;
  });
  await db
    .update(contentPostTable)
    .set({ media: deduped.length ? deduped : null })
    .where(eq(contentPostTable.id, input.contentPostId));
  return { id: input.contentPostId };
}

async function setSpotMedia(input: {
  platformPostId: string;
  media: MediaItem[];
}): Promise<{ id: string }> {
  const seen = new Set<string>();
  const deduped = input.media.filter((item) => {
    const key = item.assetId ?? item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await db
    .update(platformPostTable)
    .set({ media: deduped.length ? deduped : null })
    .where(eq(platformPostTable.id, input.platformPostId));
  return { id: input.platformPostId };
}

async function setSpotCarousel(input: {
  platformPostId: string;
  format: string;
  media: MediaItem[];
}): Promise<{ id: string }> {
  const seen = new Set<string>();
  const deduped = input.media.filter((item) => {
    const key = item.assetId ?? item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await db
    .update(platformPostTable)
    .set({
      format: input.format,
      archetype: "carousel",
      media: deduped.length ? deduped : null,
    })
    .where(eq(platformPostTable.id, input.platformPostId));
  return { id: input.platformPostId };
}

/** Edit one owned draft. Status and schedule move its whole publishing unit. */
async function updatePlatformDraft(input: {
  platformPostId: string;
  text?: string | null;
  status?: ContentStatus;
  scheduledAt?: string | null;
  /** Re-point a spot at a different product on the same platform (image -> reel). */
  format?: string | null;
}): Promise<{ id: string }> {
  const current = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
    columns: { id: true, parentPlatformPostId: true },
  });
  if (!current) throw new Error("Platform post not found");
  const patch: Record<string, unknown> = {};
  if (input.text !== undefined) patch.text = input.text?.trim() || null;
  if (input.format !== undefined) {
    patch.format = input.format;
    // archetype is derived from format everywhere else it is set; leaving the
    // old one behind would describe the spot as a still after it became a reel.
    patch.archetype = input.format ? archetypeForFormat(input.format) : null;
  }
  if (Object.keys(patch).length) {
    await db
      .update(platformPostTable)
      .set(patch)
      .where(eq(platformPostTable.id, current.id));
  }
  if (input.status !== undefined || input.scheduledAt !== undefined) {
    await setPublishingUnit({
      rootPlatformPostId: current.parentPlatformPostId ?? current.id,
      status: input.status,
      scheduledAt: input.scheduledAt,
    });
  }
  return { id: current.id };
}

async function setContentStatus(input: {
  contentPostId: string;
  status: ContentStatus;
}): Promise<{ id: string }> {
  await db
    .update(contentPostTable)
    .set({ status: input.status })
    .where(eq(contentPostTable.id, input.contentPostId));
  return { id: input.contentPostId };
}

/**
 * Why these spots cannot be hard-deleted, or null when they can.
 *
 * A delivered email is ledger. `message_send` references `platform_post` with no
 * ON DELETE, so Postgres refuses the delete anyway; this exists so each edge can
 * raise its own error type with a readable sentence instead of surfacing a
 * constraint violation.
 */
export async function deliveryBlockReason(platformPostIds: string[]) {
  if (!platformPostIds.length) return null;
  const sends = await db.query.messageSendTable.findMany({
    where: inArray(messageSendTable.platformPostId, platformPostIds),
    columns: { id: true },
  });
  if (!sends.length) return null;
  return `This has ${sends.length} delivery record${sends.length === 1 ? "" : "s"} against it. A sent message stays in the send ledger; archive it instead of deleting.`;
}

/**
 * Hard-delete one spot, plus the parent idea when that spot was the last thing
 * rendered under it. Otherwise deleting a draft would leave a titled shell still
 * counting toward the pipeline. The spot's email document goes with it (CASCADE).
 */
async function purgeSpot(input: { platformPostId: string }) {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
    columns: { id: true, platform: true, contentPostId: true },
  });
  if (!spot) throw new Error("That draft no longer exists.");

  await db.delete(platformPostTable).where(eq(platformPostTable.id, spot.id));

  let ideaDeleted: string | null = null;
  if (spot.contentPostId) {
    const remaining = await db.query.platformPostTable.findMany({
      where: eq(platformPostTable.contentPostId, spot.contentPostId),
      columns: { id: true },
    });
    if (!remaining.length) {
      await db
        .delete(contentPostTable)
        .where(eq(contentPostTable.id, spot.contentPostId));
      ideaDeleted = spot.contentPostId;
    }
  }
  return { id: spot.id, platform: spot.platform, ideaDeleted };
}

/**
 * Hard-delete one idea and the owned spots under it. Scraped spots are
 * historical record rather than editable plan, so they survive and detach
 * (`platform_post.content_post_id` is SET NULL), which keeps a purge from
 * rewriting what a brand actually published.
 */
async function purgeIdea(input: { contentPostId: string }) {
  const idea = await db.query.contentPostTable.findFirst({
    where: eq(contentPostTable.id, input.contentPostId),
    columns: { id: true, title: true },
  });
  if (!idea) throw new Error("That content idea no longer exists.");

  const spots = await db.query.platformPostTable.findMany({
    where: eq(platformPostTable.contentPostId, idea.id),
    columns: { id: true, source: true },
  });
  const owned = spots.filter((spot) => spot.source === "owned");
  if (owned.length) {
    await db.delete(platformPostTable).where(
      inArray(
        platformPostTable.id,
        owned.map((spot) => spot.id),
      ),
    );
  }
  await db.delete(contentPostTable).where(eq(contentPostTable.id, idea.id));

  return {
    id: idea.id,
    title: idea.title,
    spotsDeleted: owned.length,
    scrapedDetached: spots.length - owned.length,
  };
}

export const ContentService = {
  createIdea,
  createPlatformPost,
  promotePlatformPost,
  updateBrief,
  addSpots,
  addSpotTargets,
  saveSpotThread,
  setPublishingUnit,
  recordExternalPublish,
  setPoolMedia,
  setSpotMedia,
  setSpotCarousel,
  updatePlatformDraft,
  setContentStatus,
  purgeSpot,
  purgeIdea,
} as const;
