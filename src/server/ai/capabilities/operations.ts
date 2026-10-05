import {
  discoverBrandChannelsOutputSchema,
  scrapeBrandPostsOutputSchema,
  syncOwnedBrandContentOutputSchema,
  syncBrandWebsiteOutputSchema,
  syncBrandBlogOutputSchema,
  proposeContentGroupingsOutputSchema,
  analyzeMediaAssetOutputSchema,
  saveChatMediaToLibraryOutputSchema,
  listPublishingConnectionsOutputSchema,
  openTimelinePostOutputSchema,
  analyzeTimelineVideoOutputSchema,
  getSharedSessionOutputSchema,
  listMediaLibraryOutputSchema,
  listMediaAnalysesOutputSchema,
  getMediaAnalysisOutputSchema,
  proposeStrategyTargetsOutputSchema,
  getStrategyTargetsOutputSchema,
  createChannelCadenceOutputSchema,
  updateChannelCadenceOutputSchema,
  createBrandMixOutputSchema,
  updateBrandMixOutputSchema,
  setSeriesCadenceOutputSchema,
  registerBrandChannelOutputSchema,
} from "./outputs/operations";
import "server-only";
import { primaryHomeIds } from "@/server/services/home-groups.service";

import { z } from "zod";

import { growthAction, GrowthActionError } from "./types";
import { requireOwnedBrand, requireVisibleBrand } from "./brand-access";
import { discoverAndSaveSuggestions } from "@/server/services/social-discovery.service";
import {
  ScrapeSetupError,
  scrapeBrandChannel,
} from "@/server/services/peer-scrape.service";
import { syncBrandContent } from "@/server/services/content-sync.service";
import {
  failContentIngestRun,
  finishContentIngestRun,
  startContentIngestRun,
} from "@/server/services/platform-post-ingest.service";
import { syncBrandWebsite as syncWebsite } from "@/server/services/website-sync.service";
import { syncBrandBlog as syncBlog } from "@/server/services/blog-sync.service";
import { suggestGroupingsForBrand } from "@/server/services/content-grouping.service";
import { analyzeStoredMediaAsset } from "@/server/services/media-asset-analysis.service";
import { suggestTargets } from "@/server/services/cadence-suggest.service";
import { db } from "@/server/db";
import {
  assistantMessageTable,
  assistantThreadTable,
  cadenceTargetTable,
  channelKindEnum,
  channelPlatformEnum,
  channelTable,
  connectionStatusEnum,
  homeTable,
  mediaAssetTable,
  mediaVideoAnalysisTable,
  mixTargetTable,
  seriesTable,
} from "@/server/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { findLatestOwnedChatMedia } from "@/lib/chat-attachment";
import { MediaService } from "@/server/services/media.service";
import {
  findImportedImage,
  importRemoteImage,
} from "@/server/services/media.service";
import {
  brandListings,
  normalizeListingUrl,
} from "@/server/services/wanderos-listings.service";
import {
  replaceBrandMixTargets,
  replaceChannelCadence,
  replaceSeriesCadence,
} from "@/server/services/cadence-target.service";
import { PILLARS } from "@/lib/pillars";
import {
  assertPostVisibleToOrganization,
  prepareVideoAnalysis,
} from "@/server/services/video-analysis.service";

const socialPlatform = z.enum(["instagram", "facebook", "linkedin", "x"]);
const cadencePlatform = z.enum([
  "instagram",
  "facebook",
  "linkedin",
  "x",
  "tiktok",
  "youtube",
  "threads",
  "pinterest",
  "blog",
  "newsletter",
]);
const groupingPlatform = z.enum([
  "instagram",
  "facebook",
  "linkedin",
  "x",
  "tiktok",
  "youtube",
  "blog",
  "newsletter",
  "other",
]);

const cadenceTargetFields = {
  count: z.number().int().min(0).max(100),
  period: z.enum(["day", "week", "month"]),
};
const channelCadenceInput = z.object({
  brandId: z.string(),
  platform: cadencePlatform.describe(
    "Channel to configure. Valid archetypes: instagram=image|carousel|video_short|story; x=text|thread|video_short; linkedin=text|image|video_long|carousel|article; facebook=text|image|video_long|video_short|story; tiktok=video_short|carousel; youtube=video_short|video_long; threads=text|thread; pinterest=image|carousel; blog=article; newsletter=article.",
  ),
  targets: z
    .array(
      z.object({
        archetype: z.enum([
          "image",
          "carousel",
          "video_short",
          "story",
          "text",
          "thread",
          "video_long",
          "article",
        ]),
        ...cadenceTargetFields,
      }),
    )
    .min(1)
    .max(8)
    .describe(
      "The complete desired cadence. On X, image-bearing tweets use text; reposts and quotes are amplification actions. Blog and newsletter support article only.",
    ),
});
const brandMixInput = z.object({
  brandId: z.string(),
  targets: z
    .array(
      z.object({
        pillar: z
          .string()
          .min(1)
          .describe("Exact pillar slug returned by nextForBrand."),
        targetPct: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(12)
    .describe(
      "Complete brand-default content mix. Percentages must total 100.",
    ),
});

export const discoverBrandChannels = growthAction({
  outputSchema: discoverBrandChannelsOutputSchema,
  description:
    "Discover official social handles for an owned or tracked brand from its website and web search, then save them as pending, unverified suggestions with confidence and source evidence for review. Confirm a suggestion by reading its profile URL, or accept it and run a small scrape, which proves the profile exists. Use only when the operator asks to discover or refresh channels.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    await requireVisibleBrand(brandId, ctx);
    return discoverAndSaveSuggestions(brandId);
  },
});

export const scrapeBrandPosts = growthAction({
  outputSchema: scrapeBrandPostsOutputSchema,
  description:
    "Pull recent public posts for one owned or tracked brand and platform into the canonical timeline. Use limit=5 first to confirm a channel is wired up cheaply (scraping bills per record; Instagram always returns its latest ~12), then a larger limit and sinceDays for a real backfill. The durable ingest run records progress and failures; new posts also receive pending classification suggestions.",
  inputSchema: z.object({
    brandId: z.string(),
    platform: socialPlatform,
    sinceDays: z.number().int().min(1).max(93).default(30),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  execute: async ({ brandId, platform, sinceDays, limit }, ctx) => {
    await requireVisibleBrand(brandId, ctx);
    try {
      const result = await scrapeBrandChannel({
        brandId,
        platform,
        sinceDays,
        limit,
        requestedById: ctx.userId,
      });
      return { ...result, reviewUrl: "/app/review" };
    } catch (error) {
      if (error instanceof ScrapeSetupError)
        throw new GrowthActionError(
          error.code === "missing_profile_url"
            ? "invalid_input"
            : "provider_unavailable",
          error.message,
        );
      throw error;
    }
  },
});

export const syncOwnedBrandContent = growthAction({
  outputSchema: syncOwnedBrandContentOutputSchema,
  description:
    "Sync owned social history from the brand's connected providers into the canonical timeline. Use when the operator asks to refresh or backfill owned content.",
  inputSchema: z.object({
    brandId: z.string(),
    daysBack: z.number().int().min(1).max(730).default(90),
  }),
  execute: async ({ brandId, daysBack }, ctx) => {
    await requireOwnedBrand(brandId, ctx);
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - daysBack);
    const runId = await startContentIngestRun({
      brandId,
      requestedById: ctx.userId,
      mode: "owned_backfill",
      provider: "zernio+x_api",
      requestedFrom: from,
      requestedTo: to,
    });
    try {
      const result = await syncBrandContent({ brandId, daysBack });
      await finishContentIngestRun(runId, result);
      return { runId, ...result };
    } catch (error) {
      await failContentIngestRun(runId, error);
      throw error;
    }
  },
});

export const syncBrandWebsite = growthAction({
  outputSchema: syncBrandWebsiteOutputSchema,
  description:
    "Refresh the structural website map from an owned brand's sitemap, including page-type rollups and lightweight metadata. This maps the surface; it does not create pages.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    if (!brand.website)
      throw new Error("Add a website before syncing its map.");
    return syncWebsite({ brandId, website: brand.website });
  },
});

export const syncBrandBlog = growthAction({
  outputSchema: syncBrandBlogOutputSchema,
  description:
    "Refresh an owned brand's dated editorial stream from its discovered RSS or Atom feed. Use for explicit blog refresh requests.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    if (!brand.website)
      throw new Error("Add a website before syncing its blog.");
    return syncBlog({
      brandId,
      brandName: brand.name,
      website: brand.website,
    });
  },
});

export const proposeContentGroupings = growthAction({
  outputSchema: proposeContentGroupingsOutputSchema,
  description:
    "Analyze an owned brand's existing posts and propose only two grouping outcomes: multiple channel executions/amplifications of one canonical idea, or multiple distinct ideas forming a series. Existing brand pillars may classify either outcome. It creates pending proposals that can be discussed and resolved in chat or Review.",
  inputSchema: z.object({
    brandId: z.string(),
    platforms: z.array(groupingPlatform).min(1),
    source: z.enum(["owned", "scraped"]).optional(),
  }),
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx);
    const result = await suggestGroupingsForBrand(input);
    return { ...result, reviewUrl: "/app/content/groupings" };
  },
});

export const analyzeMediaAsset = growthAction({
  outputSchema: analyzeMediaAssetOutputSchema,
  description:
    "Analyze one ready image or video in an owned brand's media library using the brand's human-managed tag vocabulary. Saves literal visual analysis, suggested managed tags, alt text, and optional human steering; for video it also saves the transcript and a creative teardown (summary, hook, structure, pacing, key beats, reusable lessons), read from the storyboard cut at upload. It does not invent a campaign strategy.",
  inputSchema: z.object({
    mediaId: z.string(),
    steer: z.string().trim().max(500).optional(),
  }),
  execute: async ({ mediaId, steer }, ctx) => {
    const asset = await db.query.mediaAssetTable.findFirst({
      where: eq(mediaAssetTable.id, mediaId),
      columns: { brandId: true },
    });
    if (!asset) throw new Error("Media asset not found.");
    const brand = await requireOwnedBrand(asset.brandId, ctx);
    return analyzeStoredMediaAsset({ mediaId, brandName: brand.name, steer });
  },
});

export const saveChatMediaToLibrary = growthAction({
  outputSchema: saveChatMediaToLibraryOutputSchema,
  description:
    "Save pasted chat media (images, GIFs, or videos) into an owned brand's durable media library without needing a content work item, then auto-analyze each image and video against the brand's managed tag vocabulary so it arrives tagged (video also gets a transcript and creative teardown). Use only when the operator explicitly asks to save, upload, or keep pasted media in the library or media pool. Pass the complete media array for the current turn; when the operator refers to attachments from an earlier turn, omit media and the server resolves the newest owned attachments in this conversation.",
  inputSchema: z.object({
    brandId: z.string(),
    media: z
      .array(
        z.object({
          url: z.string().url(),
          mimeType: z.string().min(1),
          title: z.string().trim().min(1).max(300).optional(),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
    autoAnalyze: z
      .boolean()
      .default(true)
      .describe(
        "Run managed-tag analysis on each saved image and video (GIFs are stored untagged). Video also gets a transcript and creative teardown, and takes longer.",
      ),
  }),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    let media: Array<{ url: string; mediaType: string; title?: string }> =
      input.media?.map((item) => ({
        url: item.url,
        mediaType: item.mimeType,
        title: item.title,
      })) ?? [];
    if (media.length === 0 && ctx.threadId) {
      const rows = await db.query.assistantMessageTable.findMany({
        where: eq(assistantMessageTable.threadId, ctx.threadId),
        columns: { message: true },
        orderBy: [desc(assistantMessageTable.createdAt)],
        limit: 30,
      });
      media = findLatestOwnedChatMedia(
        rows.map((row) => row.message).reverse(),
        ctx.userId,
      );
    }
    const seen = new Set<string>();
    media = media.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    if (media.length === 0) {
      throw new Error(
        "No user-owned media attachments are available in this conversation.",
      );
    }
    const assets = [];
    for (const item of media) {
      assets.push(
        await MediaService.promoteChatMedia({
          brandId: brand.id,
          userId: ctx.userId,
          url: item.url,
          mimeType: item.mediaType,
          title: item.title,
        }),
      );
    }
    // Tagging is best-effort — a failed analysis must not lose the save. Runs
    // in parallel because a video analysis transcribes and reads several
    // boards, and five clips in series would not fit the request.
    const saved = await Promise.all(
      assets.map(async (asset) => {
        let suggestedTags: string[] = [];
        let analyzed = false;
        if (
          input.autoAnalyze &&
          (asset.kind === "image" || asset.kind === "video")
        ) {
          try {
            const analysis = await analyzeStoredMediaAsset({
              mediaId: asset.id,
              brandName: brand.name,
            });
            suggestedTags = analysis.tags;
            analyzed = true;
          } catch {
            analyzed = false;
          }
        }
        return {
          mediaAssetId: asset.id,
          kind: asset.kind,
          url: asset.url,
          // Video needs its poster passed to adsWrite.draftAd, so return it
          // here rather than making the model go and look the asset up again.
          thumbnailUrl: asset.thumbnailUrl,
          analyzed,
          suggestedTags,
        };
      }),
    );
    return { ok: true as const, brandId: brand.id, saved, url: "/app/media" };
  },
});

export const listPublishingConnections = growthAction({
  outputSchema: listPublishingConnectionsOutputSchema,
  description:
    "Read the owned publishing connections for one brand, including platform, handle, connection status, and delivery provider such as Zernio. Use this for questions like whether LinkedIn is connected, whether Zernio is configured for a brand, or where a channel will publish. This reads workspace connection metadata; it does not contact or modify the provider.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const channels = await db.query.channelTable.findMany({
      where: and(
        eq(channelTable.brandId, brand.id),
        eq(channelTable.isActive, true),
        isNull(channelTable.deletedAt),
      ),
      columns: {
        id: true,
        kind: true,
        platform: true,
        handle: true,
        displayName: true,
        connectionStatus: true,
        defaultProvider: true,
        externalId: true,
      },
    });
    return {
      brand: { id: brand.id, name: brand.name },
      zernioProfileConnected: Boolean(brand.zernioProfileId),
      channels: channels.map((channel) => ({
        ...channel,
        providerAccountConnected: Boolean(channel.externalId),
        // The opaque provider account ID is intentionally not sent to the model.
        externalId: undefined,
      })),
      channelsUrl: "/app/channels",
    };
  },
});

export const openTimelinePost = growthAction({
  outputSchema: openTimelinePostOutputSchema,
  description:
    "Open one exact timeline post in Growth. Optionally select a media item and a reel view. Use when the operator asks to inspect, show, open, or navigate to a specific post or reel.",
  inputSchema: z.object({
    platformPostId: z.string(),
    mediaIndex: z.number().int().min(0).max(20).default(0),
    view: z
      .enum(["video", "carousel", "grid", "transcript", "analysis"])
      .optional(),
  }),
  execute: async ({ platformPostId, mediaIndex, view }, ctx) => {
    await assertPostVisibleToOrganization(platformPostId, ctx.orgId);
    const params = new URLSearchParams({ post: platformPostId });
    if (view) {
      params.set("media", String(mediaIndex));
      params.set("view", view);
    }
    return {
      action: "navigate" as const,
      href: `/app/feed-v5?${params.toString()}`,
      platformPostId,
      mediaIndex,
      view,
    };
  },
});

export const analyzeTimelineVideo = growthAction({
  outputSchema: analyzeTimelineVideoOutputSchema,
  description:
    "Prepare one timeline video for permanent browser-local storyboard analysis, then navigate the operator to the exact reel and start it. Use only after an explicit request because it copies the source video and persists derived boards, transcript, and creative analysis.",
  inputSchema: z.object({
    platformPostId: z.string(),
    mediaIndex: z.number().int().min(0).max(20).default(0),
  }),
  execute: async ({ platformPostId, mediaIndex }, ctx) => {
    const prepared = await prepareVideoAnalysis({
      organizationId: ctx.orgId,
      platformPostId,
      mediaIndex,
      userId: ctx.userId,
    });
    const ready = prepared.analysis.status === "ready";
    const params = new URLSearchParams({
      post: platformPostId,
      media: String(mediaIndex),
      view: ready ? "analysis" : "grid",
    });
    if (!ready) params.set("action", "analyze");
    return {
      action: "navigate" as const,
      href: `/app/feed-v5?${params.toString()}`,
      analysisId: prepared.analysis.id,
      status: prepared.analysis.status,
      note: ready
        ? "The permanent analysis already exists."
        : "The durable source is ready; the operator's browser will render and persist the storyboard.",
    };
  },
});

/**
 * Read one SHARED assistant session by id.
 *
 * Shared only, and inside the organization. A private session stays private
 * even from an agent its owner is talking to, which is the whole point of the
 * visibility flag — so this refuses rather than widening the rule that
 * creativeWork.getThread applies for the owner's own UI.
 */
export const getSharedSession = growthAction({
  outputSchema: getSharedSessionOutputSchema,
  description:
    "Read one shared assistant session by its ath_ id: its title and the messages in order, with each tool call named. Use when the operator refers to another session by id. Private sessions are refused — only sessions explicitly shared inside the organization can be read.",
  inputSchema: z.object({
    sessionId: z
      .string()
      .trim()
      .min(1)
      .describe("The ath_ id shown under the session title."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Most recent messages to return."),
  }),
  execute: async ({ sessionId, limit }, ctx) => {
    const thread = await db.query.assistantThreadTable.findFirst({
      where: and(
        eq(assistantThreadTable.id, sessionId),
        eq(assistantThreadTable.organizationId, ctx.orgId),
        eq(assistantThreadTable.visibility, "shared"),
      ),
      columns: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    if (!thread) {
      throw new Error(
        "No shared session with that id in this organization. A private session cannot be read; its owner has to share it first.",
      );
    }
    const rows = await db.query.assistantMessageTable.findMany({
      where: eq(assistantMessageTable.threadId, thread.id),
      orderBy: [desc(assistantMessageTable.createdAt)],
      limit,
    });
    return {
      session: thread,
      messages: rows.reverse().map((row) => {
        const parts = (row.message.parts ?? []) as Array<{
          type: string;
          text?: string;
          state?: string;
        }>;
        return {
          role: row.message.role,
          text: parts
            .filter((part) => part.type === "text")
            .map((part) => part.text ?? "")
            .join("\n\n"),
          // Named rather than dumped: the full tool payloads would swamp the
          // conversation this is being read into.
          toolCalls: parts
            .filter((part) => part.type.startsWith("tool-"))
            .map((part) => ({
              tool: part.type.slice("tool-".length),
              state: part.state ?? null,
            })),
        };
      }),
    };
  },
});

/** How many recent assets an in-memory search scans. */
const SEARCH_WINDOW = 200;

/**
 * The library as an operator sees it.
 *
 * mediaAnalysisRead.list is NOT this: it returns saved *analyses*, and its
 * image branch filters to assets carrying `aiAnalysis` metadata. Analysis in
 * saveChatMedia is best-effort, so an asset whose analysis failed is stored
 * and then invisible — which is why "use the image from the media library"
 * had nothing to reach for.
 */
export const listMediaLibrary = growthAction({
  outputSchema: listMediaLibraryOutputSchema,
  description:
    "List the most recent media-library assets for an owned brand, newest first, each with the url an ad creative or content attachment takes. This is the library itself, not saved analyses — reach for it whenever the operator says to use, pick, or reuse something already saved. Search scans a recent window rather than the whole library; the result says so when it was truncated. Assets with no resolvable url are counted separately and left out, since they cannot be used.",
  inputSchema: z.object({
    brandId: z.string(),
    kind: z
      .enum(["image", "video", "gif", "audio", "file"])
      .optional()
      .describe("Narrow to one kind. Ad creatives want image."),
    search: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("Case-insensitive match on title, alt text, or a tag."),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  execute: async ({ brandId, kind, search, limit }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const rows = await db.query.mediaAssetTable.findMany({
      where: and(
        eq(mediaAssetTable.brandId, brand.id),
        eq(mediaAssetTable.status, "ready"),
        eq(mediaAssetTable.reviewStatus, "approved"),
        isNull(mediaAssetTable.deletedAt),
        ...(kind ? [eq(mediaAssetTable.kind, kind)] : []),
      ),
      orderBy: [desc(mediaAssetTable.createdAt)],
      // Search is applied in memory over the recent window: tags are jsonb and
      // the library is small enough per brand that a LIKE across three shapes
      // is not worth the query.
      limit: search ? SEARCH_WINDOW : limit,
    });
    const needle = search?.toLowerCase();
    const matched = needle
      ? rows.filter((asset) =>
          [asset.title, asset.alt, ...(asset.tags ?? [])]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(needle)),
        )
      : rows;
    // Legacy Cloudflare Stream rows carry a streamUid and neither url nor
    // externalUrl. Handing one back would break the promise this capability
    // exists to keep, so they are excluded — and counted, because silently
    // dropping rows is how a list starts lying about the library.
    const usable = matched.filter((asset) => asset.url ?? asset.externalUrl);
    const assets = usable.slice(0, limit);
    return {
      brandId: brand.id,
      returned: assets.length,
      matchedInWindow: usable.length,
      unusable: matched.length - usable.length,
      // Search reads the newest SEARCH_WINDOW assets, not the whole library,
      // so an older match can be missed. Say when that is possible.
      searchTruncated: Boolean(needle) && rows.length === SEARCH_WINDOW,
      assets: assets.map((asset) => ({
        mediaAssetId: asset.id,
        kind: asset.kind,
        /** Pass this straight to an ad creative or content attachment. */
        url: (asset.url ?? asset.externalUrl)!,
        thumbnailUrl: asset.thumbnailUrl,
        title: asset.title,
        alt: asset.alt,
        tags: asset.tags ?? [],
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
        createdAt: asset.createdAt,
      })),
    };
  },
});

export const listMediaAnalyses = growthAction({
  outputSchema: listMediaAnalysesOutputSchema,
  description:
    "List saved image and durable video analyses visible to the organization, optionally narrowed to one owned brand.",
  inputSchema: z.object({ brandId: z.string().optional() }),
  execute: async ({ brandId }, ctx) => {
    if (brandId) await requireOwnedBrand(brandId, ctx);
    const [videos, images] = await Promise.all([
      db.query.mediaVideoAnalysisTable.findMany({
        where: and(
          eq(mediaVideoAnalysisTable.organizationId, ctx.orgId),
          ...(brandId ? [eq(mediaVideoAnalysisTable.brandId, brandId)] : []),
        ),
        orderBy: [desc(mediaVideoAnalysisTable.updatedAt)],
        limit: 100,
      }),
      brandId
        ? db.query.mediaAssetTable.findMany({
            where: and(
              eq(mediaAssetTable.brandId, brandId),
              // Video as well as image. `analyzeImage` analyzes both and
              // writes the result to the asset's own `aiAnalysis` metadata,
              // so filtering to images here made an analyzed library CLIP
              // unlistable — and the durable table below never holds it,
              // because that one is keyed to a timeline post. Five analyzed
              // videos read back as "not found" from both branches at once.
              inArray(mediaAssetTable.kind, ["image", "video"]),
              isNull(mediaAssetTable.deletedAt),
            ),
            orderBy: [desc(mediaAssetTable.updatedAt)],
            limit: 100,
          })
        : Promise.resolve([]),
    ]);
    const analyzed = images.filter(
      (asset) =>
        asset.metadata &&
        typeof asset.metadata === "object" &&
        "aiAnalysis" in asset.metadata,
    );
    return {
      /** Storyboard analyses of timeline posts, keyed by their own id. */
      videos,
      /** Kept for callers that already read `images`. */
      images: analyzed.filter((asset) => asset.kind === "image"),
      /**
       * Library assets carrying their own analysis, clips included. Read one
       * with `get` using `kind: "asset"` and the mediaAssetId.
       */
      assets: analyzed.map((asset) => ({
        mediaAssetId: asset.id,
        kind: asset.kind,
        title: asset.title,
        alt: asset.alt,
        url: asset.url,
        updatedAt: asset.updatedAt,
      })),
    };
  },
});

export const getMediaAnalysis = growthAction({
  outputSchema: getMediaAnalysisOutputSchema,
  description:
    "Read one saved image or durable video analysis by its canonical ID.",
  inputSchema: z.object({
    kind: z
      .enum(["image", "video", "asset"])
      .describe(
        '"video" is a durable storyboard analysis of a timeline post, by its analysis id. "asset" is a library asset\'s own analysis — image OR clip — by its mediaAssetId. "image" is the older name for that and still works.',
      ),
    analysisId: z.string(),
  }),
  execute: async ({ kind, analysisId }, ctx) => {
    if (kind === "video") {
      const analysis = await db.query.mediaVideoAnalysisTable.findFirst({
        where: and(
          eq(mediaVideoAnalysisTable.id, analysisId),
          eq(mediaVideoAnalysisTable.organizationId, ctx.orgId),
        ),
      });
      if (!analysis) throw new Error("Video analysis not found.");
      return analysis;
    }
    // Either kind: the analysis lives on the asset, and a clip analyzed
    // through `analyzeImage` was previously unreachable from here.
    const asset = await db.query.mediaAssetTable.findFirst({
      where: and(
        eq(mediaAssetTable.id, analysisId),
        inArray(mediaAssetTable.kind, ["image", "video"]),
        isNull(mediaAssetTable.deletedAt),
      ),
    });
    if (!asset) throw new Error("No analyzable library asset with that id.");
    await requireOwnedBrand(asset.brandId, ctx);
    const metadata =
      asset.metadata && typeof asset.metadata === "object"
        ? asset.metadata
        : {};
    if (!("aiAnalysis" in metadata)) {
      throw new Error("That asset has not been analyzed yet.");
    }
    return { asset, analysis: metadata.aiAnalysis };
  },
});

export const proposeStrategyTargets = growthAction({
  outputSchema: proposeStrategyTargetsOutputSchema,
  description:
    "Compare an owned brand's current cadence and mix targets with recent own performance and tracked-peer behavior. Returns evidence-backed target changes without saving them, so the human can review what the system learned before applying strategy changes.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const result = await suggestTargets(brandId);
    return {
      ...result,
      strategyUrl: brand.slug ? `/app/brands/${brand.slug}` : "/app/brands",
    };
  },
});

export const getStrategyTargets = growthAction({
  outputSchema: getStrategyTargetsOutputSchema,
  description:
    "Read the current channel cadence and brand-default content-mix targets for one owned brand.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const [cadence, mix] = await Promise.all([
      db.query.cadenceTargetTable.findMany({
        where: and(
          eq(cadenceTargetTable.brandId, brandId),
          eq(cadenceTargetTable.isActive, true),
          isNull(cadenceTargetTable.deletedAt),
        ),
      }),
      db.query.mixTargetTable.findMany({
        where: and(
          eq(mixTargetTable.brandId, brandId),
          eq(mixTargetTable.isActive, true),
          isNull(mixTargetTable.channelId),
        ),
      }),
    ]);
    return { brand: { id: brand.id, name: brand.name }, cadence, mix };
  },
});

async function saveChannelCadence(
  input: z.infer<typeof channelCadenceInput>,
  ctx: Parameters<typeof requireOwnedBrand>[1],
  mode: "create" | "update",
) {
  const { brandId, platform, targets } = input;
  const brand = await requireOwnedBrand(brandId, ctx);
  const channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, brandId),
      eq(channelTable.platform, platform),
      eq(channelTable.isActive, true),
      isNull(channelTable.deletedAt),
    ),
    columns: { id: true, handle: true },
  });
  if (!channel)
    throw new Error(`${brand.name} does not have a ${platform} channel.`);

  const existing = await db.query.cadenceTargetTable.findMany({
    where: and(
      eq(cadenceTargetTable.channelId, channel.id),
      eq(cadenceTargetTable.isActive, true),
      isNull(cadenceTargetTable.deletedAt),
      isNull(cadenceTargetTable.template),
    ),
    columns: { id: true },
  });
  if (mode === "create" && existing.length > 0) {
    throw new Error(
      `${brand.name}'s ${platform} cadence already exists. Read the current targets and use updateChannelCadence to change it.`,
    );
  }
  if (mode === "update" && existing.length === 0) {
    // `conflict`, matching the "already exists" guard above, which only grades
    // that way because its message happens to contain the word "already". The
    // state disagrees with the action the model chose, and the message names the
    // action that fits, so "read the current state and decide" is the right
    // steer. Left untyped this graded `tool_failed` and told it to stop.
    throw new GrowthActionError(
      "conflict",
      `${brand.name}'s ${platform} channel has no cadence yet. Use createChannelCadence to establish it.`,
    );
  }

  const saved = await replaceChannelCadence({
    brandId,
    channelId: channel.id,
    platform,
    targets,
  });
  return {
    ok: true as const,
    action: "saved" as const,
    change: mode === "create" ? ("created" as const) : ("updated" as const),
    brand: brand.name,
    platform,
    handle: channel.handle,
    targets: saved,
    channelsUrl: "/app/channels",
    calendarUrl: `/app/calendar?brand=${brandId}`,
    next: "Preview the two-week or monthly slot plan before creating slots.",
  };
}

export const createChannelCadence = growthAction({
  outputSchema: createChannelCadenceOutputSchema,
  description:
    "Create the first recurring cadence baseline for one owned publishing channel after the operator explicitly agrees to a proposed baseline. Supports every publishing platform documented in the input schema. This is a reversible configuration creation, so the operator's conversational instruction is sufficient and no second approval card is needed. Use only platform-valid archetypes.",
  inputSchema: channelCadenceInput,
  execute: async (input, ctx) => saveChannelCadence(input, ctx, "create"),
});

export const updateChannelCadence = growthAction({
  outputSchema: updateChannelCadenceOutputSchema,
  description:
    "Replace an existing owned publishing-channel cadence with a complete reviewed target set. Supports every publishing platform documented in the input schema. Use only after reading the current cadence and explaining the before/after change; omitted formats are removed.",
  inputSchema: channelCadenceInput,
  execute: async (input, ctx) => saveChannelCadence(input, ctx, "update"),
});

async function saveBrandMix(
  input: z.infer<typeof brandMixInput>,
  ctx: Parameters<typeof requireOwnedBrand>[1],
  mode: "create" | "update",
) {
  const brand = await requireOwnedBrand(input.brandId, ctx);
  const allowedPillars = new Set(
    PILLARS.filter((pillar) => pillar.brandSlug === brand.slug).map(
      (pillar) => pillar.slug,
    ),
  );
  for (const target of input.targets) {
    if (!allowedPillars.has(target.pillar)) {
      throw new Error(`${target.pillar} is not a ${brand.name} pillar.`);
    }
  }

  const existing = await db.query.mixTargetTable.findMany({
    where: and(
      eq(mixTargetTable.brandId, input.brandId),
      eq(mixTargetTable.isActive, true),
      isNull(mixTargetTable.channelId),
    ),
    columns: { id: true },
  });
  if (mode === "create" && existing.length > 0) {
    throw new Error(
      `${brand.name}'s content mix already exists. Use updateBrandMix to change it.`,
    );
  }
  if (mode === "update" && existing.length === 0) {
    // Same asymmetry as the cadence pair: the "already exists" branch above is
    // graded by accident, this one was not graded at all.
    throw new GrowthActionError(
      "conflict",
      `${brand.name} has no content mix yet. Use createBrandMix to establish it.`,
    );
  }

  const targets = await replaceBrandMixTargets(input);
  return {
    ok: true as const,
    action: "saved" as const,
    change: mode === "create" ? ("created" as const) : ("updated" as const),
    brand: brand.name,
    targets,
    channelsUrl: "/app/channels",
    next: "Complete missing channel cadences, then preview the slot plan.",
  };
}

export const createBrandMix = growthAction({
  outputSchema: createBrandMixOutputSchema,
  description:
    "Create the first brand-default pillar mix after proposing a complete 100% allocation and receiving explicit conversational agreement. This reversible configuration creation does not need a second approval card.",
  inputSchema: brandMixInput,
  execute: async (input, ctx) => saveBrandMix(input, ctx, "create"),
});

export const updateBrandMix = growthAction({
  outputSchema: updateBrandMixOutputSchema,
  description:
    "Replace an existing brand-default pillar mix with a complete 100% allocation. Explain the before/after change first; omitted pillars are removed.",
  inputSchema: brandMixInput,
  execute: async (input, ctx) => saveBrandMix(input, ctx, "update"),
});

const seriesCadenceInput = z.object({
  brandId: z.string(),
  seriesId: z.string(),
  targets: z
    .array(
      z.object({
        platform: cadencePlatform,
        archetype: z.enum([
          "image",
          "carousel",
          "video_short",
          "story",
          "text",
          "thread",
          "video_long",
          "article",
        ]),
        ...cadenceTargetFields,
      }),
    )
    .min(1)
    .max(8)
    .describe(
      "The series' complete recurring rhythm across channels (replaces any prior series cadence). Each entry targets one owned channel by platform.",
    ),
});

export const setSeriesCadence = growthAction({
  outputSchema: setSeriesCadenceOutputSchema,
  description:
    "Set an editorial series' own recurring publishing rhythm (e.g. one blog article and one Instagram video_short per week). Replaces the series' prior cadence; channel baselines are untouched. The slot generator then creates series-attached slots carrying the series' pillar.",
  inputSchema: seriesCadenceInput,
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const series = await db.query.seriesTable.findFirst({
      where: and(
        eq(seriesTable.id, input.seriesId),
        eq(seriesTable.brandId, input.brandId),
        isNull(seriesTable.deletedAt),
      ),
      columns: { id: true, name: true },
    });
    if (!series)
      throw new Error(`That series does not belong to ${brand.name}.`);

    const targets = [];
    for (const target of input.targets) {
      const channel = await db.query.channelTable.findFirst({
        where: and(
          eq(channelTable.brandId, input.brandId),
          eq(channelTable.platform, target.platform),
          eq(channelTable.isActive, true),
          isNull(channelTable.deletedAt),
        ),
        columns: { id: true },
      });
      if (!channel)
        throw new Error(
          `${brand.name} does not have a ${target.platform} channel.`,
        );
      targets.push({ ...target, channelId: channel.id });
    }
    const saved = await replaceSeriesCadence({
      brandId: input.brandId,
      seriesId: input.seriesId,
      targets,
    });
    return {
      ok: true as const,
      series: series.name,
      targets: saved,
      url: "/app/pillars",
    };
  },
});

const registerChannelInput = z.object({
  brandId: z.string(),
  kind: z.enum(channelKindEnum.enumValues),
  platform: z.enum(channelPlatformEnum.enumValues),
  handle: z.string().trim().min(1).max(200).optional(),
  displayName: z.string().trim().max(200).optional(),
  profileUrl: z.string().trim().url().max(2000).optional(),
  manageUrl: z.string().trim().url().max(2000).optional(),
  profileImageUrl: z.string().trim().url().max(2000).optional(),
  connectionStatus: z.enum(connectionStatusEnum.enumValues).optional(),
  followerCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Followers as seen now; starts the channel's follower history."),
});

export const registerBrandChannel = growthAction({
  outputSchema: registerBrandChannelOutputSchema,
  description:
    "Register an owned publishing channel (social handle, blog, or newsletter) for a brand so it is tracked in Growth. Registration only records the surface — delivery-provider wiring (e.g. Zernio) is connected later from the Channels page. Use when the user names a handle or channel URL that is not yet tracked.",
  inputSchema: registerChannelInput,
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx);
    const duplicate = await db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.brandId, input.brandId),
        eq(channelTable.platform, input.platform),
        isNull(channelTable.deletedAt),
        ...(input.handle ? [eq(channelTable.handle, input.handle)] : []),
      ),
      columns: { id: true, handle: true },
    });
    if (duplicate) {
      return {
        ok: false as const,
        reason: `A ${input.platform} channel${duplicate.handle ? ` (${duplicate.handle})` : ""} already exists for this brand.`,
        channelId: duplicate.id,
        url: "/app/channels",
      };
    }
    const [created] = await db
      .insert(channelTable)
      .values({
        brandId: input.brandId,
        kind: input.kind,
        platform: input.platform,
        handle: input.handle ?? null,
        displayName: input.displayName ?? null,
        profileUrl: input.profileUrl ?? null,
        manageUrl: input.manageUrl ?? null,
        profileImageUrl: input.profileImageUrl ?? null,
        connectionStatus: input.connectionStatus ?? "connected",
        followerHistory:
          input.followerCount === undefined
            ? []
            : [
                {
                  count: input.followerCount,
                  capturedAt: new Date().toISOString(),
                },
              ],
        followerCount: input.followerCount ?? null,
      })
      .returning({
        id: channelTable.id,
        platform: channelTable.platform,
        handle: channelTable.handle,
        connectionStatus: channelTable.connectionStatus,
      });
    return { ok: true as const, channel: created, url: "/app/channels" };
  },
});

export const OPERATION_TOOLS = {
  discoverBrandChannels,
  registerBrandChannel,
  scrapeBrandPosts,
  syncOwnedBrandContent,
  syncBrandWebsite,
  syncBrandBlog,
  proposeContentGroupings,
  analyzeMediaAsset,
  listPublishingConnections,
  openTimelinePost,
  analyzeTimelineVideo,
  proposeStrategyTargets,
  createChannelCadence,
  updateChannelCadence,
  setSeriesCadence,
  createBrandMix,
  updateBrandMix,
} as const;

const listingPhotoShape = z.object({
  /** The home's row: what performanceWrite.updateHome and brandWrite.update take. Null before the brand is ingested. */
  homeId: z.string().nullable(),
  /** The WanderOS listing id: what adsWrite.buildAdSet takes. */
  listingId: z.string(),
  name: z.string(),
  url: z.string(),
  imageUrl: z.string(),
  thumbUrl: z.string(),
  place: z.string(),
  /** Set when this hero is already in the library; use it instead of importing. */
  mediaAssetId: z.string().nullable(),
  /** Already picked on the Performance setup page. */
  featured: z.boolean(),
  /** The photo the home's ads lead with, set at ingestion from the site's cover. */
  heroSourceUrl: z.string().nullable(),
});

/**
 * The brand's homes as their WanderOS site lists them, with the hero photo of
 * each. Read-only: a look before anything enters the library.
 */
export const listListingPhotos = growthAction({
  description:
    "The homes on an owned brand's WanderOS site with each one's homeId, listing id, feed cover URL, its hero photo, and whether it is already featured, straight from the site's feed. Search by home name, listing ID or URL with query; paginate with offset/nextOffset to reach the whole portfolio. One unfiltered call returns up to 100 homes, so read the portfolio once rather than paging or searching home by home. Nothing is imported. Use it to see what there is to work with, then mediaLibraryWrite.importListingPhotos for the ones worth keeping, or adsWrite.draftAdsFromHomes to turn them into cards in one step. Empty for a brand whose website is not a WanderOS site.",
  inputSchema: z.object({
    brandId: z.string(),
    query: z.string().trim().max(200).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(100),
  }),
  outputSchema: z.object({
    brandId: z.string(),
    hasSite: z.boolean(),
    homes: z.array(listingPhotoShape),
    total: z.number(),
    nextOffset: z.number().nullable(),
  }),
  execute: async ({ brandId, limit, query, offset }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const matching = (
      await brandListings({ id: brand.id, website: brand.website })
    )
      .filter((row) => row.imageUrl)
      .filter(
        (row) =>
          !query ||
          `${row.name} ${row.id} ${row.url}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      );
    const listings = matching.slice(offset, offset + limit);
    const [imported, homeRows, primary] = await Promise.all([
      Promise.all(
        listings.map((row) =>
          findImportedImage({ brandId: brand.id, url: row.imageUrl! }),
        ),
      ),
      db.query.homeTable.findMany({
        where: and(
          eq(homeTable.brandId, brand.id),
          isNull(homeTable.deletedAt),
        ),
        columns: {
          id: true,
          externalId: true,
          heroSourceUrl: true,
        },
      }),
      primaryHomeIds(brand.id),
    ]);
    const rowByListing = new Map(homeRows.map((row) => [row.externalId, row]));
    return {
      brandId: brand.id,
      hasSite: Boolean(brand.website),
      total: matching.length,
      nextOffset:
        offset + listings.length < matching.length
          ? offset + listings.length
          : null,
      homes: listings.map((row, index) => ({
        homeId: rowByListing.get(row.id)?.id ?? null,
        listingId: row.id,
        name: row.name,
        url: row.url,
        imageUrl: row.imageUrl!,
        thumbUrl: row.thumbUrl ?? row.imageUrl!,
        place: [row.city, row.state].filter(Boolean).join(", "),
        mediaAssetId: imported[index]?.id ?? null,
        featured: primary.has(rowByListing.get(row.id)?.id ?? ""),
        heroSourceUrl: rowByListing.get(row.id)?.heroSourceUrl ?? null,
      })),
    };
  },
});

/**
 * Import chosen listing heroes into the library. Idempotent per photo URL, so
 * a home already imported comes back rather than doubling.
 */
export const importListingPhotos = growthAction({
  description:
    "Import the hero photos of an owned brand's homes into its media library, by listing URL. Omit listingUrls to import the first `limit` homes on the feed. Idempotent per photo: a hero already in the library is returned, not imported twice. Each result carries the mediaAssetId a composition or ad creative takes.",
  inputSchema: z.object({
    brandId: z.string(),
    listingUrls: z
      .array(z.string().url())
      .max(24)
      .optional()
      .describe("Listing page URLs from mediaLibraryRead.listingPhotos."),
    limit: z.number().int().min(1).max(24).default(6),
  }),
  outputSchema: z.object({
    brandId: z.string(),
    imported: z.number(),
    reused: z.number(),
    assets: z.array(
      z.object({
        mediaAssetId: z.string(),
        url: z.string().nullable(),
        name: z.string(),
        listingUrl: z.string(),
      }),
    ),
    notes: z.array(z.string()),
  }),
  execute: async ({ brandId, listingUrls, limit }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const listings = (
      await brandListings({ id: brand.id, website: brand.website })
    ).filter((row) => row.imageUrl);
    const notes: string[] = [];
    let chosen = listings.slice(0, limit);
    if (listingUrls?.length) {
      const byUrl = new Map(
        listings.map((row) => [normalizeListingUrl(row.url), row] as const),
      );
      chosen = listingUrls.flatMap((url) => {
        const row = byUrl.get(normalizeListingUrl(url));
        if (!row) notes.push(`${url} is not on the listing feed right now.`);
        return row ? [row] : [];
      });
    }
    if (chosen.length === 0) {
      throw new GrowthActionError(
        "not_found",
        "No homes with photos to import. Check the brand's website is a WanderOS site, or pass listing URLs from mediaLibraryRead.listingPhotos.",
      );
    }
    let imported = 0;
    let reused = 0;
    const assets = [];
    // Sequential: each import is a download and an R2 write.
    for (const row of chosen) {
      const existing = await findImportedImage({
        brandId: brand.id,
        url: row.imageUrl!,
      });
      const asset =
        existing ??
        (await importRemoteImage({
          brandId: brand.id,
          uploadedBy: ctx.userId,
          url: row.imageUrl!,
          title: row.name,
        }));
      if (existing) reused += 1;
      else imported += 1;
      assets.push({
        mediaAssetId: asset.id,
        url: asset.url,
        name: row.name,
        listingUrl: row.url,
      });
    }
    return { brandId: brand.id, imported, reused, assets, notes };
  },
});
