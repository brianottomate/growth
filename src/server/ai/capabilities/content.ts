import {
  getContentWorkItemOutputSchema,
  searchContentWorkItemsOutputSchema,
  updateContentWorkItemOutputSchema,
  setPlatformPostFirstCommentOutputSchema,
  setPlatformPostThreadOutputSchema,
  addContentCrossPostOutputSchema,
  attachChatImageToContentOutputSchema,
  makeCarouselFromPoolOutputSchema,
  prepareContentMediaUploadsOutputSchema,
  finishContentMediaUploadsOutputSchema,
  importRemoteImagesToContentOutputSchema,
  suggestMediaForContentOutputSchema,
  attachLibraryMediaToContentOutputSchema,
  freezeCompositionToLibraryOutputSchema,
  recoverArchiveMediaToContentOutputSchema,
  contentPipelineSummaryOutputSchema,
  upcomingContentOutputSchema,
  productionQueueOutputSchema,
  createIdeaOutputSchema,
  createPlatformPostOutputSchema,
  publishBlogDraftOutputSchema,
  promotePlatformPostOutputSchema,
  deleteContentWorkItemOutputSchema,
} from "./outputs/content";
import "server-only";

import { z } from "zod";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/server/db";
import {
  contentPostTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/content-schema";
import {
  assistantMessageTable,
  brandTable,
  channelPlatformEnum,
  contentStatusEnum,
  mediaAssetTable,
} from "@/server/db/schema";
import { publishBlogDraft as publishBlogDraftToDato } from "@/server/services/blog-publish.service";
import {
  ContentService,
  deliveryBlockReason,
} from "@/server/services/content.service";
import { saveSocialFirstComment } from "@/server/services/content-publishing.service";
import { MediaService } from "@/server/services/media.service";
import { analyzeStoredMediaAsset } from "@/server/services/media-asset-analysis.service";
import {
  findLatestOwnedChatImages,
  type ChatImageReference,
} from "@/lib/chat-attachment";
import { getContentReadiness } from "@/lib/content-readiness";
import {
  compositionFormatIdSchema,
  compositionSpecSchema,
  freezeCompositionSchema,
} from "@/lib/compositions";
import {
  directComposition,
  extendCompositionSource,
} from "@/server/services/composition-direct.service";
import {
  classifyFormatFromFields,
  platformFormatsFor,
  validateSpot,
} from "@/server/content/formats";
import { groupPlatformThreads } from "@/lib/platform-thread";
import { freezeComposition } from "@/server/services/composition.service";
import {
  writeCompositionCopy,
  writeCompositionCopySchema,
} from "@/server/services/composition-copy.service";
import { growthAction, GrowthActionError } from "./types";
import type { CapabilityContext } from "./types";
import { orgBrandIds } from "./brands";

const contentStatus = z.enum(contentStatusEnum.enumValues);

/** A spot in one of these is not waiting to ship. */
const SHIPPED_OR_OFF_THE_BOARD = ["published", "rejected", "archived"];

async function requireContentWorkItem(
  contentPostId: string,
  ctx: CapabilityContext,
) {
  const content = await db.query.contentPostTable.findFirst({
    where: and(
      eq(contentPostTable.id, contentPostId),
      isNull(contentPostTable.deletedAt),
    ),
    with: {
      brand: true,
      platformPosts: { with: { channel: true } },
      series: true,
    },
  });
  if (!content || content.brand?.organizationId !== ctx.orgId) {
    throw new Error(
      "That content work item is not available in this organization.",
    );
  }
  return content;
}

/**
 * A guard rejecting a caller-supplied platformPostId leaves the same question
 * unanswered if it only says no: which ids WOULD have worked. Three actions
 * reject ids this way (edit a draft, thread a root, build a carousel), so they
 * answer it the same way and grade the same.
 *
 * This is `invalid_input`, not a dead end. The failure that prompted it was a
 * model that had promised the operator a TikTok spot the work item never had,
 * then edited the id it wished existed; a bare rejection graded `tool_failed`,
 * which told it to stop, so it abandoned the edit and went to scheduling.
 */
function rejectUnusableDraft(input: {
  rejectedId: string;
  eligible: { id: string; platform: string }[];
  eligibleLabel: string;
  hint: string;
}) {
  const { rejectedId, eligible, eligibleLabel, hint } = input;
  const inventory = eligible.length
    ? `This work item's ${eligibleLabel}: ${eligible
        .map((post) => `${post.id} (${post.platform})`)
        .join(", ")}.`
    : `This work item has no ${eligibleLabel}.`;
  return new GrowthActionError(
    "invalid_input",
    `Platform draft ${rejectedId} is not usable here. ${inventory} ${hint}`,
  );
}

const ADD_A_SPOT_HINT =
  "To post on a platform this work item has no spot for, add one with contentWrite.createPlatformPost or contentWrite.addCrossPost rather than editing a draft that does not exist.";

export const getContentWorkItem = growthAction({
  outputSchema: getContentWorkItemOutputSchema,
  description:
    "Read one canonical content work item with its brief, media pool, platform drafts, local schedule, provider receipt/status, connection readiness, and deterministic production-readiness checklist. Call this FIRST when the active conversation is about finishing or refining a content item. A deliveryExternalId is proof that Zernio accepted the post; scheduledAt alone is local intent.",
  inputSchema: z.object({ contentPostId: z.string() }),
  execute: async ({ contentPostId }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    const platformGroups = groupPlatformThreads(content.platformPosts);
    const readiness = getContentReadiness({
      hook: content.hook,
      status: content.status,
      spots: platformGroups.map((group) => ({
        source: group.root.source,
        platform: group.root.platform,
        archetype: group.root.archetype,
        text: group.items
          .map((post) => post.text)
          .filter(Boolean)
          .join("\n\n"),
        scheduledAt: group.root.scheduledAt,
        mediaCount: group.items.reduce(
          (count, post) => count + (post.media?.length ?? 0),
          0,
        ),
        assetLinkCount: group.items.reduce(
          (count, post) => count + (post.assetLinks?.length ?? 0),
          0,
        ),
      })),
    });
    return {
      id: content.id,
      title: content.title,
      brand: { id: content.brandId, name: content.brand?.name },
      pillar: content.pillar,
      series: content.series
        ? { id: content.series.id, name: content.series.name }
        : null,
      status: content.status,
      plannedAt: content.plannedAt,
      brief: {
        hook: content.hook,
        captionDirection: content.captionDirection,
        visualDirection: content.visualDirection,
        ctaText: content.ctaText,
        ctaKeyword: content.ctaKeyword,
        kpi: content.kpi,
      },
      media: content.media ?? [],
      platformPosts: platformGroups.map((group) => ({
        id: group.root.id,
        platform: group.root.platform,
        format: group.root.format,
        archetype: group.root.archetype,
        status: group.root.status,
        channel: group.root.channel
          ? {
              id: group.root.channel.id,
              displayName: group.root.channel.displayName,
              handle: group.root.channel.handle,
              connectionStatus: group.root.channel.connectionStatus,
              defaultProvider: group.root.channel.defaultProvider,
            }
          : null,
        text: group.root.text,
        scheduledAt: group.root.scheduledAt,
        provider: group.root.provider,
        deliveryExternalId: group.root.deliveryExternalId,
        deliveryStatus: group.root.deliveryStatus,
        deliveryError: group.root.deliveryError,
        deliveryUpdatedAt: group.root.deliveryUpdatedAt,
        firstComment: group.root.firstCommentText,
        firstCommentStatus: group.root.firstCommentStatus,
        firstCommentError: group.root.firstCommentError,
        firstCommentUpdatedAt: group.root.firstCommentUpdatedAt,
        media: group.root.media ?? [],
        assetLinks: group.root.assetLinks ?? [],
        threadItems: group.items.map((post, index) => ({
          id: post.id,
          sequence: post.sequence ?? index,
          text: post.text,
          media: post.media ?? [],
          assetLinks: post.assetLinks ?? [],
        })),
      })),
      readiness,
      url: `/app/content/${content.id}`,
    };
  },
});

export const searchContentWorkItems = growthAction({
  outputSchema: searchContentWorkItemsOutputSchema,
  description:
    "Search the current organization's canonical content ideas and their owned platform drafts by title, hook, copy, brand, platform, or format. Use this before creating an idea when the operator refers to existing work by name or intent.",
  inputSchema: z.object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  execute: async ({ query, limit }, ctx) => {
    const brandIds = await orgBrandIds(ctx.orgId);
    if (!brandIds.length) return { ideas: [], platformPosts: [] };
    const pattern = `%${query}%`;
    const brands = await db.query.brandTable.findMany({
      where: inArray(brandTable.id, brandIds),
      columns: { id: true, name: true },
    });
    const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
    const [ideas, platformPosts] = await Promise.all([
      db.query.contentPostTable.findMany({
        where: and(
          inArray(contentPostTable.brandId, brandIds),
          isNull(contentPostTable.deletedAt),
          or(
            ilike(contentPostTable.title, pattern),
            ilike(contentPostTable.hook, pattern),
            ilike(contentPostTable.body, pattern),
            ilike(contentPostTable.captionDirection, pattern),
            ilike(contentPostTable.pillar, pattern),
          ),
        ),
        columns: {
          id: true,
          brandId: true,
          title: true,
          hook: true,
          pillar: true,
          status: true,
          updatedAt: true,
        },
        orderBy: [desc(contentPostTable.updatedAt)],
        limit,
      }),
      db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          eq(platformPostTable.source, "owned"),
          or(
            ilike(platformPostTable.text, pattern),
            // platform is the channel_platform enum, and Postgres has no
            // ilike operator for an enum — the whole search 42883'd on it.
            // format is plain text ("instagram.reel"), so it needs no cast.
            sql`${platformPostTable.platform}::text ilike ${pattern}`,
            ilike(platformPostTable.format, pattern),
          ),
        ),
        columns: {
          id: true,
          brandId: true,
          contentPostId: true,
          platform: true,
          format: true,
          status: true,
          text: true,
          updatedAt: true,
        },
        with: {
          contentPost: {
            columns: { id: true, title: true, deletedAt: true },
          },
        },
        orderBy: [desc(platformPostTable.updatedAt)],
        limit,
      }),
    ]);
    return {
      ideas: ideas.map((idea) => ({
        ...idea,
        brandName: brandName.get(idea.brandId) ?? "—",
        url: `/app/content/${idea.id}`,
      })),
      platformPosts: platformPosts
        .filter(
          (post) =>
            post.contentPostId &&
            post.contentPost &&
            !post.contentPost.deletedAt,
        )
        .map((post) => ({
          id: post.id,
          contentPostId: post.contentPostId,
          contentTitle: post.contentPost?.title ?? "Untitled idea",
          brandName: brandName.get(post.brandId) ?? "—",
          platform: post.platform,
          format: post.format,
          status: post.status,
          text: post.text,
          url: `/app/content/${post.contentPostId}#post-${post.id}`,
        })),
    };
  },
});

export const updateContentWorkItem = growthAction({
  outputSchema: updateContentWorkItemOutputSchema,
  description:
    "Apply agreed edits to a canonical content brief and/or its existing owned platform drafts. Use concrete copy and dates agreed in conversation; do not use this merely to save vague suggestions.",
  inputSchema: z.object({
    contentPostId: z.string(),
    contentStatus: contentStatus.optional(),
    brief: z
      .object({
        title: z.string().trim().min(1).optional(),
        hook: z.string().nullable().optional(),
        captionDirection: z.string().nullable().optional(),
        visualDirection: z.string().nullable().optional(),
        ctaText: z.string().nullable().optional(),
        ctaKeyword: z.string().nullable().optional(),
        kpi: z.string().nullable().optional(),
        plannedAt: z.string().datetime().nullable().optional(),
        pillar: z.string().nullable().optional(),
        seriesId: z.string().nullable().optional(),
      })
      .optional(),
    platformDrafts: z
      .array(
        z.object({
          platformPostId: z.string(),
          text: z.string().max(10_000).nullable().optional(),
          status: contentStatus.optional(),
          scheduledAt: z.string().datetime().nullable().optional(),
          format: z
            .string()
            .optional()
            .describe(
              "Re-point this spot at a different product on the SAME platform, e.g. 'instagram.reel' instead of 'instagram.image'. Use this when the brief is a video but the spot was created as a still; do not create a second spot for that.",
            ),
        }),
      )
      .max(12)
      .optional()
      .describe(
        "status and scheduledAt move the whole publishing unit: thread replies and Story frames follow their root.",
      ),
  }),
  execute: async (input, ctx) => {
    const content = await requireContentWorkItem(input.contentPostId, ctx);
    const ownedById = new Map(
      content.platformPosts
        .filter((post) => post.source === "owned")
        .map((post) => [post.id, post]),
    );
    for (const draft of input.platformDrafts ?? []) {
      const owned = ownedById.get(draft.platformPostId);
      if (!owned) {
        throw rejectUnusableDraft({
          rejectedId: draft.platformPostId,
          eligible: [...ownedById.values()],
          eligibleLabel: "owned drafts",
          hint: ADD_A_SPOT_HINT,
        });
      }
      // A format change must stay on the same platform, and must be a real
      // product for it — otherwise a spot can be re-pointed at nonsense.
      if (draft.format !== undefined) {
        const validation = validateSpot({
          platform: owned.platform,
          format: draft.format,
        });
        if (!validation.ok) {
          throw new GrowthActionError(
            "invalid_input",
            `Cannot set format ${draft.format} on a ${owned.platform} spot: ${validation.errors.join("; ")}`,
          );
        }
      }
    }
    // The idea's status is not what the team looks at. The calendar, the Feed
    // and the pipeline counts all read the spot's status, so marking the idea
    // published over draft spots is a report of success nobody can see — the
    // failure that produced this guard (2026-08-18: two newsletter ideas went
    // `published` while both spots stayed `draft`).
    if (input.contentStatus === "published") {
      const requested = new Map(
        (input.platformDrafts ?? []).map((draft) => [
          draft.platformPostId,
          draft.status,
        ]),
      );
      // A status on a root moves its thread or Story children with it.
      const unshipped = content.platformPosts.filter(
        (post) =>
          post.source === "owned" &&
          !SHIPPED_OR_OFF_THE_BOARD.includes(
            requested.get(post.id) ??
              (post.parentPlatformPostId
                ? requested.get(post.parentPlatformPostId)
                : undefined) ??
              post.status,
          ),
      );
      if (unshipped.length) {
        const count = `${unshipped.length} unshipped owned spot${unshipped.length === 1 ? "" : "s"}`;
        throw new GrowthActionError(
          "invalid_input",
          ctx.surface === "app"
            ? `This idea still has ${count} (${unshipped
                .map((post) => `${post.platform}, ${post.status}`)
                .join(
                  "; ",
                )}). Mark each spot published first: the calendar and the pipeline read the spots.`
            : `This idea still has ${count}: ${unshipped
                .map((post) => `${post.id} (${post.platform}, ${post.status})`)
                .join(
                  ", ",
                )}. Marking only the idea published leaves the calendar showing a draft. If the operator posted these by hand, record it with publishingWrite.recordExternalPublish (it moves the spots and rolls the idea up). If it went out through Zernio, use publishingWrite.publishNow.`,
        );
      }
    }
    if (input.brief) {
      const brief = { ...input.brief };
      const targetSeriesId =
        brief.seriesId === undefined ? content.seriesId : brief.seriesId;
      if (targetSeriesId) {
        const series = await db.query.seriesTable.findFirst({
          where: and(
            eq(seriesTable.id, targetSeriesId),
            eq(seriesTable.brandId, content.brandId),
            isNull(seriesTable.deletedAt),
          ),
          columns: { pillar: true },
        });
        if (!series) throw new Error("Series not found for this brand.");
        if (
          series.pillar &&
          brief.pillar !== undefined &&
          brief.pillar !== null &&
          brief.pillar !== series.pillar
        ) {
          throw new Error(
            `This series belongs to ${series.pillar}. Update the series instead of giving one installment a conflicting pillar.`,
          );
        }
        if (brief.seriesId !== undefined && brief.pillar === undefined) {
          brief.pillar = series.pillar;
        }
      }
      await ContentService.updateBrief({ id: content.id, ...brief });
    }
    if (input.contentStatus) {
      await ContentService.setContentStatus({
        contentPostId: content.id,
        status: input.contentStatus,
      });
    }
    for (const draft of input.platformDrafts ?? []) {
      await ContentService.updatePlatformDraft(draft);
    }
    return {
      ok: true as const,
      contentPostId: content.id,
      updatedPlatformPosts:
        input.platformDrafts?.map((draft) => draft.platformPostId) ?? [],
      url: `/app/content/${content.id}`,
    };
  },
});

export const setPlatformPostFirstComment = growthAction({
  outputSchema: setPlatformPostFirstCommentOutputSchema,
  description:
    "Prepare or clear the local first comment for one owned Instagram or LinkedIn post. This only changes Growth's draft. If the post is already queued in Zernio, use publishingWrite.updateFirstComment with approval to change the provider job.",
  inputSchema: z.object({
    platformPostId: z.string(),
    firstComment: z.string().trim().max(2_200).nullable(),
  }),
  execute: async (input, ctx) => {
    const post = await db.query.platformPostTable.findFirst({
      where: eq(platformPostTable.id, input.platformPostId),
      with: { brand: true },
    });
    if (post?.source !== "owned" || post?.brand?.organizationId !== ctx.orgId) {
      throw new Error(
        "That owned social post is not available in this organization",
      );
    }
    return saveSocialFirstComment(input);
  },
});

export const setPlatformPostThread = growthAction({
  outputSchema: setPlatformPostThreadOutputSchema,
  description:
    "Create or replace the ordered native posts inside one owned X or Threads draft. This is one platform rendering with linked reply posts, not a content series and not several cross-posts. Use after getWorkItem when the operator asks for a thread, multiple tweets, multiple Threads posts, or asks to split numbered copy into native posts. Pass clean post text without 1/2/3 markers.",
  inputSchema: z.object({
    contentPostId: z.string(),
    platformPostId: z
      .string()
      .describe("The root X or Threads platform post from getWorkItem."),
    posts: z
      .array(
        z.object({
          text: z
            .string()
            .trim()
            .min(1)
            .max(10_000)
            .describe("One complete native post, without sequence numbering."),
        }),
      )
      .min(1)
      .max(25),
  }),
  execute: async (input, ctx) => {
    const content = await requireContentWorkItem(input.contentPostId, ctx);
    const root = content.platformPosts.find(
      (post) =>
        post.id === input.platformPostId &&
        post.source === "owned" &&
        !post.parentPlatformPostId,
    );
    if (!root) {
      // A thread needs an owned ROOT, so a child spot is rejected here too. Say
      // which posts qualify rather than leaving the model to guess why its id
      // was refused when the id may well exist on the work item.
      throw rejectUnusableDraft({
        rejectedId: input.platformPostId,
        eligible: content.platformPosts.filter(
          (post) => post.source === "owned" && !post.parentPlatformPostId,
        ),
        eligibleLabel: "threadable owned roots",
        hint: "Thread from one of those, or add a spot with contentWrite.createPlatformPost.",
      });
    }
    if (root.platform !== "x" && root.platform !== "threads") {
      // Adjacent to the guard above and in the same validation preamble, so it
      // gets the same treatment: the message already names the correction.
      throw new GrowthActionError(
        "invalid_input",
        `Native post threads are supported on X and Threads, not ${root.platform}. Use contentWrite.setFirstComment for a single follow-up, or thread an X or Threads spot instead.`,
      );
    }

    const children = content.platformPosts
      .filter((post) => post.parentPlatformPostId === root.id)
      .sort(
        (a, b) =>
          (a.sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.sequence ?? Number.MAX_SAFE_INTEGER),
      );
    const existing = [root, ...children];
    const saved = await ContentService.saveSpotThread({
      rootPlatformPostId: root.id,
      expectedUpdatedAt: root.updatedAt.toISOString(),
      items: input.posts.map((post, index) => ({
        id: existing[index]?.id,
        text: post.text,
        media: existing[index]?.media ?? [],
        assetLinks: existing[index]?.assetLinks ?? [],
      })),
    });
    if (!saved) {
      throw new Error(
        "This platform draft changed while the thread was being prepared. Read the work item again and retry.",
      );
    }

    return {
      ok: true as const,
      contentPostId: content.id,
      platformPostId: root.id,
      platform: root.platform,
      postCount: saved.itemIds.length,
      platformPostIds: saved.itemIds,
      url: `/app/content/${content.id}#post-${root.id}`,
    };
  },
});

export const addContentCrossPost = growthAction({
  outputSchema: addContentCrossPostOutputSchema,
  description:
    "Add one or more agreed channel renderings to an existing canonical content work item. Creates empty owned drafts for the selected platforms; use updateContentWorkItem afterward to write channel-native copy. Read the brief first and pass contentType, so a video idea gets a Reel rather than a feed image.",
  inputSchema: z.object({
    contentPostId: z.string(),
    platforms: z.array(z.enum(channelPlatformEnum.enumValues)).min(1).max(8),
    contentType: z.enum(["image", "video", "carousel"]).optional(),
  }),
  execute: async ({ contentPostId, platforms, contentType }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    const existing = new Set(
      content.platformPosts.map((post) => post.platform),
    );
    const additions = [...new Set(platforms)].filter(
      (platform) => !existing.has(platform),
    );
    await ContentService.addSpotTargets(
      content.id,
      content.brandId,
      additions.map((platform) => ({
        platform,
        format: contentType
          ? (classifyFormatFromFields(platform, {
              content_type: contentType,
            }).format ?? null)
          : null,
      })),
    );
    return {
      ok: true as const,
      contentPostId: content.id,
      added: additions,
      skipped: platforms.filter((platform) => existing.has(platform)),
      url: `/app/content/${content.id}`,
    };
  },
});

export const attachChatImageToContent = growthAction({
  outputSchema: attachChatImageToContentOutputSchema,
  description:
    "Save one or more pasted chat images into the active brand's durable media library and attach them to the active content pool, selected platform drafts, or every owned draft. Use only when the operator explicitly asks to use, save, or attach images. Pass the complete images array for the current turn. When they refer to images from an earlier turn, omit images, imageUrl, and mimeType; the server resolves the complete image set from the newest user message with owned attachments.",
  inputSchema: z.object({
    contentPostId: z.string(),
    images: z
      .array(
        z.object({
          imageUrl: z.string().url(),
          mimeType: z.string().startsWith("image/"),
          title: z.string().optional(),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
    // Retained for one-image callers while the canonical path is `images`.
    imageUrl: z.string().url().optional(),
    mimeType: z.string().startsWith("image/").optional(),
    title: z.string().optional(),
    attachTo: z.enum(["pool", "all_spots", "platform_posts"]).default("pool"),
    platformPostIds: z.array(z.string()).max(12).optional(),
  }),
  execute: async (input, ctx) => {
    const content = await requireContentWorkItem(input.contentPostId, ctx);
    let images: Array<ChatImageReference & { title?: string }> =
      input.images?.map((image) => ({
        url: image.imageUrl,
        mediaType: image.mimeType,
        title: image.title,
      })) ??
      (input.imageUrl && input.mimeType
        ? [
            {
              url: input.imageUrl,
              mediaType: input.mimeType,
              title: input.title,
            },
          ]
        : []);
    if (images.length === 0 && ctx.threadId) {
      const rows = await db.query.assistantMessageTable.findMany({
        where: eq(assistantMessageTable.threadId, ctx.threadId),
        columns: { message: true },
        orderBy: [desc(assistantMessageTable.createdAt)],
        limit: 30,
      });
      images = findLatestOwnedChatImages(
        rows.map((row) => row.message).reverse(),
        ctx.userId,
      );
    }
    const seen = new Set<string>();
    images = images.filter((image) => {
      if (seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });
    if (images.length === 0) {
      throw new Error(
        "No user-owned image attachments are available in this conversation.",
      );
    }
    const assets = await Promise.all(
      images.map((image) =>
        MediaService.promoteChatImage({
          brandId: content.brandId,
          userId: ctx.userId,
          url: image.url,
          mimeType: image.mediaType,
          title: image.title ?? input.title ?? content.title ?? undefined,
        }),
      ),
    );
    const items = assets.map((asset) => ({
      url: asset.url!,
      type: "image" as const,
      assetId: asset.id,
      thumbnail: asset.thumbnailUrl ?? asset.url ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    }));
    await ContentService.setPoolMedia({
      contentPostId: content.id,
      media: [...(content.media ?? []), ...items],
    });

    const owned = content.platformPosts.filter(
      (post) => post.source === "owned",
    );
    const selected =
      input.attachTo === "all_spots"
        ? owned
        : input.attachTo === "platform_posts"
          ? owned.filter((post) => input.platformPostIds?.includes(post.id))
          : [];
    for (const post of selected) {
      await ContentService.setSpotMedia({
        platformPostId: post.id,
        media: [...(post.media ?? []), ...items],
      });
    }
    const analyses = await Promise.all(
      assets.map(async (asset) => {
        try {
          return {
            mediaAssetId: asset.id,
            analysis: await analyzeStoredMediaAsset({
              mediaId: asset.id,
              brandName: content.brand?.name ?? "Brand",
              steer: `Analyze this pasted asset for ${content.title ?? "the active content item"}.`,
            }),
            error: null,
          };
        } catch (error) {
          // The durable save and attachment already succeeded. Keep that useful
          // result even if optional enrichment is temporarily unavailable.
          return {
            mediaAssetId: asset.id,
            analysis: null,
            error: error instanceof Error ? error.message : "Analysis failed",
          };
        }
      }),
    );
    return {
      ok: true as const,
      mediaAssetId: assets[0]!.id,
      mediaAssetIds: assets.map((asset) => asset.id),
      contentPostId: content.id,
      attachedPlatformPostIds: selected.map((post) => post.id),
      analyzed: Boolean(analyses[0]?.analysis),
      analysis: analyses[0]?.analysis ?? null,
      analysisError: analyses[0]?.error ?? null,
      analyzedCount: analyses.filter((result) => result.analysis).length,
      analyses,
      url: `/app/content/${content.id}`,
    };
  },
});

export const makeCarouselFromPool = growthAction({
  outputSchema: makeCarouselFromPoolOutputSchema,
  description:
    "Turn ordered media (images, GIFs, or mini videos) already in a content work item's media pool into one or more owned platform carousels. Call getWorkItem first, preserve the operator's requested order (or the pool order when they say all/these), and provide the asset IDs separately for each target platform post so platform limits can differ. Per-platform media rules are enforced at publish time.",
  inputSchema: z.object({
    contentPostId: z.string(),
    targets: z
      .array(
        z.object({
          platformPostId: z.string(),
          mediaAssetIds: z
            .array(z.string())
            .min(1)
            .max(300)
            .describe("Ordered media asset IDs from the content media pool."),
        }),
      )
      .min(1)
      .max(12),
  }),
  execute: async ({ contentPostId, targets }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    const poolByAssetId = new Map(
      (content.media ?? [])
        .filter((item) => item.assetId)
        .map((item) => [item.assetId!, item]),
    );
    const ownedById = new Map(
      content.platformPosts
        .filter((post) => post.source === "owned")
        .map((post) => [post.id, post]),
    );
    const seenTargets = new Set<string>();
    const prepared = targets.map((target) => {
      if (seenTargets.has(target.platformPostId)) {
        throw new Error("Each target platform post may only appear once.");
      }
      seenTargets.add(target.platformPostId);
      const post = ownedById.get(target.platformPostId);
      if (!post) {
        throw rejectUnusableDraft({
          rejectedId: target.platformPostId,
          eligible: [...ownedById.values()],
          eligibleLabel: "owned drafts",
          hint: ADD_A_SPOT_HINT,
        });
      }
      const format = platformFormatsFor(post.platform).find(
        (candidate) => candidate.archetype === "carousel",
      );
      if (!format) {
        throw new Error(`${post.platform} has no supported carousel format.`);
      }
      const media = target.mediaAssetIds.map((assetId) => {
        const item = poolByAssetId.get(assetId);
        if (!item) {
          throw new Error(
            `Media asset ${assetId} is not in this content item's media pool.`,
          );
        }
        if (item.type !== "image" && item.type !== "video") {
          throw new Error(`Media asset ${assetId} is not an image or video.`);
        }
        return item;
      });
      if (new Set(target.mediaAssetIds).size !== target.mediaAssetIds.length) {
        throw new Error(
          "A carousel cannot contain the same media asset twice.",
        );
      }
      const minimum = format.media.min ?? 1;
      const maximum = format.media.max ?? 300;
      if (media.length < minimum || media.length > maximum) {
        throw new Error(
          `${format.label} needs ${minimum}-${maximum} images; received ${media.length}.`,
        );
      }
      return { post, format, media };
    });

    for (const target of prepared) {
      await ContentService.setSpotCarousel({
        platformPostId: target.post.id,
        format: target.format.id,
        media: target.media,
      });
    }
    return {
      ok: true as const,
      contentPostId: content.id,
      updated: prepared.map(({ post, format, media }) => ({
        platformPostId: post.id,
        platform: post.platform,
        format: format.id,
        mediaCount: media.length,
      })),
      url: `/app/content/${content.id}`,
    };
  },
});

const uploadImageMimeType = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export const prepareContentMediaUploads = growthAction({
  outputSchema: prepareContentMediaUploadsOutputSchema,
  description:
    "Prepare direct uploads for local image files produced in Claude Code, Claude Design, or another creative tool. Returns short-lived presigned PUT URLs; the MCP host should PUT each local file with the exact Content-Type, then call finishUpload with the returned media IDs in carousel order.",
  inputSchema: z.object({
    contentPostId: z.string(),
    files: z
      .array(
        z.object({
          filename: z.string().trim().min(1).max(300),
          mimeType: uploadImageMimeType,
          size: z
            .number()
            .int()
            .positive()
            .max(25 * 1024 * 1024),
        }),
      )
      .min(1)
      .max(20),
  }),
  execute: async ({ contentPostId, files }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    if ((content.media?.length ?? 0) + files.length > 50) {
      throw new Error(
        "This upload would exceed the 50-item content media pool.",
      );
    }
    const uploads = [];
    for (const file of files) {
      const prepared = await MediaService.createR2Upload({
        brandId: content.brandId,
        uploadedBy: ctx.userId,
        ...file,
      });
      uploads.push({
        mediaId: prepared.mediaId,
        uploadUrl: prepared.uploadUrl,
        publicUrl: prepared.publicUrl,
        pathname: prepared.pathname,
        filename: file.filename,
        mimeType: file.mimeType,
      });
    }
    return {
      contentPostId: content.id,
      uploads,
      next: "PUT each local file to its uploadUrl with the exact mimeType as Content-Type, then call contentMediaWrite.finishUpload with mediaIds in the intended slide order.",
    };
  },
});

export const finishContentMediaUploads = growthAction({
  outputSchema: finishContentMediaUploadsOutputSchema,
  description:
    "Verify and finalize direct image uploads prepared by prepareUpload, then attach them to the content media pool in the provided order. Safe to retry: already-ready media is reused and pool attachment dedupes by asset ID.",
  inputSchema: z.object({
    contentPostId: z.string(),
    uploads: z
      .array(
        z.object({
          mediaId: z.string(),
          width: z.number().int().positive().max(20_000).optional(),
          height: z.number().int().positive().max(20_000).optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
  execute: async ({ contentPostId, uploads }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    if (
      (content.media?.length ?? 0) +
        new Set(uploads.map((upload) => upload.mediaId)).size >
      50
    ) {
      throw new Error(
        "This upload would exceed the 50-item content media pool.",
      );
    }
    const items = [];
    for (const upload of uploads) {
      const asset = await MediaService.verifyR2Upload(upload.mediaId);
      if (
        asset.brandId !== content.brandId ||
        asset.uploadedBy !== ctx.userId
      ) {
        throw new Error(
          "That upload does not belong to this operator and brand.",
        );
      }
      const finalized = await MediaService.finalizeR2Upload({
        mediaId: asset.id,
        url: asset.url!,
        pathname: asset.r2Key!,
        width: upload.width ?? asset.width ?? undefined,
        height: upload.height ?? asset.height ?? undefined,
      });
      if (!finalized?.url) throw new Error("Could not finalize media upload.");
      items.push({
        url: finalized.url,
        type: "image" as const,
        assetId: finalized.id,
        thumbnail: finalized.thumbnailUrl ?? finalized.url,
        width: finalized.width ?? upload.width,
        height: finalized.height ?? upload.height,
      });
    }
    await ContentService.setPoolMedia({
      contentPostId: content.id,
      media: [...(content.media ?? []), ...items],
    });
    return {
      ok: true as const,
      contentPostId: content.id,
      mediaAssetIds: items.map((item) => item.assetId),
      mediaCount: items.length,
      url: `/app/content/${content.id}`,
      next: "Call contentMediaWrite.makeCarousel with these mediaAssetIds in the intended order for each target platform post.",
    };
  },
});

export const importRemoteImagesToContent = growthAction({
  outputSchema: importRemoteImagesToContentOutputSchema,
  description:
    "Import public image URLs from a cloud design or artifact workflow into Growth's durable media library and the selected content pool. Growth downloads and rehosts each image so expiring source URLs do not break later. The input order becomes the pool/carousel order.",
  inputSchema: z.object({
    contentPostId: z.string(),
    images: z
      .array(
        z.object({
          url: z.string().url().max(2_000),
          filename: z.string().trim().min(1).max(300).optional(),
          title: z.string().trim().min(1).max(300).optional(),
          width: z.number().int().positive().max(20_000).optional(),
          height: z.number().int().positive().max(20_000).optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
  execute: async ({ contentPostId, images }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    if ((content.media?.length ?? 0) + images.length > 50) {
      throw new Error(
        "This import would exceed the 50-item content media pool.",
      );
    }
    const items = [];
    for (const image of images) {
      const asset = await MediaService.importRemoteImage({
        brandId: content.brandId,
        uploadedBy: ctx.userId,
        ...image,
      });
      if (!asset.url) throw new Error("Imported image has no durable URL.");
      items.push({
        url: asset.url,
        type: "image" as const,
        assetId: asset.id,
        thumbnail: asset.thumbnailUrl ?? asset.url,
        width: asset.width ?? image.width,
        height: asset.height ?? image.height,
      });
    }
    await ContentService.setPoolMedia({
      contentPostId: content.id,
      media: [...(content.media ?? []), ...items],
    });
    return {
      ok: true as const,
      contentPostId: content.id,
      mediaAssetIds: items.map((item) => item.assetId),
      mediaCount: items.length,
      url: `/app/content/${content.id}`,
      next: "Call contentMediaWrite.makeCarousel with these mediaAssetIds in the intended order for each target platform post.",
    };
  },
});

const mediaAttachTarget = z.enum(["pool", "all_spots", "platform_posts"]);

async function attachMediaItem(
  content: Awaited<ReturnType<typeof requireContentWorkItem>>,
  item: {
    url: string;
    type: "image" | "video" | "carousel";
    assetId?: string;
    thumbnail?: string;
    width?: number;
    height?: number;
  },
  attachTo: z.infer<typeof mediaAttachTarget>,
  platformPostIds?: string[],
) {
  await ContentService.setPoolMedia({
    contentPostId: content.id,
    media: [...(content.media ?? []), item],
  });
  const owned = content.platformPosts.filter((post) => post.source === "owned");
  const selected =
    attachTo === "all_spots"
      ? owned
      : attachTo === "platform_posts"
        ? owned.filter((post) => platformPostIds?.includes(post.id))
        : [];
  for (const post of selected) {
    await ContentService.setSpotMedia({
      platformPostId: post.id,
      media: [...(post.media ?? []), item],
    });
  }
  return selected.map((post) => post.id);
}

/**
 * Give the model a bounded, provenance-aware media shelf for one work item.
 * The model does the editorial ranking; this tool only retrieves real options
 * without mutating the library or silently recovering archived bytes.
 */
export const suggestMediaForContent = growthAction({
  outputSchema: suggestMediaForContentOutputSchema,
  description:
    "Retrieve media options for an active content work item from three honest lanes: ready assets already in the brand library, media found on the brand's historical platform posts, and the brief/context needed to write one strong AI image-generation prompt. Call after getContentWorkItem when the operator asks what visual or media to use. Return at most one recommendation per lane in your answer, explain why it fits, and distinguish immediately usable library media from archive media that still needs recovery. Never recommend a library asset solely from its dimensions, filename, or recency: it needs semantic evidence in its title, alt text, or tags.",
  inputSchema: z.object({
    contentPostId: z.string(),
    limitPerLane: z.number().int().min(3).max(12).default(8),
  }),
  execute: async ({ contentPostId, limitPerLane }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    const [library, archive] = await Promise.all([
      db.query.mediaAssetTable.findMany({
        where: and(
          eq(mediaAssetTable.brandId, content.brandId),
          eq(mediaAssetTable.status, "ready"),
          isNull(mediaAssetTable.deletedAt),
          inArray(mediaAssetTable.kind, ["image", "gif", "video"]),
        ),
        with: {
          folder: true,
          tagAssignments: { with: { tag: true } },
        },
        orderBy: [desc(mediaAssetTable.createdAt)],
        limit: limitPerLane,
      }),
      db.query.platformPostTable.findMany({
        where: and(
          eq(platformPostTable.brandId, content.brandId),
          sql<boolean>`jsonb_array_length(coalesce(${platformPostTable.media}, '[]'::jsonb)) > 0`,
        ),
        orderBy: [desc(platformPostTable.publishedAt)],
        limit: limitPerLane + 4,
      }),
    ]);

    const attachedAssetIds = new Set(
      [
        ...(content.media ?? []),
        ...content.platformPosts.flatMap((post) => post.media ?? []),
      ]
        .map((item) => item.assetId)
        .filter((id): id is string => Boolean(id)),
    );

    return {
      content: {
        id: content.id,
        title: content.title,
        pillar: content.pillar,
        hook: content.hook,
        visualDirection: content.visualDirection,
        captionDirection: content.captionDirection,
        platformDrafts: content.platformPosts.map((post) => ({
          id: post.id,
          platform: post.platform,
          format: post.format,
          archetype: post.archetype,
          text: post.text,
        })),
      },
      library: library
        .map((asset) => ({
          mediaAssetId: asset.id,
          kind: asset.kind,
          title: asset.title,
          alt: asset.alt,
          tags: [
            ...(asset.tags ?? []),
            ...asset.tagAssignments.map((assignment) => assignment.tag.name),
          ],
          folder: asset.folder?.name ?? null,
          url: asset.url ?? asset.externalUrl,
          thumbnailUrl: asset.thumbnailUrl,
          width: asset.width,
          height: asset.height,
          alreadyAttached: attachedAssetIds.has(asset.id),
          provenance: asset.sourcePlatformPostId
            ? {
                platformPostId: asset.sourcePlatformPostId,
                mediaIndex: asset.sourceMediaIndex,
              }
            : null,
        }))
        .filter(
          (asset) =>
            Boolean(asset.title?.trim()) ||
            Boolean(asset.alt?.trim()) ||
            asset.tags.length > 0,
        ),
      libraryAssetsWithoutSemanticMetadata: library.filter((asset) => {
        const tags = [
          ...(asset.tags ?? []),
          ...asset.tagAssignments.map((assignment) => assignment.tag.name),
        ];
        return !asset.title?.trim() && !asset.alt?.trim() && tags.length === 0;
      }).length,
      archive: archive
        .filter((post) => post.contentPostId !== content.id)
        .slice(0, limitPerLane)
        .map((post) => ({
          platformPostId: post.id,
          platform: post.platform,
          text: post.text?.slice(0, 700),
          publishedAt: post.publishedAt,
          externalUrl: post.externalUrl,
          media: (post.media ?? []).slice(0, 4).map((item, mediaIndex) => ({
            mediaIndex,
            type: item.type,
            width: item.width,
            height: item.height,
            previewAvailable: Boolean(item.thumbnail || item.url),
          })),
        })),
      generationBrief: {
        instruction:
          "Write one production-ready image prompt only if generating is stronger than reuse or recovery. Specify subject, composition, visual style, brand-relevant palette, aspect ratio, and what to avoid. Do not include logos or rendered text unless the operator asks for them.",
        title: content.title,
        hook: content.hook,
        visualDirection: content.visualDirection,
        channels: [
          ...new Set(content.platformPosts.map((post) => post.platform)),
        ],
      },
    };
  },
});

export const attachLibraryMediaToContent = growthAction({
  outputSchema: attachLibraryMediaToContentOutputSchema,
  description:
    "Attach a chosen, ready asset that already exists in the active brand's media library to the content pool and optionally selected or all owned platform drafts. Use the mediaAssetId returned by suggestMediaForContent.",
  inputSchema: z.object({
    contentPostId: z.string(),
    mediaAssetId: z.string(),
    attachTo: mediaAttachTarget.default("pool"),
    platformPostIds: z.array(z.string()).max(12).optional(),
  }),
  execute: async (input, ctx) => {
    const content = await requireContentWorkItem(input.contentPostId, ctx);
    const asset = await db.query.mediaAssetTable.findFirst({
      where: and(
        eq(mediaAssetTable.id, input.mediaAssetId),
        eq(mediaAssetTable.brandId, content.brandId),
        eq(mediaAssetTable.status, "ready"),
        isNull(mediaAssetTable.deletedAt),
      ),
    });
    const url = asset?.url ?? asset?.externalUrl;
    if (!asset || !url) {
      throw new Error("That library asset is not available for this brand.");
    }
    const item = {
      url,
      type: asset.kind === "video" ? ("video" as const) : ("image" as const),
      assetId: asset.id,
      thumbnail: asset.thumbnailUrl ?? asset.url ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    };
    const attachedPlatformPostIds = await attachMediaItem(
      content,
      item,
      input.attachTo,
      input.platformPostIds,
    );
    return {
      ok: true as const,
      mediaAssetId: asset.id,
      contentPostId: content.id,
      attachedPlatformPostIds,
      url: `/app/content/${content.id}`,
    };
  },
});

export const freezeCompositionToLibrary = growthAction({
  outputSchema: freezeCompositionToLibraryOutputSchema,
  description:
    "Render a composition blueprint over an owned library image and save the PNG as a reusable media asset (a card). templateId picks the layout: catalog-copy is the feed card (home name + facts over a dark gradient), catalog-review a guest quote with stars (rating 1-5), tall-statement and tall-welcome for stories, photo-only the bare photo. formatId picks the canvas (portrait 4:5 for feeds, story 9:16, square, landscape). focal {x,y} in percent keeps that point of the photo in frame; scrim is a dark hex tint for the gradient; mark picks the brand mark tone (auto is right). Run contentMediaWrite.directComposition first and freeze its corrected values: that is how a card gets judged before it is kept. Freezing only creates the asset; attachLibraryMedia or adsWrite.replaceAdCard put it somewhere.",
  inputSchema: freezeCompositionSchema,
  execute: async (input, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (!brand) {
      throw new Error(
        "That brand is not available in the active organization.",
      );
    }

    const asset = await freezeComposition({
      userId: ctx.userId,
      spec: input,
    });
    return {
      ok: true as const,
      mediaAssetId: asset.id,
      title: asset.title,
      width: asset.width,
      height: asset.height,
      url: asset.url,
      libraryUrl: "/app/media",
      compositionUrl: "/app/compositions",
    };
  },
});

export const directCompositionAction = growthAction({
  description:
    "The art director's read of a composition before it is frozen: renders the spec, looks at the card beside its photo, and returns corrected form values (a shorter title or subtitle, a focal point for the crop, a scrim tint) with a note saying why. When no crop can show the subject it extends the photo and returns the new sourceMediaAssetId. Nothing is saved. Freeze the returned values with contentMediaWrite.freezeComposition; a verdict of keep means the spec was fine as given.",
  inputSchema: compositionSpecSchema,
  outputSchema: z.object({
    verdict: z.enum(["keep", "adjust"]),
    note: z.string(),
    changes: z.array(z.string()),
    title: z.string(),
    subtitle: z.string().nullable(),
    focal: z.object({ x: z.number(), y: z.number() }).nullable(),
    scrim: z.string().nullable(),
    sourceMediaAssetId: z.string().nullable(),
  }),
  execute: async (input, ctx) => {
    await requireOwnedBrandId(input.brandId, ctx);
    return directComposition({ userId: ctx.userId, spec: input });
  },
});

export const writeCompositionCopyAction = growthAction({
  description:
    "Words for a card before it is judged: fills the blueprint's fields (eyebrow, title, subtitle, cta, rating) from the brand's voice and the home behind the photo, using only known facts. Give the brandId, templateId, formatId and the library photo (sourceMediaAssetId). Returns the values to put in a composition spec, a note saying what they were written from, and the matched home's URL when the photo came from a listing. Nothing is saved: pass the values to contentMediaWrite.directComposition, then freezeComposition.",
  inputSchema: writeCompositionCopySchema,
  outputSchema: z.object({
    eyebrow: z.string().nullable(),
    title: z.string(),
    subtitle: z.string().nullable(),
    cta: z.string().nullable(),
    rating: z.number().nullable(),
    note: z.string(),
    homeUrl: z.string().nullable(),
  }),
  execute: async (input, ctx) => {
    await requireOwnedBrandId(input.brandId, ctx);
    return writeCompositionCopy({ userId: ctx.userId, spec: input });
  },
});

export const extendCompositionAction = growthAction({
  description:
    "Extend (outpaint) a library photo to a canvas's ratio with Gemini, so a landscape hero fits a portrait or story card without cropping the subject. The axis is chosen from the photo's shape against the canvas. Returns the new library asset, or the earlier extension of the same photo. Use it when directComposition says the subject cannot fit, or when the operator asks.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    sourceMediaAssetId: z.string().min(1),
    formatId: compositionFormatIdSchema,
    title: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe("The home or subject, for the asset name."),
  }),
  outputSchema: z.object({
    mediaAssetId: z.string(),
    url: z.string(),
    reused: z.boolean(),
    axis: z.enum(["vertical", "horizontal"]),
  }),
  execute: async (input, ctx) => {
    await requireOwnedBrandId(input.brandId, ctx);
    const result = await extendCompositionSource({
      userId: ctx.userId,
      ...input,
    });
    return {
      mediaAssetId: result.id,
      url: result.url,
      reused: result.reused,
      axis: result.axis,
    };
  },
});

async function requireOwnedBrandId(brandId: string, ctx: CapabilityContext) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, ctx.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!brand)
    throw new Error("That brand is not available in the active organization.");
  return brand;
}

export const recoverArchiveMediaToContent = growthAction({
  outputSchema: recoverArchiveMediaToContentOutputSchema,
  description:
    "Recover one chosen media item from the active brand's own historical platform-post archive into its durable media library, then attach it to the active content pool and optionally selected or all owned platform drafts. Use the platformPostId and mediaIndex returned by suggestMediaForContent. This preserves the original media type; recovering a video does not extract a still frame.",
  inputSchema: z.object({
    contentPostId: z.string(),
    platformPostId: z.string(),
    mediaIndex: z.number().int().min(0).max(20),
    attachTo: mediaAttachTarget.default("pool"),
    platformPostIds: z.array(z.string()).max(12).optional(),
  }),
  execute: async (input, ctx) => {
    const content = await requireContentWorkItem(input.contentPostId, ctx);
    const source = await db.query.platformPostTable.findFirst({
      where: and(
        eq(platformPostTable.id, input.platformPostId),
        eq(platformPostTable.brandId, content.brandId),
      ),
    });
    if (!source?.media?.[input.mediaIndex]) {
      throw new Error("That archived media item is no longer available.");
    }
    const recovered = await MediaService.capturePostMedia({
      platformPostId: source.id,
      destinationBrandId: content.brandId,
      mediaIndexes: [input.mediaIndex],
      uploadedBy: ctx.userId,
    });
    const asset = recovered.assets[0];
    if (!asset?.url)
      throw new Error("The archive media could not be recovered.");
    const item = {
      url: asset.url,
      type: asset.kind === "video" ? ("video" as const) : ("image" as const),
      assetId: asset.id,
      thumbnail: asset.thumbnailUrl ?? asset.url,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    };
    const attachedPlatformPostIds = await attachMediaItem(
      content,
      item,
      input.attachTo,
      input.platformPostIds,
    );
    return {
      ok: true as const,
      mediaAssetId: asset.id,
      sourcePlatformPostId: source.id,
      contentPostId: content.id,
      attachedPlatformPostIds,
      url: `/app/content/${content.id}`,
    };
  },
});

export const contentPipelineSummary = growthAction({
  outputSchema: contentPipelineSummaryOutputSchema,
  description:
    "Summarize the content pipeline for the organization: a count of content posts grouped by status (slot, draft, discovered, pending_review, approved, scheduled, published, rejected, archived). Use for 'what's in the pipeline / how much is scheduled / what needs review' questions.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const brandIds = await orgBrandIds(ctx.orgId);
    if (brandIds.length === 0) return { total: 0, byStatus: [] };

    const [rows, standaloneByStatus] = await Promise.all([
      db
        .select({
          status: contentPostTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(contentPostTable)
        .where(inArray(contentPostTable.brandId, brandIds))
        .groupBy(contentPostTable.status),
      db
        .select({
          status: platformPostTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(platformPostTable)
        .where(
          and(
            inArray(platformPostTable.brandId, brandIds),
            isNull(platformPostTable.contentPostId),
            eq(platformPostTable.source, "owned"),
            inArray(platformPostTable.status, [
              "slot",
              "draft",
              "pending_review",
              "approved",
              "scheduled",
            ]),
          ),
        )
        .groupBy(platformPostTable.status),
    ]);

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const standaloneTotal = standaloneByStatus.reduce(
      (sum, r) => sum + r.count,
      0,
    );
    return { total, byStatus: rows, standaloneTotal, standaloneByStatus };
  },
});

export const upcomingContent = growthAction({
  outputSchema: upcomingContentOutputSchema,
  description:
    "List content planned inside a bounded upcoming window, soonest first. Defaults to the next 14 days and can focus one owned brand. Use for 'what's next / what's planned in the next two weeks / what's on the calendar' questions.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(15),
    brandId: z.string().optional(),
    days: z.number().int().min(1).max(62).default(14),
  }),
  execute: async (input, ctx) => {
    const now = new Date();
    const through = new Date(now.getTime() + input.days * 86_400_000);
    const orgBrands = await orgBrandIds(ctx.orgId);
    const brandIds = input.brandId
      ? orgBrands.includes(input.brandId)
        ? [input.brandId]
        : []
      : orgBrands;
    if (brandIds.length === 0) {
      return {
        window: { from: now.toISOString(), through: through.toISOString() },
        posts: [],
        standalonePlatformPosts: [],
      };
    }

    const [posts, standalonePlatformPosts] = await Promise.all([
      db
        .select({
          id: contentPostTable.id,
          title: contentPostTable.title,
          brandId: contentPostTable.brandId,
          status: contentPostTable.status,
          pillar: contentPostTable.pillar,
          plannedAt: contentPostTable.plannedAt,
        })
        .from(contentPostTable)
        .where(
          and(
            inArray(contentPostTable.brandId, brandIds),
            gte(contentPostTable.plannedAt, now),
            lte(contentPostTable.plannedAt, through),
          ),
        )
        .orderBy(contentPostTable.plannedAt)
        .limit(input.limit),
      db
        .select({
          id: platformPostTable.id,
          brandId: platformPostTable.brandId,
          platform: platformPostTable.platform,
          status: platformPostTable.status,
          pillar: platformPostTable.pillar,
          text: platformPostTable.text,
          scheduledAt: platformPostTable.scheduledAt,
          metadata: platformPostTable.metadata,
        })
        .from(platformPostTable)
        .where(
          and(
            inArray(platformPostTable.brandId, brandIds),
            isNull(platformPostTable.contentPostId),
            eq(platformPostTable.source, "owned"),
            gte(platformPostTable.scheduledAt, now),
            lte(platformPostTable.scheduledAt, through),
          ),
        )
        .orderBy(platformPostTable.scheduledAt)
        .limit(input.limit),
    ]);

    return {
      window: { from: now.toISOString(), through: through.toISOString() },
      posts,
      standalonePlatformPosts: standalonePlatformPosts.map((post) => ({
        ...post,
        title:
          (post.metadata as { workingTitle?: string } | null)?.workingTitle ??
          post.text?.slice(0, 80) ??
          "Untitled channel draft",
      })),
    };
  },
});

export const productionQueue = growthAction({
  outputSchema: productionQueueOutputSchema,
  description:
    "List canonical content work items in the next 14 days with deterministic readiness checks and the next incomplete production step. Use for 'what should I work on?', 'what is blocked?', or after planning to move from slots into execution.",
  inputSchema: z.object({
    brandId: z.string(),
    days: z.number().int().min(1).max(62).default(14),
  }),
  execute: async ({ brandId, days }, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true },
    });
    if (!brand) {
      throw new Error("That brand is not available in this organization.");
    }
    const now = new Date();
    const through = new Date(now.getTime() + days * 86_400_000);
    const items = await db.query.contentPostTable.findMany({
      where: and(
        eq(contentPostTable.brandId, brandId),
        isNull(contentPostTable.deletedAt),
        gte(contentPostTable.plannedAt, now),
        lte(contentPostTable.plannedAt, through),
      ),
      with: { platformPosts: true },
      orderBy: (table, { asc }) => [asc(table.plannedAt)],
    });

    return {
      brand,
      window: { from: now.toISOString(), through: through.toISOString() },
      items: items.map((item) => {
        const readiness = getContentReadiness({
          hook: item.hook,
          status: item.status,
          spots: item.platformPosts.map((post) => ({
            source: post.source,
            platform: post.platform,
            archetype: post.archetype,
            text: post.text,
            scheduledAt: post.scheduledAt,
            mediaCount: post.media?.length ?? 0,
            assetLinkCount: post.assetLinks?.length ?? 0,
          })),
        });
        return {
          id: item.id,
          title: item.title,
          plannedAt: item.plannedAt,
          status: item.status,
          completed: readiness.completed,
          total: readiness.total,
          readyForReview: readiness.readyForReview,
          next: readiness.next,
          platforms: item.platformPosts.map((post) => post.platform),
          url: `/app/content/${item.id}`,
        };
      }),
    };
  },
});

export const createIdea = growthAction({
  outputSchema: createIdeaOutputSchema,
  description:
    "Create a new content idea — a draft on the /app/content board — for one of the org's brands. Search contentRead first when the operator may be referring to existing work, so this does not create a duplicate. Optionally create it directly inside an existing series, seed the editorial brief (hook, captionDirection, ctaText, pillar, plannedAt), and fan it out to channels (instagram, tiktok, x, facebook, youtube, threads, pinterest, linkedin) as spots. This writes to the workspace: gather the essentials (which brand, a title, ideally a hook and channels), reflect the idea back in one line, and call it once the operator agrees. If you don't already have a brandId, call listBrands first. An idea can start from anything the operator gives you — turn that into the fields.",
  inputSchema: z.object({
    brandId: z
      .string()
      .describe("The brand to create under (id from listBrands)."),
    title: z.string().min(1).describe("Short, scannable idea title."),
    seriesId: z
      .string()
      .optional()
      .describe("Existing series this idea should belong to."),
    hook: z.string().optional().describe("The scroll-stopping first line."),
    captionDirection: z
      .string()
      .optional()
      .describe(
        "Direction for the WORDS only — what the caption/copy should say and how it should read. A brief, not the final caption. Anything about footage, shots, pacing, edit, or audio belongs in visualDirection instead.",
      ),
    visualDirection: z
      .string()
      .optional()
      .describe(
        "Direction for what gets SHOT or MADE — footage, shots, pacing, edit, on-screen text, audio. Use this for creative/production direction; do not put it in captionDirection.",
      ),
    ctaText: z.string().optional().describe("The call to action."),
    pillar: z.string().optional().describe("Content pillar slug, if known."),
    plannedAt: z
      .string()
      .optional()
      .describe("Planned date on the calendar, ISO 8601."),
    platforms: z
      .array(z.enum(channelPlatformEnum.enumValues))
      .optional()
      .describe(
        "Channels to fan the idea out to as spots. Each gets that platform's PRIMARY format (Instagram becomes a feed image), so pass contentType when the idea is video or a carousel.",
      ),
    contentType: z
      .enum(["image", "video", "carousel"])
      .optional()
      .describe(
        "What this idea physically is. Drives each spot's format — 'video' makes the Instagram spot a Reel rather than a feed image. If the title or brief says reel, short, clip, or B-roll, this is 'video'.",
      ),
    spots: z
      .array(
        z.object({
          platform: z.enum(channelPlatformEnum.enumValues),
          format: z.string().optional(),
        }),
      )
      .max(12)
      .optional()
      .describe(
        "Explicit spots, in place of platforms, when a spot needs a named product or a platform appears twice, e.g. an Instagram feed post plus an 'instagram.story'. A spot without a format gets the platform's primary one.",
      ),
  }),
  execute: async (input, ctx) => {
    // Auth at the edge: the brand must belong to the caller's org.
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true },
    });
    if (!brand) {
      throw new GrowthActionError(
        "not_found",
        "That brand isn't in your organization (or doesn't exist). Call listBrands to get a valid brandId.",
      );
    }
    const series = input.seriesId
      ? await db.query.seriesTable.findFirst({
          where: and(
            eq(seriesTable.id, input.seriesId),
            eq(seriesTable.brandId, brand.id),
            isNull(seriesTable.deletedAt),
          ),
          columns: { id: true, pillar: true },
        })
      : null;
    if (input.seriesId && !series) {
      throw new GrowthActionError(
        "not_found",
        "Series not found for this brand.",
      );
    }
    if (series?.pillar && input.pillar && series.pillar !== input.pillar) {
      throw new GrowthActionError(
        "invalid_input",
        `This series belongs to ${series.pillar}; the new idea cannot use a conflicting pillar.`,
      );
    }

    // Without a contentType every spot lands on its platform's primary format,
    // which makes an Instagram Reel come out as a feed image. Reuse the scrape
    // classifier so "video" resolves per-platform (instagram.reel, tiktok.video)
    // instead of duplicating that mapping here.
    for (const { platform, format } of input.spots ?? []) {
      if (!format) continue;
      const validation = validateSpot({ platform, format });
      if (!validation.ok) {
        throw new GrowthActionError(
          "invalid_input",
          `Cannot create a ${format} spot on ${platform}: ${validation.errors.join("; ")}`,
        );
      }
    }
    const spots = input.spots?.length
      ? input.spots
      : input.platforms?.length
        ? input.platforms.map((platform) => ({
            platform,
            format: input.contentType
              ? (classifyFormatFromFields(platform, {
                  content_type: input.contentType,
                }).format ?? null)
              : null,
          }))
        : undefined;

    const { id } = await ContentService.createIdea({
      brandId: brand.id,
      title: input.title,
      hook: input.hook,
      captionDirection: input.captionDirection,
      visualDirection: input.visualDirection,
      ctaText: input.ctaText,
      seriesId: series?.id,
      pillar: series?.pillar ?? input.pillar,
      plannedAt: input.plannedAt,
      spots,
      ownerId: ctx.userId,
      createdById: ctx.userId,
    });

    return {
      ok: true as const,
      id,
      title: input.title,
      brandName: brand.name,
      platforms: [...new Set(spots?.map((spot) => spot.platform) ?? [])],
      seriesId: series?.id ?? null,
      url: id ? `/app/content/${id}` : null,
    };
  },
});

export const createPlatformPost = growthAction({
  outputSchema: createPlatformPostOutputSchema,
  description:
    "Create one platform-native draft for an owned brand without creating a canonical content idea. Use this as the default when the operator says they want to post something on one channel, react to a specific observed post, or fill one concrete date. It can be promoted later into a content idea, series, grouping, or cross-post plan. This writes to the workspace and requires approval.",
  inputSchema: z.object({
    brandId: z.string(),
    platform: z.enum(channelPlatformEnum.enumValues),
    title: z
      .string()
      .min(1)
      .optional()
      .describe("Working label; not necessarily the public caption."),
    text: z
      .string()
      .max(10_000)
      .optional()
      .describe("The working platform copy or hook."),
    pillar: z.string().optional(),
    scheduledAt: z.string().optional().describe("ISO 8601 date/time."),
    format: z.string().optional(),
    referencePlatformPostId: z
      .string()
      .optional()
      .describe("Observed platform post that inspired this draft."),
  }),
  execute: async (input, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true },
    });
    if (!brand)
      throw new GrowthActionError("not_found", "Owned brand not found.");
    if (input.referencePlatformPostId) {
      const reference = await db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.referencePlatformPostId),
        columns: { id: true },
      });
      if (!reference)
        throw new GrowthActionError(
          "not_found",
          "Reference platform post not found.",
        );
    }
    const { id } = await ContentService.createPlatformPost({
      ...input,
      ownerId: ctx.userId,
    });
    return {
      ok: true as const,
      id,
      brandName: brand.name,
      platform: input.platform,
      title: input.title ?? null,
      scheduledAt: input.scheduledAt ?? null,
      feedUrl: "/app/feed",
      next: "Keep it platform-native, or promote it if it earns a wider life.",
    };
  },
});

export const publishBlogDraft = growthAction({
  outputSchema: publishBlogDraftOutputSchema,
  description:
    "Push a drafted blog platform post into the wander.com CMS (DatoCMS) as a DRAFT article: converts the markdown draft to structured text, uploads the hero image, and links the spot to the created item. Never publishes; a human reviews and publishes in the Dato editor. Requires drafted text and a hero image on the spot or its idea pool.",
  inputSchema: z.object({
    platformPostId: z.string(),
  }),
  execute: async (input, ctx) => {
    const post = await db.query.platformPostTable.findFirst({
      where: eq(platformPostTable.id, input.platformPostId),
      with: { brand: { columns: { organizationId: true } } },
    });
    if (!post || post.brand?.organizationId !== ctx.orgId) {
      throw new GrowthActionError(
        "not_found",
        "Owned platform post not found.",
      );
    }
    const result = await publishBlogDraftToDato({
      platformPostId: input.platformPostId,
    });
    return {
      ok: true as const,
      ...result,
      note: "Created as a DRAFT in DatoCMS. Review and publish in the editor.",
      url: `/app/content/${post.contentPostId ?? ""}`,
    };
  },
});

export const promotePlatformPost = growthAction({
  outputSchema: promotePlatformPostOutputSchema,
  description:
    "Promote an existing standalone platform post into a canonical content idea. Optionally attach it to a series and add cross-post renderings. Use only after the operator decides the post should become reusable structure. This writes to the workspace and requires approval.",
  inputSchema: z.object({
    platformPostId: z.string(),
    title: z.string().min(1).optional(),
    pillar: z.string().optional(),
    seriesId: z.string().optional(),
    crossPostPlatforms: z
      .array(z.enum(channelPlatformEnum.enumValues))
      .optional(),
  }),
  execute: async (input, ctx) => {
    const post = await db.query.platformPostTable.findFirst({
      where: eq(platformPostTable.id, input.platformPostId),
      with: { brand: { columns: { organizationId: true } } },
    });
    if (!post || post.brand?.organizationId !== ctx.orgId) {
      throw new GrowthActionError(
        "not_found",
        "Owned platform post not found.",
      );
    }
    let pillar = input.pillar;
    if (input.seriesId) {
      const series = await db.query.seriesTable.findFirst({
        where: and(
          eq(seriesTable.id, input.seriesId),
          eq(seriesTable.brandId, post.brandId),
          isNull(seriesTable.deletedAt),
        ),
        columns: { pillar: true },
      });
      if (!series)
        throw new GrowthActionError(
          "not_found",
          "Series not found for this brand.",
        );
      if (series.pillar && pillar && series.pillar !== pillar) {
        throw new GrowthActionError(
          "invalid_input",
          `This series belongs to ${series.pillar}; the promoted idea cannot use a conflicting pillar.`,
        );
      }
      pillar = series.pillar ?? pillar;
    }
    const result = await ContentService.promotePlatformPost({
      ...input,
      pillar,
      ownerId: ctx.userId,
      createdById: ctx.userId,
    });
    return {
      ok: true as const,
      ...result,
      url: `/app/content/${result.id}`,
    };
  },
});

export const deleteContentWorkItem = growthAction({
  outputSchema: deleteContentWorkItemOutputSchema,
  description:
    "Permanently delete one content idea and the owned drafts under it, including any email document. This is a real delete and cannot be undone; prefer setting status to archived when the work might still matter. Scraped posts are never deleted, they detach and stay as published history. A draft that already has a delivery record is refused.",
  inputSchema: z.object({ contentPostId: z.string() }),
  execute: async (input, ctx) => {
    const content = await requireContentWorkItem(input.contentPostId, ctx);
    const blocked = await deliveryBlockReason(
      content.platformPosts
        .filter((post) => post.source === "owned")
        .map((post) => post.id),
    );
    if (blocked) throw new GrowthActionError("invalid_input", blocked);
    const result = await ContentService.purgeIdea({
      contentPostId: content.id,
    });
    return {
      ok: true as const,
      action: "deleted" as const,
      idea: { id: result.id, title: result.title },
      spotsDeleted: result.spotsDeleted,
      scrapedDetached: result.scrapedDetached,
      url: "/app/content",
      next: "Say what was removed. Do not recreate it unless the operator asks.",
    };
  },
});

// Count of posts awaiting a human (draft + pending_review), used by the
// overview aggregator. Kept private — promote to a capability if needed.
export async function needsAttentionCount(orgId: string): Promise<number> {
  const brandIds = await orgBrandIds(orgId);
  if (brandIds.length === 0) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentPostTable)
    .where(
      and(
        inArray(contentPostTable.brandId, brandIds),
        inArray(contentPostTable.status, ["draft", "pending_review"]),
      ),
    );
  return row?.count ?? 0;
}
