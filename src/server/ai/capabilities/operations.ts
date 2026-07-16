import "server-only";

import { z } from "zod";

import { growthTool } from "./types";
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
import {
  cadenceTargetTable,
  channelTable,
  mediaAssetTable,
  mixTargetTable,
} from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  replaceBrandMixTargets,
  replaceChannelCadence,
} from "@/server/services/cadence-target.service";
import { PILLARS } from "@/lib/pillars";
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

export const discoverBrandChannels = growthTool({
  description:
    "Discover and verify official social handles for an owned or tracked brand, then save them as pending suggestions for human review. Use only when the operator asks to discover or refresh channels.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    await requireVisibleBrand(brandId, ctx);
    return discoverAndSaveSuggestions(brandId, { verify: true });
  },
});

export const scrapeBrandPosts = growthTool({
  description:
    "Start an on-demand scrape of recent public posts for one owned or tracked brand and platform. The durable ingest run records progress and failures; new posts also receive pending classification suggestions.",
  inputSchema: z.object({
    brandId: z.string(),
    platform: socialPlatform,
    sinceDays: z.number().int().min(1).max(93).default(30),
  }),
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

export const syncOwnedBrandContent = growthTool({
  description:
    "Sync owned social history from the brand's connected providers into the canonical timeline. Use when the operator asks to refresh or backfill owned content.",
  inputSchema: z.object({
    brandId: z.string(),
    daysBack: z.number().int().min(1).max(730).default(90),
  }),
  execute: async ({ brandId, daysBack }, ctx) => {
    await requireOwnedBrand(brandId, ctx);
    return syncBrandContent({ brandId, daysBack });
  },
});

export const syncBrandWebsite = growthTool({
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

export const syncBrandBlog = growthTool({
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

export const proposeContentGroupings = growthTool({
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

export const analyzeMediaAsset = growthTool({
  description:
    "Analyze one ready image in an owned brand's media library using the brand's human-managed tag vocabulary. Saves literal visual analysis, suggested managed tags, alt text, and optional human steering; it does not invent a campaign strategy.",
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

export const listPublishingConnections = growthTool({
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

export const openTimelinePost = growthTool({
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

export const analyzeTimelineVideo = growthTool({
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

export const proposeStrategyTargets = growthTool({
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
    throw new Error(
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

export const createChannelCadence = growthTool({
  description:
    "Create the first recurring cadence baseline for one owned publishing channel after the operator explicitly agrees to a proposed baseline. Supports every publishing platform documented in the input schema. This is a reversible configuration creation, so the operator's conversational instruction is sufficient and no second approval card is needed. Use only platform-valid archetypes.",
  inputSchema: channelCadenceInput,
  execute: async (input, ctx) => saveChannelCadence(input, ctx, "create"),
});

export const updateChannelCadence = growthTool({
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
    throw new Error(
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

export const createBrandMix = growthTool({
  description:
    "Create the first brand-default pillar mix after proposing a complete 100% allocation and receiving explicit conversational agreement. This reversible configuration creation does not need a second approval card.",
  inputSchema: brandMixInput,
  execute: async (input, ctx) => saveBrandMix(input, ctx, "create"),
});

export const updateBrandMix = growthTool({
  description:
    "Replace an existing brand-default pillar mix with a complete 100% allocation. Explain the before/after change first; omitted pillars are removed.",
  inputSchema: brandMixInput,
  execute: async (input, ctx) => saveBrandMix(input, ctx, "update"),
});

export const OPERATION_TOOLS = {
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
  createChannelCadence,
  updateChannelCadence,
  createBrandMix,
  updateBrandMix,
} as const;
