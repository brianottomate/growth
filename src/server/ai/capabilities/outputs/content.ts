import { contentStatusEnum } from "@/server/db/content-schema";
import { connectionStatusEnum } from "@/server/db/channel-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { mediaKindEnum } from "@/server/db/media-schema";
import { libraryMediaAnalysisSchema } from "./media-analysis";
import {
  productionQueueResultSchema,
  upcomingContentResultSchema,
} from "./shared";
import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const publishSettingsSchema = z.strictObject({
  coverUrl: z.string().optional(),
  coverOffsetMs: z.number().optional(),
  shareToFeed: z.boolean().optional(),
  trial: z.enum(["MANUAL", "SS_PERFORMANCE"]).optional(),
  collaborators: z.array(z.string()).optional(),
  title: z.string().optional(),
  isAiGenerated: z.boolean().optional(),
});

const mediaItemSchema = z.strictObject({
  assetId: z.string().optional(),
  derivedFrom: z.string().optional(),
  height: z.number().optional(),
  thumbnail: z.string().optional(),
  type: z.enum(["image", "video", "carousel"]),
  url: z.string(),
  width: z.number().optional(),
});

const analysisSchema = libraryMediaAnalysisSchema.options[0];

const finishContentMediaUploadsSchema = z.strictObject({
  contentPostId: z.string(),
  mediaAssetIds: z.array(z.string()),
  mediaCount: z.number(),
  next: z.string(),
  ok: z.literal(true),
  url: z.string(),
});

const statusCountSchema = z.strictObject({
  count: z.number(),
  status: z.enum(contentStatusEnum.enumValues),
});

export const getContentWorkItemOutputSchema = z.strictObject({
  brand: z.strictObject({ id: z.string(), name: z.string() }),
  brief: z.strictObject({
    captionDirection: z.string().nullable(),
    ctaKeyword: z.string().nullable(),
    ctaText: z.string().nullable(),
    hook: z.string().nullable(),
    kpi: z.string().nullable(),
    visualDirection: z.string().nullable(),
  }),
  id: z.string(),
  media: z.array(mediaItemSchema),
  pillar: z.string().nullable(),
  plannedAt: z.iso.datetime().nullable(),
  platformPosts: z.array(
    z.strictObject({
      archetype: z.string().nullable(),
      assetLinks: z.array(z.string()),
      channel: z
        .strictObject({
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
        })
        .nullable(),
      deliveryError: z.string().nullable(),
      deliveryExternalId: z.string().nullable(),
      deliveryStatus: z.string().nullable(),
      deliveryUpdatedAt: z.iso.datetime().nullable(),
      firstComment: z.string().nullable(),
      firstCommentError: z.string().nullable(),
      firstCommentStatus: z.string().nullable(),
      firstCommentUpdatedAt: z.iso.datetime().nullable(),
      publishSettings: publishSettingsSchema.nullable(),
      format: z.string().nullable(),
      id: z.string(),
      media: z.array(mediaItemSchema),
      platform: z.enum(channelPlatformEnum.enumValues),
      provider: z
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
      scheduledAt: z.iso.datetime().nullable(),
      status: z.enum(contentStatusEnum.enumValues),
      text: z.string().nullable(),
      threadItems: z.array(
        z.strictObject({
          assetLinks: z.array(z.string()),
          id: z.string(),
          media: z.array(mediaItemSchema),
          sequence: z.number(),
          text: z.string().nullable(),
        }),
      ),
    }),
  ),
  readiness: z.strictObject({
    checks: z.array(
      z.strictObject({
        complete: z.boolean(),
        detail: z.string(),
        id: z.string(),
        label: z.string(),
      }),
    ),
    completed: z.number(),
    next: z
      .strictObject({
        complete: z.boolean(),
        detail: z.string(),
        id: z.string(),
        label: z.string(),
      })
      .nullable(),
    readyForReview: z.boolean(),
    total: z.number(),
  }),
  series: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
  status: z.enum(contentStatusEnum.enumValues),
  title: z.string().nullable(),
  url: z.string(),
});

export const searchContentWorkItemsOutputSchema = z.strictObject({
  ideas: z.array(
    z.strictObject({
      brandId: z.string(),
      brandName: z.string(),
      hook: z.string().nullable(),
      id: z.string(),
      pillar: z.string().nullable(),
      status: z.enum(contentStatusEnum.enumValues),
      title: z.string().nullable(),
      updatedAt: z.iso.datetime(),
      url: z.string(),
    }),
  ),
  platformPosts: z.array(
    z.strictObject({
      brandName: z.string(),
      contentPostId: z.string().nullable(),
      contentTitle: z.string(),
      format: z.string().nullable(),
      id: z.string(),
      platform: z.enum(channelPlatformEnum.enumValues),
      status: z.enum(contentStatusEnum.enumValues),
      text: z.string().nullable(),
      url: z.string(),
    }),
  ),
});

export const updateContentWorkItemOutputSchema = z.strictObject({
  contentPostId: z.string(),
  ok: z.literal(true),
  updatedPlatformPosts: z.array(z.string()),
  url: z.string(),
});

export const setPlatformPostPublishSettingsOutputSchema = z.strictObject({
  platformPostId: z.string(),
  publishSettings: publishSettingsSchema.nullable(),
});

export const setPlatformPostFirstCommentOutputSchema = z.strictObject({
  firstCommentStatus: z.string().nullable(),
  platformPostId: z.string(),
});

export const setPlatformPostThreadOutputSchema = z.strictObject({
  contentPostId: z.string(),
  ok: z.literal(true),
  platform: z.enum(["x", "threads"]),
  platformPostId: z.string(),
  platformPostIds: z.array(z.string()),
  postCount: z.number(),
  url: z.string(),
});

export const addContentCrossPostOutputSchema = z.strictObject({
  added: z.array(z.enum(channelPlatformEnum.enumValues)),
  contentPostId: z.string(),
  ok: z.literal(true),
  skipped: z.array(z.enum(channelPlatformEnum.enumValues)),
  url: z.string(),
});

export const attachChatImageToContentOutputSchema = z.strictObject({
  analyses: z.array(
    z.union([
      z.strictObject({
        analysis: z.union([
          analysisSchema,
          z.strictObject({
            altText: z.string(),
            analyzedAt: z.string(),
            description: z.string(),
            evidence: z.enum(["storyboard", "poster"]),
            hook: z.string(),
            keyBeats: z.array(
              z.strictObject({
                description: z.string(),
                frameNumber: z.number(),
                role: z.enum([
                  "development",
                  "hook",
                  "turn",
                  "payoff",
                  "ending",
                ]),
              }),
            ),
            model: z.string(),
            name: z.string(),
            pacing: z.string(),
            reusableLessons: z.array(z.string()),
            steer: z.string().optional(),
            structure: z.string(),
            summary: z.string(),
            tags: z.array(z.string()),
            transcript: z
              .strictObject({
                language: z.string().optional(),
                text: z.string(),
              })
              .nullable(),
            transcriptError: z.string().optional(),
            version: z.number(),
            visualStyle: z.string(),
          }),
        ]),
        error: z.null(),
        mediaAssetId: z.string(),
      }),
      z.strictObject({
        analysis: z.null(),
        error: z.string(),
        mediaAssetId: z.string(),
      }),
    ]),
  ),
  analysis: analysisSchema.nullable(),
  analysisError: z.string().nullable(),
  analyzed: z.boolean(),
  analyzedCount: z.number(),
  attachedPlatformPostIds: z.array(z.string()),
  contentPostId: z.string(),
  mediaAssetId: z.string(),
  mediaAssetIds: z.array(z.string()),
  ok: z.literal(true),
  url: z.string(),
});

export const makeCarouselFromPoolOutputSchema = z.strictObject({
  contentPostId: z.string(),
  ok: z.literal(true),
  updated: z.array(
    z.strictObject({
      format: z.string(),
      mediaCount: z.number(),
      platform: z.enum(channelPlatformEnum.enumValues),
      platformPostId: z.string(),
    }),
  ),
  url: z.string(),
});

export const prepareContentMediaUploadsOutputSchema = z.strictObject({
  contentPostId: z.string(),
  next: z.string(),
  uploads: z.array(
    z.strictObject({
      filename: z.string(),
      mediaId: z.string(),
      mimeType: z.enum([
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
      ]),
      pathname: z.string(),
      publicUrl: z.string(),
      uploadUrl: z.string(),
    }),
  ),
});

export const finishContentMediaUploadsOutputSchema =
  finishContentMediaUploadsSchema;

export const importRemoteImagesToContentOutputSchema =
  finishContentMediaUploadsSchema;

export const suggestMediaForContentOutputSchema = z.strictObject({
  archive: z.array(
    z.strictObject({
      externalUrl: z.string().nullable(),
      media: z.array(
        z.strictObject({
          height: z.number().optional(),
          mediaIndex: z.number(),
          previewAvailable: z.boolean(),
          type: z.enum(["image", "video", "carousel"]),
          width: z.number().optional(),
        }),
      ),
      platform: z.enum(channelPlatformEnum.enumValues),
      platformPostId: z.string(),
      publishedAt: z.iso.datetime().nullable(),
      text: z.string().optional(),
    }),
  ),
  content: z.strictObject({
    captionDirection: z.string().nullable(),
    hook: z.string().nullable(),
    id: z.string(),
    pillar: z.string().nullable(),
    platformDrafts: z.array(
      z.strictObject({
        archetype: z.string().nullable(),
        format: z.string().nullable(),
        id: z.string(),
        platform: z.enum(channelPlatformEnum.enumValues),
        text: z.string().nullable(),
      }),
    ),
    title: z.string().nullable(),
    visualDirection: z.string().nullable(),
  }),
  generationBrief: z.strictObject({
    channels: z.array(z.enum(channelPlatformEnum.enumValues)),
    hook: z.string().nullable(),
    instruction: z.string(),
    title: z.string().nullable(),
    visualDirection: z.string().nullable(),
  }),
  library: z.array(
    z.strictObject({
      alreadyAttached: z.boolean(),
      alt: z.string().nullable(),
      folder: z.string().nullable(),
      height: z.number().nullable(),
      kind: z.enum(mediaKindEnum.enumValues),
      mediaAssetId: z.string(),
      provenance: z
        .strictObject({
          mediaIndex: z.number().nullable(),
          platformPostId: z.string(),
        })
        .nullable(),
      tags: z.array(z.string()),
      thumbnailUrl: z.string().nullable(),
      title: z.string().nullable(),
      url: z.string().nullable(),
      width: z.number().nullable(),
    }),
  ),
  libraryAssetsWithoutSemanticMetadata: z.number(),
});

export const attachLibraryMediaToContentOutputSchema = z.strictObject({
  attachedPlatformPostIds: z.array(z.string()),
  contentPostId: z.string(),
  mediaAssetId: z.string(),
  ok: z.literal(true),
  url: z.string(),
});

export const freezeCompositionToLibraryOutputSchema = z.strictObject({
  compositionUrl: z.string(),
  height: z.number().nullable(),
  libraryUrl: z.string(),
  mediaAssetId: z.string(),
  ok: z.literal(true),
  title: z.string().nullable(),
  url: z.string().nullable(),
  width: z.number().nullable(),
});

export const recoverArchiveMediaToContentOutputSchema = z.strictObject({
  attachedPlatformPostIds: z.array(z.string()),
  contentPostId: z.string(),
  mediaAssetId: z.string(),
  ok: z.literal(true),
  sourcePlatformPostId: z.string(),
  url: z.string(),
});

export const contentPipelineSummaryOutputSchema = z.union([
  z.strictObject({ byStatus: z.array(z.never()), total: z.number() }),
  z.strictObject({
    byStatus: z.array(statusCountSchema),
    standaloneByStatus: z.array(statusCountSchema),
    standaloneTotal: z.number(),
    total: z.number(),
  }),
]);

export const upcomingContentOutputSchema = upcomingContentResultSchema;

export const productionQueueOutputSchema = productionQueueResultSchema;

export const createIdeaOutputSchema = z.strictObject({
  brandName: z.string(),
  id: z.string().optional(),
  ok: z.literal(true),
  platforms: z.array(z.enum(channelPlatformEnum.enumValues)),
  seriesId: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
});

export const createPlatformPostOutputSchema = z.strictObject({
  brandName: z.string(),
  feedUrl: z.string(),
  id: z.string().optional(),
  next: z.string(),
  ok: z.literal(true),
  platform: z.enum(channelPlatformEnum.enumValues),
  scheduledAt: z.string().nullable(),
  title: z.string().nullable(),
});

export const publishBlogDraftOutputSchema = z.strictObject({
  editorUrl: z.string().nullable(),
  itemId: z.string(),
  note: z.string(),
  ok: z.literal(true),
  plannedPublicUrl: z.string(),
  slug: z.string(),
  url: z.string(),
});

export const promotePlatformPostOutputSchema = z.strictObject({
  alreadyPromoted: z.boolean(),
  id: z.string(),
  ok: z.literal(true),
  platformPostId: z.string(),
  url: z.string(),
});

export const deleteContentWorkItemOutputSchema = z.strictObject({
  action: z.literal("deleted"),
  idea: z.strictObject({ id: z.string(), title: z.string().nullable() }),
  next: z.string(),
  ok: z.literal(true),
  scrapedDetached: z.number(),
  spotsDeleted: z.number(),
  url: z.string(),
});
