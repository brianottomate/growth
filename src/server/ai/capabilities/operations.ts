import "server-only";

import { z } from "zod";

import { defineCapability } from "./types";
import { requireOwnedBrand, requireVisibleBrand } from "./brand-access";
import { discoverAndSaveSuggestions } from "@/server/services/social-discovery.service";
import {
  peerScrapeProviderFor,
  profileUrlForBrand,
  scrapeAndSuggest,
} from "@/server/services/peer-scrape.service";
import { syncBrandContent } from "@/server/services/content-sync.service";
import { syncBrandWebsite as syncWebsite } from "@/server/services/website-sync.service";
import { syncBrandBlog as syncBlog } from "@/server/services/blog-sync.service";
import { suggestGroupingsForBrand } from "@/server/services/content-grouping.service";
import { analyzeStoredMediaAsset } from "@/server/services/media-asset-analysis.service";
import { suggestTargets } from "@/server/services/cadence-suggest.service";
import { db } from "@/server/db";
import { channelTable, mediaAssetTable } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  failContentIngestRun,
  finishContentIngestRun,
  startContentIngestRun,
} from "@/server/services/platform-post-ingest.service";
import {
  assertPostVisibleToOrganization,
  prepareVideoAnalysis,
} from "@/server/services/video-analysis.service";

const socialPlatform = z.enum(["instagram", "facebook", "linkedin", "x"]);
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

export const discoverBrandChannels = defineCapability({
  name: "discoverBrandChannels",
  description:
    "Discover and verify official social handles for an owned or tracked brand, then save them as pending suggestions for human review. Use only when the operator asks to discover or refresh channels.",
  inputSchema: z.object({ brandId: z.string() }),
  readOnly: false,
  domain: "operations",
  execute: async ({ brandId }, ctx) => {
    await requireVisibleBrand(brandId, ctx);
    return discoverAndSaveSuggestions(brandId, { verify: true });
  },
});

export const scrapeBrandPosts = defineCapability({
  name: "scrapeBrandPosts",
  description:
    "Start an on-demand scrape of recent public posts for one owned or tracked brand and platform. The durable ingest run records progress and failures; new posts also receive pending classification suggestions.",
  inputSchema: z.object({
    brandId: z.string(),
    platform: socialPlatform,
    sinceDays: z.number().int().min(1).max(93).default(30),
  }),
  readOnly: false,
  domain: "operations",
  execute: async ({ brandId, platform, sinceDays }, ctx) => {
    await requireVisibleBrand(brandId, ctx);
    const profileUrl = await profileUrlForBrand(brandId, platform);
    if (!profileUrl)
      throw new Error(`Add the ${platform} profile URL before scraping.`);
    const provider = peerScrapeProviderFor(platform);
    if (!provider)
      throw new Error(`No configured scraper supports ${platform}.`);
    const requestedTo = new Date();
    const requestedFrom = new Date(
      requestedTo.getTime() - sinceDays * 86_400_000,
    );
    const runId = await startContentIngestRun({
      brandId,
      requestedById: ctx.userId,
      mode: "peer_scrape",
      provider,
      requestedFrom,
      requestedTo,
    });
    try {
      const result = await scrapeAndSuggest({
        brandId,
        platform,
        profileUrl,
        sinceDays,
        provider,
      });
      await finishContentIngestRun(runId, result, result.provider);
      return { runId, ...result, reviewUrl: "/app/review" };
    } catch (error) {
      await failContentIngestRun(runId, error);
      throw error;
    }
  },
});

export const syncOwnedBrandContent = defineCapability({
  name: "syncOwnedBrandContent",
  description:
    "Sync owned social history from the brand's connected providers into the canonical timeline. Use when the operator asks to refresh or backfill owned content.",
  inputSchema: z.object({
    brandId: z.string(),
    daysBack: z.number().int().min(1).max(730).default(90),
  }),
  readOnly: false,
  domain: "operations",
  execute: async ({ brandId, daysBack }, ctx) => {
    await requireOwnedBrand(brandId, ctx);
    return syncBrandContent({ brandId, daysBack });
  },
});

export const syncBrandWebsite = defineCapability({
  name: "syncBrandWebsite",
  description:
    "Refresh the structural website map from an owned brand's sitemap, including page-type rollups and lightweight metadata. This maps the surface; it does not create pages.",
  inputSchema: z.object({ brandId: z.string() }),
  readOnly: false,
  domain: "operations",
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    if (!brand.website)
      throw new Error("Add a website before syncing its map.");
    return syncWebsite({ brandId, website: brand.website });
  },
});

export const syncBrandBlog = defineCapability({
  name: "syncBrandBlog",
  description:
    "Refresh an owned brand's dated editorial stream from its discovered RSS or Atom feed. Use for explicit blog refresh requests.",
  inputSchema: z.object({ brandId: z.string() }),
  readOnly: false,
  domain: "operations",
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

export const proposeContentGroupings = defineCapability({
  name: "proposeContentGroupings",
  description:
    "Analyze an owned brand's existing posts and propose only two grouping outcomes: multiple channel executions/amplifications of one canonical idea, or multiple distinct ideas forming a series. Existing brand pillars may classify either outcome. It creates pending proposals that can be discussed and resolved in chat or Review.",
  inputSchema: z.object({
    brandId: z.string(),
    platforms: z.array(groupingPlatform).min(1),
    source: z.enum(["owned", "scraped"]).optional(),
  }),
  readOnly: false,
  domain: "operations",
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx);
    const result = await suggestGroupingsForBrand(input);
    return { ...result, reviewUrl: "/app/content/groupings" };
  },
});

export const analyzeMediaAsset = defineCapability({
  name: "analyzeMediaAsset",
  description:
    "Analyze one ready image in an owned brand's media library using the brand's human-managed tag vocabulary. Saves literal visual analysis, suggested managed tags, alt text, and optional human steering; it does not invent a campaign strategy.",
  inputSchema: z.object({
    mediaId: z.string(),
    steer: z.string().trim().max(500).optional(),
  }),
  readOnly: false,
  domain: "operations",
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

export const listPublishingConnections = defineCapability({
  name: "listPublishingConnections",
  description:
    "Read the owned publishing connections for one brand, including platform, handle, connection status, and delivery provider such as Zernio. Use this for questions like whether LinkedIn is connected, whether Zernio is configured for a brand, or where a channel will publish. This reads workspace connection metadata; it does not contact or modify the provider.",
  inputSchema: z.object({ brandId: z.string() }),
  readOnly: true,
  domain: "operations",
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

export const openTimelinePost = defineCapability({
  name: "openTimelinePost",
  description:
    "Open one exact timeline post in the workspace. Optionally select a media item and a reel view. Use when the operator asks to inspect, show, open, or navigate to a specific post or reel.",
  inputSchema: z.object({
    platformPostId: z.string(),
    mediaIndex: z.number().int().min(0).max(20).default(0),
    view: z
      .enum(["video", "carousel", "grid", "transcript", "analysis"])
      .optional(),
  }),
  readOnly: true,
  domain: "operations",
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

export const analyzeTimelineVideo = defineCapability({
  name: "analyzeTimelineVideo",
  description:
    "Prepare one timeline video for permanent browser-local storyboard analysis, then navigate the operator to the exact reel and start it. This is approval-gated because it copies the source video and persists derived boards, transcript, and creative analysis.",
  inputSchema: z.object({
    platformPostId: z.string(),
    mediaIndex: z.number().int().min(0).max(20).default(0),
  }),
  readOnly: false,
  domain: "operations",
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

export const proposeStrategyTargets = defineCapability({
  name: "proposeStrategyTargets",
  description:
    "Compare an owned brand's current cadence and mix targets with recent own performance and tracked-peer behavior. Returns evidence-backed target changes without saving them, so the human can review what the system learned before applying strategy changes.",
  inputSchema: z.object({ brandId: z.string() }),
  readOnly: true,
  domain: "operations",
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const result = await suggestTargets(brandId);
    return {
      ...result,
      strategyUrl: brand.slug ? `/app/brands/${brand.slug}` : "/app/brands",
    };
  },
});

export const OPERATION_CAPABILITIES = [
  discoverBrandChannels,
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
];
