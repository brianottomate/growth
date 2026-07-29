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
import { ContentService } from "@/server/services/content.service";
import { MediaService } from "@/server/services/media.service";
import { analyzeStoredMediaAsset } from "@/server/services/media-asset-analysis.service";
import {
  findLatestOwnedChatImages,
  type ChatImageReference,
} from "@/lib/chat-attachment";
import { getContentReadiness } from "@/lib/content-readiness";
import { platformFormatsFor } from "@/server/content/formats";
import { growthAction } from "./types";
import type { CapabilityContext } from "./types";
import { orgBrandIds } from "./brands";

const contentStatus = z.enum(contentStatusEnum.enumValues);

async function requireContentWorkItem(
  contentPostId: string,
  ctx: CapabilityContext,
) {
  const content = await db.query.contentPostTable.findFirst({
    where: and(
      eq(contentPostTable.id, contentPostId),
      isNull(contentPostTable.deletedAt),
    ),
    with: { brand: true, platformPosts: true, series: true },
  });
  if (!content || content.brand?.organizationId !== ctx.orgId) {
    throw new Error(
      "That content work item is not available in this organization.",
    );
  }
  return content;
}

export const getContentWorkItem = growthAction({
  description:
    "Read one canonical content work item with its brief, media pool, platform drafts, schedule, and deterministic production-readiness checklist. Call this FIRST when the active conversation is about finishing or refining a content item.",
  inputSchema: z.object({ contentPostId: z.string() }),
  execute: async ({ contentPostId }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    const readiness = getContentReadiness({
      hook: content.hook,
      status: content.status,
      spots: content.platformPosts.map((post) => ({
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
      platformPosts: content.platformPosts.map((post) => ({
        id: post.id,
        platform: post.platform,
        format: post.format,
        archetype: post.archetype,
        status: post.status,
        text: post.text,
        scheduledAt: post.scheduledAt,
        media: post.media ?? [],
        assetLinks: post.assetLinks ?? [],
      })),
      readiness,
      url: `/app/content/${content.id}`,
    };
  },
});

export const searchContentWorkItems = growthAction({
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
            ilike(platformPostTable.platform, pattern),
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
        }),
      )
      .max(12)
      .optional(),
  }),
  execute: async (input, ctx) => {
    const content = await requireContentWorkItem(input.contentPostId, ctx);
    const ownedById = new Map(
      content.platformPosts
        .filter((post) => post.source === "owned")
        .map((post) => [post.id, post]),
    );
    for (const draft of input.platformDrafts ?? []) {
      if (!ownedById.has(draft.platformPostId)) {
        throw new Error(
          "A selected platform draft is not part of this work item.",
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

export const addContentCrossPost = growthAction({
  description:
    "Add one or more agreed channel renderings to an existing canonical content work item. Creates empty owned drafts for the selected platforms; use updateContentWorkItem afterward to write channel-native copy.",
  inputSchema: z.object({
    contentPostId: z.string(),
    platforms: z.array(z.enum(channelPlatformEnum.enumValues)).min(1).max(8),
  }),
  execute: async ({ contentPostId, platforms }, ctx) => {
    const content = await requireContentWorkItem(contentPostId, ctx);
    const existing = new Set(
      content.platformPosts.map((post) => post.platform),
    );
    const additions = [...new Set(platforms)].filter(
      (platform) => !existing.has(platform),
    );
    await ContentService.addSpots(content.id, content.brandId, additions);
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
  description:
    "Turn ordered images already in a content work item's media pool into one or more owned platform carousels. Call getWorkItem first, preserve the operator's requested image order (or the pool order when they say all/these images), and provide the asset IDs separately for each target platform post so platform limits can differ.",
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
        throw new Error(
          "A selected platform post is not an owned draft on this work item.",
        );
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
        if (item.type !== "image") {
          throw new Error(`Media asset ${assetId} is not an image.`);
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

export const recoverArchiveMediaToContent = growthAction({
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
  description:
    "Create a new content idea — a draft on the /app/content board — for one of the org's brands. Search contentRead first when the operator may be referring to existing work, so this does not create a duplicate. Optionally seed the editorial brief (hook, captionDirection, ctaText, pillar, plannedAt) and fan it out to channels (instagram, tiktok, x, facebook, youtube, threads, pinterest, linkedin) as spots. This writes to the workspace: gather the essentials (which brand, a title, ideally a hook and channels), reflect the idea back in one line, and call it once the operator agrees. If you don't already have a brandId, call listBrands first. An idea can start from anything the operator gives you — turn that into the fields.",
  inputSchema: z.object({
    brandId: z
      .string()
      .describe("The brand to create under (id from listBrands)."),
    title: z.string().min(1).describe("Short, scannable idea title."),
    hook: z.string().optional().describe("The scroll-stopping first line."),
    captionDirection: z
      .string()
      .optional()
      .describe(
        "Caption / copy direction for the spots — a brief, not the final caption.",
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
      .describe("Channels to fan the idea out to as spots."),
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
      return {
        error:
          "That brand isn't in your organization (or doesn't exist). Call listBrands to get a valid brandId.",
      };
    }

    const { id } = await ContentService.createIdea({
      brandId: brand.id,
      title: input.title,
      hook: input.hook,
      captionDirection: input.captionDirection,
      ctaText: input.ctaText,
      pillar: input.pillar,
      plannedAt: input.plannedAt,
      platforms: input.platforms,
      ownerId: ctx.userId,
      createdById: ctx.userId,
    });

    return {
      ok: true as const,
      id,
      title: input.title,
      brandName: brand.name,
      platforms: input.platforms ?? [],
      url: id ? `/app/content/${id}` : null,
    };
  },
});

export const createPlatformPost = growthAction({
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
    if (!brand) return { error: "Owned brand not found." };
    if (input.referencePlatformPostId) {
      const reference = await db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.referencePlatformPostId),
        columns: { id: true },
      });
      if (!reference) return { error: "Reference platform post not found." };
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
      return { error: "Owned platform post not found." };
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
      return { error: "Owned platform post not found." };
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
      if (!series) return { error: "Series not found for this brand." };
      if (series.pillar && pillar && series.pillar !== pillar) {
        return {
          error: `This series belongs to ${series.pillar}; the promoted idea cannot use a conflicting pillar.`,
        };
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
