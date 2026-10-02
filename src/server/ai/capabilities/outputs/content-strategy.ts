import { seriesStatusEnum } from "@/server/db/content-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { contentStatusEnum } from "@/server/db/content-schema";
import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const seriesSchema = z.strictObject({
  brandId: z.string(),
  campaignId: z.string().nullable(),
  color: z.string().nullable(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  endAt: z.iso.datetime().nullable(),
  id: z.string(),
  name: z.string(),
  pillar: z.string().nullable(),
  slug: z.string().nullable(),
  startAt: z.iso.datetime().nullable(),
  status: z.enum(seriesStatusEnum.enumValues),
  theme: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export const getContentStrategyOutputSchema = z.strictObject({
  brand: z.strictObject({ id: z.string(), name: z.string() }),
  groupingProposals: z.array(
    z.strictObject({
      confidence: z.number().nullable(),
      id: z.string(),
      proposed: z.strictObject({
        memberPostIds: z.array(z.string()).optional(),
        pillarSlug: z.string().nullable().optional(),
        rationale: z.string().optional(),
        theme: z.string().optional(),
        title: z.string().optional(),
        unit: z.enum(["series", "single"]).optional(),
      }),
      reasoning: z.string().nullable(),
    }),
  ),
  pillars: z.array(
    z.strictObject({
      color: z.string(),
      contentCount: z.number(),
      description: z.string(),
      name: z.string(),
      slug: z.string(),
      source: z.enum(["default", "custom"]),
      targetPct: z.number().nullable(),
      targetPeriod: z.enum(["day", "week", "month"]).nullable(),
    }),
  ),
  pillarsUrl: z.string(),
  reviewUrl: z.string(),
  series: z.array(
    z.strictObject({
      cadence: z.array(
        z.strictObject({
          archetype: z.string(),
          count: z.number(),
          period: z.enum(["day", "week", "month"]),
          platform: z.enum(channelPlatformEnum.enumValues),
          seriesId: z.string().nullable(),
        }),
      ),
      content: z.array(
        z.strictObject({
          captionDirection: z.string().nullable(),
          hook: z.string().nullable(),
          id: z.string(),
          mediaCount: z.number(),
          pillar: z.string().nullable(),
          plannedAt: z.iso.datetime().nullable(),
          platformPosts: z.array(
            z.strictObject({
              archetype: z.string().nullable(),
              id: z.string(),
              platform: z.enum(channelPlatformEnum.enumValues),
            }),
          ),
          status: z.enum(contentStatusEnum.enumValues),
          targetSpots: z
            .array(
              z.strictObject({
                archetype: z.string(),
                channelId: z.string().optional(),
                count: z.number().optional(),
                format: z.string(),
                platform: z.string(),
                scheduledAt: z.string().optional(),
                template: z.string().optional(),
              }),
            )
            .nullable(),
          title: z.string().nullable(),
          url: z.string(),
          visualDirection: z.string().nullable(),
        }),
      ),
      description: z.string().nullable(),
      endAt: z.iso.datetime().nullable(),
      firstPostGaps: z.array(z.string()),
      id: z.string(),
      name: z.string(),
      pillarSlug: z.string().nullable(),
      startAt: z.iso.datetime().nullable(),
      status: z.enum(seriesStatusEnum.enumValues),
      theme: z.string().nullable(),
      url: z.string(),
    }),
  ),
});

export const saveContentPillarOutputSchema = z.strictObject({
  action: z.literal("saved"),
  change: z.literal("pillar"),
  ok: z.literal(true),
  pillar: z.strictObject({
    brandId: z.string(),
    color: z.string(),
    createdAt: z.iso.datetime(),
    description: z.string(),
    id: z.string(),
    isActive: z.boolean(),
    name: z.string(),
    slug: z.string(),
    updatedAt: z.iso.datetime(),
  }),
  url: z.string(),
});

export const saveContentSeriesOutputSchema = z.union([
  z.strictObject({
    action: z.literal("saved"),
    attachedIdeas: z.number(),
    change: z.literal("updated"),
    next: z.string(),
    ok: z.literal(true),
    series: seriesSchema.optional(),
    url: z.string(),
  }),
  z.strictObject({
    action: z.literal("saved"),
    attachedIdeas: z.number(),
    change: z.literal("created"),
    next: z.string(),
    ok: z.literal(true),
    series: seriesSchema,
    url: z.string(),
  }),
]);

export const organizeContentIdeasOutputSchema = z.strictObject({
  action: z.literal("saved"),
  change: z.literal("organized"),
  count: z.number(),
  ok: z.literal(true),
  pillarSlug: z.string().nullable(),
  removedFromSeries: z.boolean(),
  series: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
  url: z.string(),
});

export const resolveContentGroupingOutputSchema = z.union([
  z.strictObject({
    action: z.literal("saved"),
    change: z.literal("rejected"),
    id: z.string(),
    ok: z.literal(true),
    status: z.literal("rejected"),
  }),
  z.strictObject({
    action: z.literal("saved"),
    change: z.literal("series"),
    contentIdeas: z.number(),
    id: z.string(),
    ok: z.literal(true),
    pillarSlug: z.string().nullable(),
    seriesId: z.string(),
    status: z.literal("accepted"),
    title: z.string(),
    url: z.string(),
  }),
  z.strictObject({
    action: z.literal("saved"),
    change: z.literal("same_idea"),
    channelPosts: z.number(),
    contentPostId: z.string(),
    id: z.string(),
    ok: z.literal(true),
    pillarSlug: z.string().nullable(),
    status: z.literal("accepted"),
    title: z.string().nullable(),
    url: z.string(),
  }),
]);

export const deleteContentSeriesOutputSchema = z.strictObject({
  action: z.literal("deleted"),
  brand: z.string(),
  detachedIdeas: z.number(),
  next: z.string(),
  ok: z.literal(true),
  series: z.strictObject({ id: z.string(), name: z.string() }),
  url: z.string(),
});

export const clearContentSeriesOutputSchema = z.strictObject({
  action: z.literal("cleared"),
  brand: z.string(),
  deleted: z.number(),
  detachedIdeas: z.number(),
  names: z.array(z.string()),
  next: z.string(),
  ok: z.literal(true),
  url: z.string(),
});
