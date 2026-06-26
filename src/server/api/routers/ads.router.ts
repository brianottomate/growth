import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import {
  AD_DESTINATIONS,
  computeAdsScope,
  computeTopAds,
} from "@/server/services/ads-analytics.service";

import { protectedProcedure } from "../trpc";

// Powers the interactive ad-performance cards on /overview: the chat renders the
// first paint from the capability output, then control changes refetch through
// here — same compute functions, no LLM round-trip. Mirrors the adsScope/topAds
// capability input schemas (src/server/ai/capabilities/ads.ts).

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const adsRouter = {
  scope: protectedProcedure
    .input(
      z.object({
        fromDate: dateStr.optional(),
        toDate: dateStr.optional(),
      }),
    )
    .query(async ({ input }) => computeAdsScope(input)),

  topAds: protectedProcedure
    .input(
      z.object({
        fromDate: dateStr.optional(),
        toDate: dateStr.optional(),
        objective: z.string().optional(),
        destination: z.enum(AD_DESTINATIONS).optional(),
        status: z.enum(["all", "active", "non-paused"]).default("all"),
        metric: z
          .enum(["impressions", "clicks", "ctr", "engagement", "spend"])
          .default("impressions"),
        limit: z.number().int().min(1).max(30).default(15),
      }),
    )
    .query(async ({ input }) => computeTopAds(input)),
} satisfies TRPCRouterRecord;
