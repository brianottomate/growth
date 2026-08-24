import "server-only";

import { z } from "zod";

import { growthAction, GrowthActionError } from "./types";
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
  assistantMessageTable,
  cadenceTargetTable,
  channelKindEnum,
  channelPlatformEnum,
  channelTable,
  connectionStatusEnum,
  mediaAssetTable,
  mediaVideoAnalysisTable,
  mixTargetTable,
  seriesTable,
} from "@/server/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { findLatestOwnedChatMedia } from "@/lib/chat-attachment";
import { MediaService } from "@/server/services/media.service";
import {
  replaceBrandMixTargets,
  replaceChannelCadence,
  replaceSeriesCadence,
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

export const discoverBrandChannels = growthAction({
  description:
    "Discover and verify official social handles for an owned or tracked brand, then save them as pending suggestions for human review. Use only when the operator asks to discover or refresh channels.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    await requireVisibleBrand(brandId, ctx);
    return discoverAndSaveSuggestions(brandId, { verify: true });
  },
});

export const scrapeBrandPosts = growthAction({
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

export const syncOwnedBrandContent = growthAction({
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

export const syncBrandWebsite = growthAction({
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

export const saveChatMediaToLibrary = growthAction({
  description:
    "Save pasted chat media (images, GIFs, or videos) into an owned brand's durable media library without needing a content work item, then auto-analyze each image against the brand's managed tag vocabulary so it arrives tagged. Use only when the operator explicitly asks to save, upload, or keep pasted media in the library or media pool. Pass the complete media array for the current turn; when the operator refers to attachments from an earlier turn, omit media and the server resolves the newest owned attachments in this conversation.",
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
        "Run managed-tag analysis on each saved image (videos and GIFs are stored untagged).",
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
    const saved = [];
    for (const item of media) {
      const asset = await MediaService.promoteChatMedia({
        brandId: brand.id,
        userId: ctx.userId,
        url: item.url,
        mimeType: item.mediaType,
        title: item.title,
      });
      // Tagging is best-effort — a failed analysis must not lose the save.
      let suggestedTags: string[] = [];
      let analyzed = false;
      if (input.autoAnalyze && asset.kind === "image") {
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
      saved.push({
        mediaAssetId: asset.id,
        kind: asset.kind,
        url: asset.url,
        analyzed,
        suggestedTags,
      });
    }
    return { ok: true as const, brandId: brand.id, saved, url: "/app/media" };
  },
});

export const listPublishingConnections = growthAction({
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

export const listMediaAnalyses = growthAction({
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
              eq(mediaAssetTable.kind, "image"),
              isNull(mediaAssetTable.deletedAt),
            ),
            orderBy: [desc(mediaAssetTable.updatedAt)],
            limit: 100,
          })
        : Promise.resolve([]),
    ]);
    return {
      videos,
      images: images.filter(
        (asset) =>
          asset.metadata &&
          typeof asset.metadata === "object" &&
          "aiAnalysis" in asset.metadata,
      ),
    };
  },
});

export const getMediaAnalysis = growthAction({
  description:
    "Read one saved image or durable video analysis by its canonical ID.",
  inputSchema: z.object({
    kind: z.enum(["image", "video"]),
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
    const asset = await db.query.mediaAssetTable.findFirst({
      where: and(
        eq(mediaAssetTable.id, analysisId),
        eq(mediaAssetTable.kind, "image"),
        isNull(mediaAssetTable.deletedAt),
      ),
    });
    if (!asset) throw new Error("Image analysis not found.");
    await requireOwnedBrand(asset.brandId, ctx);
    const metadata =
      asset.metadata && typeof asset.metadata === "object"
        ? asset.metadata
        : {};
    if (!("aiAnalysis" in metadata))
      throw new Error("That image has not been analyzed yet.");
    return { asset, analysis: metadata.aiAnalysis };
  },
});

export const proposeStrategyTargets = growthAction({
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
  description:
    "Create the first recurring cadence baseline for one owned publishing channel after the operator explicitly agrees to a proposed baseline. Supports every publishing platform documented in the input schema. This is a reversible configuration creation, so the operator's conversational instruction is sufficient and no second approval card is needed. Use only platform-valid archetypes.",
  inputSchema: channelCadenceInput,
  execute: async (input, ctx) => saveChannelCadence(input, ctx, "create"),
});

export const updateChannelCadence = growthAction({
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
  description:
    "Create the first brand-default pillar mix after proposing a complete 100% allocation and receiving explicit conversational agreement. This reversible configuration creation does not need a second approval card.",
  inputSchema: brandMixInput,
  execute: async (input, ctx) => saveBrandMix(input, ctx, "create"),
});

export const updateBrandMix = growthAction({
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
  connectionStatus: z.enum(connectionStatusEnum.enumValues).optional(),
});

export const registerBrandChannel = growthAction({
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
        connectionStatus: input.connectionStatus ?? "connected",
        followerHistory: [],
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
