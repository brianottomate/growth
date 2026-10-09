import { mediaKindEnum } from "@/server/db/media-schema";
import { mediaStatusEnum } from "@/server/db/media-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { connectionStatusEnum } from "@/server/db/channel-schema";
import { channelKindEnum } from "@/server/db/channel-schema";
import {
  libraryMediaAnalysisSchema,
  timelineVideoAnalysisSchema,
} from "./media-analysis";
import { z } from "zod";
import { jsonValueSchema } from "../../kernel/output";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const boardItemSchema = z.strictObject({
  firstFrame: z.number(),
  height: z.number(),
  index: z.number(),
  lastFrame: z.number(),
  pathname: z.string(),
  url: z.string(),
  width: z.number(),
});

const storyboardSchema = z.strictObject({
  boards: z.array(boardItemSchema),
  durationMs: z.number(),
  frames: z.array(
    z.strictObject({
      boardIndex: z.number(),
      column: z.number(),
      index: z.number(),
      row: z.number(),
      timestampMs: z.number(),
    }),
  ),
  gridSize: z.number(),
  sampleIntervalMs: z.number(),
});

const imageItemSchema = z.strictObject({
  alt: z.string().nullable(),
  brandId: z.string(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  duration: z.number().nullable(),
  externalUrl: z.string().nullable(),
  filename: z.string().nullable(),
  folderId: z.string().nullable(),
  height: z.number().nullable(),
  id: z.string(),
  kind: z.enum(mediaKindEnum.enumValues),
  metadata: z
    .object({ aiAnalysis: libraryMediaAnalysisSchema.optional() })
    .catchall(jsonValueSchema)
    .nullable(),
  mimeType: z.string().nullable(),
  provider: z.enum(["external", "r2", "stream"]),
  reviewStatus: z.enum(["suggested", "approved", "rejected"]),
  discoveredSourceUrl: z.string().nullable(),
  r2Key: z.string().nullable(),
  size: z.number().nullable(),
  sourceMediaIndex: z.number().nullable(),
  sourcePlatformPostId: z.string().nullable(),
  sourceProvider: z.string().nullable(),
  status: z.enum(mediaStatusEnum.enumValues),
  storyboard: storyboardSchema.nullable(),
  streamUid: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  thumbnailUrl: z.string().nullable(),
  title: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  uploadedBy: z.string().nullable(),
  url: z.string().nullable(),
  width: z.number().nullable(),
});

const videoItemSchema = z.strictObject({
  analysis: timelineVideoAnalysisSchema.nullable(),
  artifactsSavedAt: z.iso.datetime().nullable(),
  boards: z.array(boardItemSchema).nullable(),
  brandId: z.string(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  durationMs: z.number().nullable(),
  error: z.string().nullable(),
  frameCount: z.number().nullable(),
  frames: z
    .array(
      z.strictObject({
        boardIndex: z.number(),
        column: z.number(),
        index: z.number(),
        row: z.number(),
        timestampMs: z.number(),
      }),
    )
    .nullable(),
  gridSize: z.number().nullable(),
  id: z.string(),
  organizationId: z.string(),
  platformPostId: z.string(),
  rendererVersion: z.number(),
  sampleIntervalMs: z.number().nullable(),
  sourceMediaIndex: z.number(),
  sourceUrl: z.string(),
  status: z.enum(["error", "ready", "processing"]),
  transcriptError: z.string().nullable(),
  transcriptLanguage: z.string().nullable(),
  transcriptText: z.string().nullable(),
  transcriptWords: z
    .array(
      z.strictObject({
        endMs: z.number(),
        startMs: z.number(),
        text: z.string(),
      }),
    )
    .nullable(),
  updatedAt: z.iso.datetime(),
});

const createChannelCadenceSchema = z.strictObject({
  action: z.literal("saved"),
  brand: z.string(),
  calendarUrl: z.string(),
  change: z.enum(["created", "updated"]),
  channelsUrl: z.string(),
  handle: z.string().nullable(),
  next: z.string(),
  ok: z.literal(true),
  platform: z.enum([
    "linkedin",
    "newsletter",
    "blog",
    "instagram",
    "x",
    "facebook",
    "youtube",
    "tiktok",
    "threads",
    "pinterest",
  ]),
  targets: z.array(
    z.strictObject({
      archetype: z.string(),
      count: z.number(),
      period: z.enum(["day", "week", "month"]),
    }),
  ),
});

const createBrandMixSchema = z.strictObject({
  action: z.literal("saved"),
  brand: z.string(),
  change: z.enum(["created", "updated"]),
  channelsUrl: z.string(),
  next: z.string(),
  ok: z.literal(true),
  targets: z.array(
    z.strictObject({
      period: z.enum(["day", "week", "month"]),
      pillar: z.string(),
      targetPct: z.number(),
    }),
  ),
});

export const discoverBrandChannelsOutputSchema = z.strictObject({
  brandId: z.string(),
  discovered: z.number(),
  enrichedBrand: z.boolean(),
  inserted: z.number(),
  skippedRejected: z.number(),
  suggestions: z.array(
    z.strictObject({
      acceptedChannelId: z.string().nullable(),
      brandId: z.string(),
      confidence: z.number().nullable(),
      createdAt: z.iso.datetime(),
      followerCount: z.number().nullable(),
      handle: z.string(),
      id: z.string(),
      isOfficial: z.boolean().nullable(),
      platform: z.enum(channelPlatformEnum.enumValues),
      profileImageUrl: z.string().nullable(),
      profileUrl: z.string().nullable(),
      reasoning: z.string().nullable(),
      reviewedAt: z.iso.datetime().nullable(),
      reviewedById: z.string().nullable(),
      sources: z.array(z.string()).nullable(),
      status: z.enum(["pending", "accepted", "rejected"]),
      updatedAt: z.iso.datetime(),
      verified: z.boolean().nullable(),
      verifiedAt: z.iso.datetime().nullable(),
      verifyError: z.string().nullable(),
    }),
  ),
  updated: z.number(),
  verified: z.number(),
});

export const scrapeBrandPostsOutputSchema = z.strictObject({
  amplificationResolved: z.number(),
  amplificationSuggestions: z.number(),
  classificationSuggestions: z.number(),
  inserted: z.number(),
  limit: z.number(),
  platform: z.enum(["linkedin", "instagram", "x", "facebook"]),
  provider: z.enum(["brightdata", "apify"]),
  rehosted: z.number(),
  reviewUrl: z.string(),
  runId: z.string(),
  scanned: z.number(),
  sinceDays: z.number().nullable(),
  skippedExisting: z.number(),
  updatedExisting: z.number(),
});

export const syncOwnedBrandContentOutputSchema = z.strictObject({
  brandId: z.string(),
  byPlatform: z.record(z.string(), z.number()),
  candidates: z.number(),
  errors: z.array(z.string()),
  inserted: z.number(),
  rehosted: z.number(),
  runId: z.string(),
  updated: z.number(),
  videosRehosted: z.number(),
});

export const syncBrandWebsiteOutputSchema = z.strictObject({
  discovered: z.number(),
  rollups: z.number(),
  sitemapUrl: z.string(),
  stored: z.number(),
});

export const syncBrandBlogOutputSchema = z.strictObject({
  articles: z.number(),
  feedUrl: z.string(),
  inserted: z.number(),
  updated: z.number(),
});

export const proposeContentGroupingsOutputSchema = z.strictObject({
  groups: z.number(),
  posts: z.number(),
  reviewUrl: z.string(),
  suggestions: z.number(),
});

export const analyzeMediaAssetOutputSchema = libraryMediaAnalysisSchema;

export const saveChatMediaToLibraryOutputSchema = z.strictObject({
  brandId: z.string(),
  ok: z.literal(true),
  saved: z.array(
    z.strictObject({
      analyzed: z.boolean(),
      kind: z.enum(mediaKindEnum.enumValues),
      mediaAssetId: z.string(),
      suggestedTags: z.array(z.string()),
      thumbnailUrl: z.string().nullable(),
      url: z.string().nullable(),
    }),
  ),
  url: z.string(),
});

export const listPublishingConnectionsOutputSchema = z.strictObject({
  brand: z.strictObject({ id: z.string(), name: z.string() }),
  channels: z.array(
    z.strictObject({
      connectionStatus: z.enum(connectionStatusEnum.enumValues),
      defaultProvider: z
        .enum([
          "zernio",
          "customerio",
          "instantly",
          "hubspot",
          "native",
          "manual",
          "email_forward",
          "postmark",
          "resend",
          "outreach",
        ])
        .nullable(),
      displayName: z.string().nullable(),
      handle: z.string().nullable(),
      id: z.string(),
      kind: z.enum(channelKindEnum.enumValues),
      platform: z.enum(channelPlatformEnum.enumValues),
      providerAccountConnected: z.boolean(),
    }),
  ),
  channelsUrl: z.string(),
  zernioProfileConnected: z.boolean(),
});

export const openTimelinePostOutputSchema = z.strictObject({
  action: z.literal("navigate"),
  href: z.string(),
  mediaIndex: z.number(),
  platformPostId: z.string(),
  view: z
    .enum(["video", "carousel", "analysis", "grid", "transcript"])
    .optional(),
});

export const analyzeTimelineVideoOutputSchema = z.strictObject({
  action: z.literal("navigate"),
  analysisId: z.string(),
  href: z.string(),
  note: z.string(),
  status: z.enum(["error", "ready", "processing"]),
});

export const getSharedSessionOutputSchema = z.strictObject({
  messages: z.array(
    z.strictObject({
      role: z.enum(["user", "assistant", "system"]),
      text: z.string(),
      toolCalls: z.array(
        z.strictObject({ state: z.string().nullable(), tool: z.string() }),
      ),
    }),
  ),
  session: z.strictObject({
    createdAt: z.iso.datetime(),
    id: z.string(),
    title: z.string(),
    updatedAt: z.iso.datetime(),
  }),
});

export const listMediaLibraryOutputSchema = z.strictObject({
  assets: z.array(
    z.strictObject({
      alt: z.string().nullable(),
      createdAt: z.iso.datetime(),
      height: z.number().nullable(),
      kind: z.enum(mediaKindEnum.enumValues),
      mediaAssetId: z.string(),
      mimeType: z.string().nullable(),
      tags: z.array(z.string()),
      thumbnailUrl: z.string().nullable(),
      title: z.string().nullable(),
      url: z.string(),
      width: z.number().nullable(),
    }),
  ),
  brandId: z.string(),
  matchedInWindow: z.number(),
  returned: z.number(),
  searchTruncated: z.boolean(),
  unusable: z.number(),
});

export const listMediaAnalysesOutputSchema = z.strictObject({
  assets: z.array(
    z.strictObject({
      alt: z.string().nullable(),
      kind: z.enum(mediaKindEnum.enumValues),
      mediaAssetId: z.string(),
      title: z.string().nullable(),
      updatedAt: z.iso.datetime(),
      url: z.string().nullable(),
    }),
  ),
  images: z.array(imageItemSchema),
  videos: z.array(videoItemSchema),
});

export const getMediaAnalysisOutputSchema = z.union([
  videoItemSchema,
  z.strictObject({
    analysis: libraryMediaAnalysisSchema,
    asset: imageItemSchema,
  }),
]);

export const proposeStrategyTargetsOutputSchema = z.strictObject({
  evidence: z.strictObject({
    ownPosts: z.number(),
    peerBrands: z.number(),
    peerDataAgeDays: z.number().nullable(),
    peerPosts: z.number(),
    windowDays: z.number(),
  }),
  strategyUrl: z.string(),
  suggestions: z.array(
    z.strictObject({
      archetype: z.string().nullable(),
      basis: z.enum(["peer_benchmark", "own_performance", "both"]),
      channelId: z.string().nullable(),
      confidence: z.number(),
      current: z.number().nullable(),
      kind: z.enum(["mix", "cadence"]),
      period: z.string().nullable(),
      pillar: z.string().nullable(),
      platform: z.string().nullable(),
      proposed: z.number(),
      rationale: z.string(),
    }),
  ),
});

export const getStrategyTargetsOutputSchema = z.strictObject({
  brand: z.strictObject({ id: z.string(), name: z.string() }),
  cadence: z.array(
    z.strictObject({
      archetype: z.string(),
      brandId: z.string(),
      channelId: z.string(),
      count: z.number(),
      createdAt: z.iso.datetime(),
      deletedAt: z.iso.datetime().nullable(),
      id: z.string(),
      isActive: z.boolean(),
      notes: z.string().nullable(),
      period: z.enum(["day", "week", "month"]),
      platform: z.enum(channelPlatformEnum.enumValues),
      seriesId: z.string().nullable(),
      template: z.string().nullable(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  mix: z.array(
    z.strictObject({
      brandId: z.string(),
      channelId: z.string().nullable(),
      createdAt: z.iso.datetime(),
      id: z.string(),
      isActive: z.boolean(),
      notes: z.string().nullable(),
      period: z.enum(["day", "week", "month"]),
      pillar: z.string(),
      targetPct: z.number(),
      updatedAt: z.iso.datetime(),
    }),
  ),
});

export const createChannelCadenceOutputSchema = createChannelCadenceSchema;

export const updateChannelCadenceOutputSchema = createChannelCadenceSchema;

export const createBrandMixOutputSchema = createBrandMixSchema;

export const updateBrandMixOutputSchema = createBrandMixSchema;

export const setSeriesCadenceOutputSchema = z.strictObject({
  ok: z.literal(true),
  series: z.string(),
  targets: z.array(
    z.strictObject({
      archetype: z.string(),
      count: z.number(),
      period: z.enum(["day", "week", "month"]),
      platform: z.enum(channelPlatformEnum.enumValues),
    }),
  ),
  url: z.string(),
});

export const registerBrandChannelOutputSchema = z.union([
  z.strictObject({
    channelId: z.string(),
    ok: z.literal(false),
    reason: z.string(),
    url: z.string(),
  }),
  z.strictObject({
    channel: z
      .strictObject({
        connectionStatus: z.enum(connectionStatusEnum.enumValues),
        handle: z.string().nullable(),
        id: z.string(),
        platform: z.enum(channelPlatformEnum.enumValues),
      })
      .optional(),
    ok: z.literal(true),
    url: z.string(),
  }),
]);

/** Native service result; the existing wire contract validates its JSON projection. */
export const discoverBrandChannelsNativeResultSchema =
  discoverBrandChannelsOutputSchema.extend({
    suggestions: z.array(
      discoverBrandChannelsOutputSchema.shape.suggestions.element.extend({
        createdAt: z.date(),
        reviewedAt: z.date().nullable(),
        updatedAt: z.date(),
        verifiedAt: z.date().nullable(),
      }),
    ),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const getSharedSessionNativeResultSchema =
  getSharedSessionOutputSchema.extend({
    session: getSharedSessionOutputSchema.shape.session.extend({
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const listMediaLibraryNativeResultSchema =
  listMediaLibraryOutputSchema.extend({
    assets: z.array(
      listMediaLibraryOutputSchema.shape.assets.element.extend({
        createdAt: z.date(),
      }),
    ),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const listMediaAnalysesNativeResultSchema =
  listMediaAnalysesOutputSchema.extend({
    assets: z.array(
      listMediaAnalysesOutputSchema.shape.assets.element.extend({
        updatedAt: z.date(),
      }),
    ),
    images: z.array(
      listMediaAnalysesOutputSchema.shape.images.element.extend({
        createdAt: z.date(),
        deletedAt: z.date().nullable(),
        metadata:
          listMediaAnalysesOutputSchema.shape.images.element.shape.metadata
            .unwrap()
            .catchall(z.unknown())
            .nullable(),
        updatedAt: z.date(),
      }),
    ),
    videos: z.array(
      listMediaAnalysesOutputSchema.shape.videos.element.extend({
        artifactsSavedAt: z.date().nullable(),
        completedAt: z.date().nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    ),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const getMediaAnalysisNativeResultSchema = z.union([
  getMediaAnalysisOutputSchema.options[0].extend({
    artifactsSavedAt: z.date().nullable(),
    completedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
  getMediaAnalysisOutputSchema.options[1].extend({
    asset: getMediaAnalysisOutputSchema.options[1].shape.asset.extend({
      createdAt: z.date(),
      deletedAt: z.date().nullable(),
      metadata:
        getMediaAnalysisOutputSchema.options[1].shape.asset.shape.metadata
          .unwrap()
          .catchall(z.unknown())
          .nullable(),
      updatedAt: z.date(),
    }),
  }),
]);

/** Native service result; the existing wire contract validates its JSON projection. */
export const getStrategyTargetsNativeResultSchema =
  getStrategyTargetsOutputSchema.extend({
    cadence: z.array(
      getStrategyTargetsOutputSchema.shape.cadence.element.extend({
        createdAt: z.date(),
        deletedAt: z.date().nullable(),
        updatedAt: z.date(),
      }),
    ),
    mix: z.array(
      getStrategyTargetsOutputSchema.shape.mix.element.extend({
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    ),
  });
