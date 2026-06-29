import { eq } from "drizzle-orm";

import { db } from "../db";
import { archetypeForFormat, platformFormatsFor } from "../content/formats";
import {
  channelPlatformEnum,
  contentPostTable,
  type MediaItem,
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
};

/**
 * Create a content idea (the master `content_post`), optionally fanning it out
 * to a set of channel spots in one shot. This is the write behind "Add idea"
 * — and the same handler the chat's create tool will call.
 */
async function createIdea(input: CreateIdeaInput): Promise<{ id: string | undefined }> {
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
  if (id && input.platforms?.length) {
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
  const rows = [...new Set(platforms)].map((platform) => {
    const format = platformFormatsFor(
      platform as Parameters<typeof platformFormatsFor>[0],
    )[0]?.id;
    return {
      brandId,
      contentPostId,
      platform,
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
  await db.update(contentPostTable).set(patch).where(eq(contentPostTable.id, id));
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

export const ContentService = {
  createIdea,
  updateBrief,
  addSpots,
  setSpotText,
  setPoolMedia,
} as const;
