import { channelPlatformEnum } from "@/server/db/channel-schema";
import {
  upcomingContentResultSchema,
  productionQueueResultSchema,
} from "./shared";
import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const nextForBrandOutputSchema = z.strictObject({
  brand: z.strictObject({
    id: z.string(),
    name: z.string(),
    tagline: z.string().nullable(),
  }),
  calendarUrl: z.string(),
  contentUrl: z.string(),
  horizonDays: z.number(),
  production: productionQueueResultSchema,
  readiness: z.strictObject({
    gaps: z.array(z.string()),
    ownedHistory: z.strictObject({
      count: z.number(),
      earliest: z.iso.datetime().nullable(),
      latest: z.iso.datetime().nullable(),
    }),
    readyToPlan: z.boolean(),
    surfaces: z.strictObject({
      blogPosts: z.number(),
      channels: z.number(),
      contentIdeas: z.number(),
      hasStrategyTargets: z.boolean(),
      mediaAssets: z.number(),
      peers: z.number(),
      pendingReviews: z.number(),
      personas: z.number(),
      series: z.number(),
      webPages: z.number(),
    }),
  }),
  recommendation: z.string(),
  strategy: z.strictObject({
    availablePillars: z.array(
      z.strictObject({
        description: z.string(),
        name: z.string(),
        slug: z.string(),
      }),
    ),
    cadence: z.array(
      z.strictObject({
        archetype: z.string(),
        channelId: z.string(),
        count: z.number(),
        period: z.enum(["day", "week", "month"]),
        platform: z.enum(channelPlatformEnum.enumValues),
      }),
    ),
    mix: z.array(
      z.strictObject({
        period: z.enum(["day", "week", "month"]),
        pillar: z.string(),
        targetPct: z.number(),
      }),
    ),
    unconfiguredChannels: z.array(
      z.strictObject({
        handle: z.string().nullable(),
        id: z.string(),
        platform: z.enum(channelPlatformEnum.enumValues),
      }),
    ),
  }),
  upcoming: upcomingContentResultSchema,
});
