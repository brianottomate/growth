import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db";
import { archetypeForFormat, platformFormatsFor } from "../content/formats";
import {
  type channelPlatformEnum,
  channelTable,
  contentPostTable,
  type MediaItem,
  platformPostLinkTable,
  platformPostTable,
} from "../db/schema";

/**
 * Content domain logic — the transport-agnostic core. tRPC procedures call
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

/** Set the concrete, platform-specific caption for one spot (`platform_post.text`).
 *  Distinct from the idea-level `captionDirection` brief — this is the real copy
 *  that ships. The same handler the chat's setSpotText tool will call. */
async function setSpotText(input: {
  platformPostId: string;
  text: string | null;
}): Promise<{ id: string }> {
  await db
    .update(platformPostTable)
    .set({ text: input.text })
    .where(eq(platformPostTable.id, input.platformPostId));
  return { id: input.platformPostId };
}

export type SaveSpotEditorInput = {
  platformPostId: string;
  expectedUpdatedAt: string;
  text: string | null;
  media: MediaItem[];
  assetLinks: string[];
};

/**
 * Save every manual platform-post field atomically. This is deliberately
 * separate from the small chat-facing mutations: the dialog is an explicit
 * editing session and must not partially land or overwrite a newer chat edit.
 */
async function saveSpotEditor(
  input: SaveSpotEditorInput,
): Promise<{ id: string; updatedAt: Date } | null> {
  const seenMedia = new Set<string>();
  const media = input.media.filter((item) => {
    const key = item.assetId ?? item.url;
    if (seenMedia.has(key)) return false;
    seenMedia.add(key);
    return true;
  });
  const assetLinks = [
    ...new Set(input.assetLinks.map((link) => link.trim()).filter(Boolean)),
  ];
  const [row] = await db
    .update(platformPostTable)
    .set({
      text: input.text?.trim() || null,
      media: media.length ? media : null,
      assetLinks: assetLinks.length ? assetLinks : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(platformPostTable.id, input.platformPostId),
        eq(platformPostTable.updatedAt, new Date(input.expectedUpdatedAt)),
      ),
    )
    .returning({
      id: platformPostTable.id,
      updatedAt: platformPostTable.updatedAt,
    });
  return row ?? null;
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

async function updatePlatformDraft(input: {
  platformPostId: string;
  text?: string | null;
  status?: (typeof contentPostTable.$inferSelect)["status"];
  scheduledAt?: string | null;
  markScheduled?: boolean;
}): Promise<{ id: string }> {
  const current = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
    columns: { publishedAt: true, scheduledAt: true },
  });
  const patch: Record<string, unknown> = {};
  if (input.text !== undefined) patch.text = input.text?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.scheduledAt !== undefined) {
    patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  }
  if (input.markScheduled && input.scheduledAt) patch.status = "scheduled";
  if (input.status === "published" && !current?.publishedAt) {
    patch.publishedAt =
      input.scheduledAt !== undefined
        ? input.scheduledAt
          ? new Date(input.scheduledAt)
          : new Date()
        : (current?.scheduledAt ?? new Date());
  }
  await db
    .update(platformPostTable)
    .set(patch)
    .where(eq(platformPostTable.id, input.platformPostId));
  return { id: input.platformPostId };
}

async function setContentStatus(input: {
  contentPostId: string;
  status: (typeof contentPostTable.$inferSelect)["status"];
}): Promise<{ id: string }> {
  await db
    .update(contentPostTable)
    .set({ status: input.status })
    .where(eq(contentPostTable.id, input.contentPostId));
  return { id: input.contentPostId };
}

export const ContentService = {
  createIdea,
  createPlatformPost,
  promotePlatformPost,
  updateBrief,
  addSpots,
  addSpotTargets,
  setSpotText,
  saveSpotEditor,
  setPoolMedia,
  setSpotMedia,
  setSpotCarousel,
  updatePlatformDraft,
  setContentStatus,
} as const;
