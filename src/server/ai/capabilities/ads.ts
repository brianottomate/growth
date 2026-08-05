import "server-only";

import { z } from "zod";

import {
  AD_DESTINATIONS,
  computeAdsScope,
  computeTopAds,
} from "@/server/services/ads-analytics.service";
import { growthAction } from "./types";

// Optional analysis window — both default to "last 365 days" (resolved in the
// service). The model only needs to pass dates when the operator names a range.
const windowSchema = {
  brandSlug: z
    .string()
    .trim()
    .min(1)
    .describe("Exact owned brand slug, such as wander or wanderos."),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Window start YYYY-MM-DD. Default: 365 days ago."),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Window end YYYY-MM-DD. Default: today."),
};

export const adsScope = growthAction({
  description:
    "CHEAP lay-of-the-land for Wander's Meta (Facebook) ad performance over a window (default last 365 days): totals (impressions/clicks/CTR/spend/engagement), spend-by-month, and breakdowns by objective (OUTCOME_SALES≈consumer marketplace vs OUTCOME_LEADS≈PM/WanderOS) and by ad DESTINATION (audit / os / marketplace / lead-form / …). Includes flags like hasAuditAds. CALL THIS FIRST for any 'which ads / ad performance / what are we running / are we driving to X' question — it grounds your follow-ups (e.g. it tells you instantly that we've run zero audit-destination ads). Then call topAds to drill in.",
  inputSchema: z.object(windowSchema),
  execute: async (input, ctx) =>
    computeAdsScope({ ...input, organizationId: ctx.orgId }),
});

export const topAds = growthAction({
  description:
    "Ranked top Wander Meta ads for a window, by a chosen metric (impressions | clicks | ctr | engagement | spend), with creative copy + thumbnail + destination. Optionally filter by objective (e.g. OUTCOME_LEADS for the PM/WanderOS funnel) or destination. Use AFTER adsScope once the scope is narrowed. CTR ranking applies a 5k-impression delivery floor. Returns at most `limit` ads (default 15).",
  inputSchema: z.object({
    ...windowSchema,
    objective: z
      .string()
      .optional()
      .describe(
        "Filter to one Meta objective, e.g. OUTCOME_SALES (consumer) or OUTCOME_LEADS (PM/WanderOS).",
      ),
    destination: z
      .enum(AD_DESTINATIONS)
      .optional()
      .describe(
        "Filter to one destination bucket (audit, os, marketplace, lead-form, …).",
      ),
    status: z
      .enum(["all", "active", "non-paused"])
      .default("all")
      .describe(
        "Ad delivery status filter. Default all (includes paused/historical).",
      ),
    metric: z
      .enum(["impressions", "clicks", "ctr", "engagement", "spend"])
      .default("impressions")
      .describe("Ranking metric."),
    limit: z.number().int().min(1).max(30).default(15),
  }),
  execute: async (input, ctx) =>
    computeTopAds({ ...input, organizationId: ctx.orgId }),
});
