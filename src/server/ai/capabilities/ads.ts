import "server-only";

import { z } from "zod";

import {
  AD_DESTINATIONS,
  computeAdsScope,
  computeTopAds,
} from "@/server/services/ads-analytics.service";
import {
  boostMetaPost,
  createGoogleAd,
  createMetaAdDraft,
  duplicateMetaCampaign,
  listAdsWriteDestinations,
  createAdAudience,
  addAdAudienceUsers,
} from "@/server/services/ads-write.service";
import {
  addDraftAd,
  createDraftInitiative,
} from "@/server/services/ads-draft.service";
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

const platformSchema = z.enum(["meta", "google"]);
const budgetTypeSchema = z.enum(["daily", "lifetime"]);
const dateTimeSchema = z.string().datetime({ offset: true });
const targetingSchema = z.object({
  countries: z.array(z.string().length(2)).min(1).max(25).optional(),
  ageMin: z.number().int().min(13).max(65).optional(),
  ageMax: z.number().int().min(13).max(65).optional(),
  languages: z.array(z.string().min(2).max(10)).max(25).optional(),
  audienceId: z.string().min(1).optional(),
});
const destinationSchema = {
  brandSlug: z
    .string()
    .trim()
    .min(1)
    .describe("Exact owned brand slug returned by brandRead."),
  connectionAccountId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Connected Zernio account id returned by adsRead.listDestinations.",
    ),
  adAccountId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Exact allowlisted platform ad account returned by adsRead.listDestinations.",
    ),
};
const schedulingSchema = {
  startDate: dateTimeSchema.optional(),
  endDate: dateTimeSchema.optional(),
};

export const listAdsDestinations = growthAction({
  description:
    "List the active Zernio Meta or Google connection and the live provider ad accounts that are explicitly allowlisted for one owned brand. Use this before any adsWrite action; never guess either account id.",
  inputSchema: z.object({
    brandSlug: destinationSchema.brandSlug,
    platform: platformSchema,
  }),
  execute: async (input, ctx) =>
    listAdsWriteDestinations({
      ...input,
      organizationId: ctx.orgId,
    }),
});

export const draftCampaignAction = growthAction({
  description:
    "Create a LOCAL campaign draft (an initiative) — the editable first-party object shown at /app/brands/{brandSlug}/ads/draft/{initiativeId}. Nothing touches any ad platform: per-platform campaigns are created later by the push, which is a separate operator-approved step. Use adsWrite.createMetaDraft when the user explicitly wants a campaign created directly ON the provider instead.",
  inputSchema: z.object({
    brandSlug: destinationSchema.brandSlug,
    name: z.string().trim().min(1).max(300),
    targetChannels: z
      .array(z.enum(["meta_ads", "google_ads"]))
      .min(1)
      .max(2)
      .optional()
      .describe("Intended platforms; the push decides what actually ships."),
    landingUrl: z.string().url().optional(),
    goal: z.string().trim().max(200).optional(),
    budget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Total intended budget in whole dollars."),
    initiativeId: z.string().trim().min(1).optional(),
  }),
  execute: async (input, ctx) =>
    createDraftInitiative({
      ...input,
      organizationId: ctx.orgId,
    }),
});

export const createMetaAdDraftAction = growthAction({
  description:
    "Create a complete Meta campaign, ad set, and ad through Zernio — single-image via imageUrl, or a 2–10 card carousel via carouselCards. The campaign is forced to PAUSED so it cannot spend until activated in a separate operator step. Set validateOnly to check Meta's tree without creating it. Requires explicit operator approval even for validation because Meta uploads referenced media during dry runs.",
  inputSchema: z.object({
    ...destinationSchema,
    name: z.string().trim().min(1).max(255),
    campaignName: z.string().trim().min(1).max(255).optional(),
    adSetName: z.string().trim().min(1).max(255).optional(),
    adName: z.string().trim().min(1).max(255).optional(),
    goal: z.enum([
      "engagement",
      "traffic",
      "awareness",
      "video_views",
      "lead_generation",
      "lead_conversion",
      "conversions",
      "app_promotion",
      "catalog_sales",
    ]),
    budgetAmount: z
      .number()
      .positive()
      .describe("Budget in whole currency units, never cents."),
    budgetType: budgetTypeSchema,
    headline: z.string().trim().min(1).max(255),
    body: z.string().trim().min(1).max(2_200),
    description: z.string().trim().min(1).max(255).optional(),
    callToAction: z.string().trim().min(1).max(64),
    linkUrl: z.string().url(),
    imageUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "Single-image creative. Provide this or carouselCards (except for catalog_sales, where Meta renders items).",
      ),
    carouselCards: z
      .array(
        z.object({
          imageUrl: z.string().url(),
          headline: z.string().trim().min(1).max(255).optional(),
          description: z.string().trim().min(1).max(255).optional(),
          linkUrl: z.string().url().optional(),
          callToAction: z.string().trim().min(1).max(64).optional(),
        }),
      )
      .min(2)
      .max(10)
      .optional()
      .describe(
        "Hand-built carousel, 2–10 cards rendered in this exact order. Card linkUrl/callToAction fall back to the ad-level values. Mutually exclusive with imageUrl.",
      ),
    leadGenFormId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Required for lead_generation."),
    targeting: targetingSchema.optional(),
    ...schedulingSchema,
    validateOnly: z.boolean().optional().default(false),
    promotedObject: z
      .object({
        pixelId: z.string().min(1).optional(),
        customEventType: z.string().min(1).optional(),
        customConversionId: z.string().min(1).optional(),
        productSetId: z.string().min(1).optional(),
        pageId: z.string().min(1).optional(),
        applicationId: z.string().min(1).optional(),
        objectStoreUrl: z.string().url().optional(),
      })
      .optional(),
  }),
  execute: async (input, ctx) =>
    createMetaAdDraft(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const createGoogleAdAction = growthAction({
  description:
    "Create one Google Search or Display campaign tree through Zernio. Google creation has no documented validate-only or paused option and may begin spend after provider acceptance. Use traffic for click-optimized delivery; conversion-goal creation is unsupported. Requires explicit operator approval.",
  inputSchema: z.object({
    ...destinationSchema,
    name: z.string().trim().min(1).max(255),
    campaignType: z.enum(["search", "display"]),
    goal: z.enum(["engagement", "traffic", "awareness", "video_views"]),
    budgetAmount: z
      .number()
      .positive()
      .describe("Budget in whole currency units, never cents."),
    budgetType: budgetTypeSchema,
    headline: z.string().trim().min(1).max(30),
    body: z.string().trim().min(1).max(90),
    linkUrl: z.string().url(),
    keywords: z.array(z.string().trim().min(1)).min(1).max(20).optional(),
    negativeKeywords: z.array(z.string().trim().min(1)).max(20).optional(),
    additionalHeadlines: z
      .array(z.string().trim().min(1).max(30))
      .max(14)
      .optional(),
    additionalDescriptions: z
      .array(z.string().trim().min(1).max(90))
      .max(3)
      .optional(),
    images: z
      .object({
        landscape: z.string().url(),
        square: z.string().url(),
      })
      .optional()
      .describe("Required for Display: one 1.91:1 and one 1:1 image."),
    businessName: z.string().trim().min(1).max(25).optional(),
    targeting: targetingSchema.optional(),
    ...schedulingSchema,
  }),
  execute: async (input, ctx) =>
    createGoogleAd(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const boostMetaPostAction = growthAction({
  description:
    "Boost one existing Facebook or Instagram post through Zernio while preserving its engagement. Zernio launches the created Meta hierarchy ACTIVE, so approval starts a spend-capable campaign immediately. Provide exactly one provider post identifier. Requires explicit operator approval.",
  inputSchema: z.object({
    ...destinationSchema,
    name: z.string().trim().min(1).max(255),
    goal: z.enum([
      "engagement",
      "traffic",
      "awareness",
      "video_views",
      "lead_generation",
      "conversions",
      "app_promotion",
    ]),
    postId: z.string().trim().min(1).optional(),
    platformPostId: z.string().trim().min(1).optional(),
    budgetAmount: z
      .number()
      .positive()
      .describe("Budget in whole currency units, never cents."),
    budgetType: budgetTypeSchema,
    targeting: targetingSchema.optional(),
    ...schedulingSchema,
  }),
  execute: async (input, ctx) =>
    boostMetaPost(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const duplicateMetaCampaignAction = growthAction({
  description:
    "Deep-copy one Meta campaign already visible inside the named brand's allowlisted account. Zernio creates the copied campaign PAUSED and syncs the copy back into the ad tree. Requires explicit operator approval.",
  inputSchema: z.object({
    brandSlug: destinationSchema.brandSlug,
    campaignId: z.string().trim().min(1),
    renameSuffix: z.string().max(80).optional().default(" (copy)"),
  }),
  execute: async (input, ctx) =>
    duplicateMetaCampaign({
      ...input,
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const createAudienceAction = growthAction({
  description:
    "Create a Meta custom audience (customer_list or lookalike) on an allowlisted ad account through Zernio. No spend, but a provider write — and the endpoint is NOT idempotent, so a failure must be reported to the operator, never retried. Lookalikes require sourceAudienceId, country, and ratio (0.01–0.20).",
  inputSchema: z.object({
    ...destinationSchema,
    type: z.enum(["customer_list", "lookalike"]),
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(500).optional(),
    sourceAudienceId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Lookalike seed: the platform id of an existing audience."),
    country: z
      .string()
      .trim()
      .length(2)
      .optional()
      .describe("Lookalike target country, ISO-3166 alpha-2 (e.g. US)."),
    ratio: z
      .number()
      .min(0.01)
      .max(0.2)
      .optional()
      .describe("Lookalike breadth: 0.01 = top 1% of the country."),
    audienceTargetId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "The first-party audience_target this platform asset fulfils (from audienceRead). Stamp it so the who stays defined once.",
      ),
  }),
  execute: async (input, ctx) =>
    createAdAudience(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const addAudienceUsersAction = growthAction({
  description:
    "Upload members (plaintext email and/or phone; Zernio hashes server-side) to an existing customer_list audience. Batches of 10,000 per request; partial progress is reported on failure so a retry can resume rather than duplicate.",
  inputSchema: z.object({
    audienceId: z
      .string()
      .trim()
      .min(1)
      .describe("The platform audience id returned by createAudience."),
    users: z
      .array(
        z.object({
          email: z.string().email().optional(),
          phone: z.string().trim().min(5).optional(),
        }),
      )
      .min(1)
      .max(50_000),
  }),
  execute: async (input) => addAdAudienceUsers(input),
});

export const draftAdAction = growthAction({
  description:
    "Add a drafted ad to a LOCAL campaign draft (one created with adsWrite.draftCampaign). Local only — nothing touches the platform until the operator pushes the draft. The creative is an image URL, ideally a media-library asset URL.",
  inputSchema: z.object({
    initiativeId: z.string().trim().min(1),
    adSetId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(300),
    headline: z.string().trim().max(255).optional(),
    body: z.string().trim().max(2_200).optional(),
    linkUrl: z.string().url(),
    imageUrl: z.string().url(),
    assetId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("media_asset id when the image comes from the library."),
  }),
  execute: async (input, ctx) =>
    addDraftAd({
      initiativeId: input.initiativeId,
      adSetId: input.adSetId ?? null,
      name: input.name,
      headline: input.headline ?? null,
      body: input.body ?? null,
      linkUrl: input.linkUrl,
      media: [
        { url: input.imageUrl, type: "image", assetId: input.assetId },
      ],
      organizationId: ctx.orgId,
    }),
});
