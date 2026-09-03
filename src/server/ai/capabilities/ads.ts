import "server-only";

import { z } from "zod";

import {
  AD_PUSH_GOALS,
  PLANNABLE_AD_PLATFORMS,
  PUSHABLE_AD_PLATFORMS,
  ZERNIO_AD_PLATFORMS,
} from "@/lib/ad-platforms";
import {
  LINKEDIN_CALL_TO_ACTIONS,
  LINKEDIN_COST_TYPES,
} from "@/lib/zernio-ads";

import {
  AD_DESTINATIONS,
  computeAdsScope,
  computeTopAds,
} from "@/server/services/ads-analytics.service";
import {
  boostMetaPost,
  createGoogleAd,
  createMetaAdDraft,
  deletePlatformCampaign,
  duplicateMetaCampaign,
  listAdsWriteDestinations,
  createAdAudience,
  addAdAudienceUsers,
  pushDraftToPlatform,
  previewDraftAd,
  setCampaignDelivery,
  syncBrandPlatformAudiences,
} from "@/server/services/ads-write.service";
import {
  addAudience,
  addDraftAd,
  attachPlatformCampaign,
  createDraftCampaign,
  deleteAudience,
  deleteDraftAd,
  deleteDraftCampaign,
  getDraftCampaign,
  importPlatformAdCreative,
  linkPlatformAudience,
  listBrandCampaigns,
  planPlatform,
  setCampaignCreativePool,
  setPlatformDraft,
  updateAudience,
} from "@/server/services/ads-draft.service";
import { draftAdsFromHomes } from "@/server/services/property-ads.service";
import { requireOwnedCampaign } from "@/server/services/ads-draft.service";
import { MediaService } from "@/server/services/media.service";
import { mediaTypeForUrl } from "@/lib/media-url";
import type { MediaItem } from "@/server/db/schema";
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

const platformSchema = z.enum(ZERNIO_AD_PLATFORMS);
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
    "List the active Zernio Meta, Google or LinkedIn connection and the live provider ad accounts that are explicitly allowlisted for one owned brand. Use this before any adsWrite action; never guess either account id.",
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
    "Create a LOCAL campaign draft — the editable first-party object shown at /app/brands/{brandSlug}/ads/{campaignId}. Nothing touches any ad platform: per-platform campaigns are created later by the push, which is a separate operator-approved step. Use adsWrite.createMetaDraft when the user explicitly wants a campaign created directly ON the provider instead.",
  inputSchema: z.object({
    brandSlug: destinationSchema.brandSlug,
    name: z.string().trim().min(1).max(300),
    platforms: z
      .array(z.enum(PLANNABLE_AD_PLATFORMS))
      .min(1)
      .max(PLANNABLE_AD_PLATFORMS.length)
      .optional()
      .describe(
        "Platforms to plan: each gets a local draft platform campaign holding its budget and settings. Default meta_ads.",
      ),
    landingUrl: z.string().url().optional(),
    goal: z.string().trim().max(200).optional(),
    budget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Total intended budget in whole dollars."),
    campaignId: z.string().trim().min(1).optional(),
  }),
  execute: async (input, ctx) =>
    createDraftCampaign({
      ...input,
      organizationId: ctx.orgId,
    }),
});

export const createMetaAdDraftAction = growthAction({
  description:
    "Create a complete Meta campaign, ad set, and ad through Zernio — single-image via imageUrl, or a 2–10 card carousel via carouselCards. The campaign is forced to PAUSED so it cannot spend until activated in a separate operator step. Set validateOnly to check Meta's tree without creating it. Requires explicit operator approval even for validation because Meta uploads referenced media during dry runs.",
  inputSchema: z
    .object({
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
          "Single-image creative. Provide this or carouselCards (except for catalog_sales, where Meta renders items). When the operator attached an image this turn, pass the url that mediaLibraryWrite.saveChatMedia returned for it rather than the raw attachment.",
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
    })
    // assertMetaAdPayload enforces this too, but only inside execute — which
    // is AFTER the approval prompt. A call that cannot succeed should never
    // reach a human for authorization, and rejecting it here lets the model
    // add the creative instead of asking someone to approve a failure.
    .refine(
      (input) =>
        input.goal === "catalog_sales" ||
        Boolean(input.imageUrl) ||
        Boolean(input.carouselCards?.length),
      {
        error:
          "A Meta ad needs a creative: set imageUrl, or carouselCards with 2-10 cards.",
      },
    ),
  execute: async (input, ctx) =>
    createMetaAdDraft(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const createGoogleAdAction = growthAction({
  description:
    'Create one Google Search or Display campaign tree through Zernio, then pause it. Google\'s create call has no validate-only and no paused option, so the pause is a second call — the result carries a warning, and a status of "live", if it did not land. Use traffic for click-optimized delivery; conversion-goal creation is unsupported. Requires explicit operator approval.',
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
    platformCampaignId: z.string().trim().min(1),
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
    planAudienceId: z
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
    "Add a drafted ad to a LOCAL campaign — a suggestion the push transforms per platform. Local only. Type creative (default) carries copy plus media: one image, several images (a carousel, in order), or a video — for Meta. Media the operator attached this turn can be passed by its chat url directly; it is saved into the brand's library and its video poster resolved for you. Type text is a pool of headlines and descriptions, for Google/OpenAI.",
  inputSchema: z
    .object({
      campaignId: z.string().trim().min(1),
      name: z.string().trim().min(1).max(300),
      type: z.enum(["creative", "text"]).default("creative"),
      headline: z
        .string()
        .trim()
        .max(255)
        .optional()
        .describe("creative only; required for it."),
      body: z
        .string()
        .trim()
        .max(2_200)
        .optional()
        .describe("creative only; required for it."),
      imageUrls: z
        .array(z.string().url())
        .max(10)
        .optional()
        .describe(
          "creative only: one url = static image, several = carousel cards in this order.",
        ),
      imageUrl: z
        .string()
        .url()
        .optional()
        .describe(
          "creative only: shorthand for imageUrls with a single entry — the shape createMetaDraft uses.",
        ),
      videoUrl: z
        .string()
        .url()
        .optional()
        .describe(
          "creative only: a video ad instead of images. Mutually exclusive with imageUrls/imageUrl.",
        ),
      videoThumbnailUrl: z
        .string()
        .url()
        .optional()
        .describe(
          "Meta wants a still alongside the clip. Optional: for our own uploads the poster frame is found automatically, so only pass this to override it.",
        ),
      callToAction: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .optional()
        .describe("creative only, e.g. SIGN_UP."),
      headlines: z
        .array(z.string().trim().min(1).max(30))
        .max(15)
        .optional()
        .describe("text only; required for it."),
      descriptions: z
        .array(z.string().trim().min(1).max(90))
        .max(4)
        .optional()
        .describe("text only; required for it."),
      linkUrl: z
        .string()
        .url()
        .optional()
        .describe("Falls back to the campaign landing URL."),
      assetId: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe("media_asset id when the image comes from the library."),
    })
    .refine(
      (input) =>
        input.type === "text" ||
        (Boolean(input.headline) &&
          Boolean(input.body) &&
          ((input.imageUrls?.length ?? 0) > 0 ||
            Boolean(input.imageUrl) ||
            Boolean(input.videoUrl))),
      {
        // Name the actual fields: an error that says "imageUrl" teaches the
        // model to resend the wrong shape.
        error:
          "A creative ad needs headline, body, and media: imageUrls (array, carousel-capable), imageUrl (single), or videoUrl.",
        path: ["imageUrls"],
      },
    )
    .refine(
      (input) =>
        !input.videoUrl ||
        ((input.imageUrls?.length ?? 0) === 0 && !input.imageUrl),
      {
        error: "A creative ad is images OR a video, not both.",
        path: ["videoUrl"],
      },
    )
    .refine(
      (input) =>
        input.type === "creative" ||
        ((input.headlines?.length ?? 0) > 0 &&
          (input.descriptions?.length ?? 0) > 0),
      { error: "A text ad needs headlines and descriptions." },
    ),
  execute: async (input, ctx) => {
    let media: MediaItem[] = [];
    if (input.type === "creative") {
      const { brand } = await requireOwnedCampaign(input.campaignId, ctx.orgId);
      const resolve = (url: string) =>
        MediaService.resolveLibraryMedia({
          brandId: brand.id,
          userId: ctx.userId,
          url,
        });

      if (input.videoUrl) {
        const resolved = await resolve(input.videoUrl);
        const thumbnail = input.videoThumbnailUrl ?? resolved.thumbnailUrl;
        if (!thumbnail) {
          throw new Error(
            "This video has no poster frame, and Meta will not take a video ad without one. Re-upload it on /app/media, which cuts a poster from the file, then draft from the library asset. Passing videoThumbnailUrl explicitly also works.",
          );
        }
        media = [
          {
            url: resolved.url,
            type: "video",
            thumbnail,
            assetId: input.assetId ?? resolved.assetId,
          },
        ];
      } else {
        const urls = input.imageUrls?.length
          ? input.imageUrls
          : [input.imageUrl!];
        media = await Promise.all(
          urls.map(async (url) => {
            const resolved = await resolve(url);
            return {
              url: resolved.url,
              type: "image" as const,
              assetId: input.assetId ?? resolved.assetId,
            };
          }),
        );
      }
    }

    return addDraftAd({
      campaignId: input.campaignId,
      name: input.name,
      type: input.type,
      content:
        input.type === "text"
          ? {
              headlines: input.headlines!,
              descriptions: input.descriptions!,
              linkUrl: input.linkUrl,
            }
          : {
              headline: input.headline!,
              body: input.body!,
              linkUrl: input.linkUrl,
              callToAction: input.callToAction,
              media,
            },
      organizationId: ctx.orgId,
    });
  },
});

// ---- READING AND FINISHING A CAMPAIGN -------------------------------
//
// Chat could start a campaign and add ads to it, then stopped: it could not
// read back what it made, add the ad set that carries audience and budget,
// push, or launch. Every one of those was a button in the UI only, which made
// the campaign page's "Work in chat" open an assistant blind to the campaign
// it was standing on. These close that.

export const openCampaignAction = growthAction({
  description:
    "Read one first-party campaign in full: its brief, ad sets and their audiences, drafted and live ads, and any per-platform campaigns the push created. Use this before editing a campaign so you are working from its current state rather than what was said earlier in the conversation.",
  inputSchema: z.object({
    campaignId: z
      .string()
      .trim()
      .min(1)
      .describe("A camp_ id, from the campaign URL or adsRead.listCampaigns."),
  }),
  execute: async (input, ctx) => getDraftCampaign(ctx.orgId, input.campaignId),
});

export const previewAdAction = growthAction({
  description:
    "Render Meta's own previews of a DRAFTED creative ad before anything exists on the platform — real iframes from Meta's preview API. The Facebook page the ad runs as resolves from the connection automatically; pass pageId only to override. Returns preview URLs to open; nothing is created and nothing spends. Image and carousel ads only; video previews need a push first.",
  inputSchema: z.object({
    adId: z.string().trim().min(1),
    connectionAccountId: destinationSchema.connectionAccountId,
    adAccountId: destinationSchema.adAccountId,
    pageId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Override the Facebook page the ad runs as; resolved from the connection otherwise.",
      ),
    formats: z
      .array(z.string().trim().min(1))
      .max(10)
      .optional()
      .describe(
        "Meta preview formats; default DESKTOP_FEED_STANDARD + INSTAGRAM_STORY.",
      ),
  }),
  execute: async (input, ctx) =>
    previewDraftAd(input, { organizationId: ctx.orgId, runId: ctx.runId }),
});

export const importCreativeAction = growthAction({
  description:
    "Import a live ad's creative into the brand media library, durably (R2). Platform CDN urls expire, so a proven creative must be imported before drafts can reuse it. Dedupes by source url; a video ad imports its poster only.",
  inputSchema: z.object({
    platformAdId: z
      .string()
      .trim()
      .min(1)
      .describe("The pad_ mirror row, from openCampaign or the ads page."),
  }),
  execute: async (input, ctx) =>
    importPlatformAdCreative({
      platformAdId: input.platformAdId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const linkAudienceAction = growthAction({
  description:
    "Link a platform audience asset (a synced lookalike, customer list, or pixel audience) to the plan audience it fulfils, so the push targets that asset. This is how a pre-existing asset — including one seeded from Wander's own lists in the same ad account — becomes targetable by a campaign. Pass audienceId null to unlink. Local rows only.",
  inputSchema: z.object({
    platformAudienceId: z
      .string()
      .trim()
      .min(1)
      .describe("The paud_ mirror row, from openCampaign or the ads page."),
    audienceId: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("The plan audience (aud_) it fulfils; null unlinks."),
  }),
  execute: async (input, ctx) =>
    linkPlatformAudience({ ...input, organizationId: ctx.orgId }),
});

export const listCampaignsAction = growthAction({
  description:
    "List a brand's per-platform campaigns, including ones sync pulled that are not attached to any first-party campaign. Use it to find a campaign id, or to see what is waiting to be attached.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
  }),
  execute: async (input, ctx) =>
    listBrandCampaigns({ brandId: input.brandId, organizationId: ctx.orgId }),
});

export const draftAdsFromHomesAction = growthAction({
  description:
    "Build draft ads for a Performance+ client from their own listings: renders a card per home from its hero photo, then drafts one single-home static ad and one carousel. Also returns catalog feed rows for the homes that currently quote a price. Local drafts and rendered images only; the platform push is what decides whether any of it runs.",
  inputSchema: z.object({
    campaignId: z.string().min(1),
    carouselSize: z.number().int().min(1).max(8).optional(),
  }),
  outputSchema: z.object({
    campaignId: z.string(),
    adIds: z.array(z.string()),
    homesUsed: z.array(z.object({ name: z.string(), url: z.string() })),
    feedRows: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        availability: z.literal("in stock"),
        condition: z.literal("new"),
        price: z.string(),
        link: z.string(),
        image_link: z.string(),
        brand: z.string(),
      }),
    ),
    /** Anything an operator should read: skipped homes, missing prices. */
    notes: z.array(z.string()),
  }),
  examples: [
    { campaignId: "camp_01" },
    { campaignId: "camp_01", carouselSize: 4 },
  ],
  execute: (input, ctx) =>
    draftAdsFromHomes({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      campaignId: input.campaignId,
      carouselSize: input.carouselSize,
    }),
});

export const addAudienceAction = growthAction({
  description:
    "Add an audience to a LOCAL campaign: one buyable narrowing (one age window, one geography, optional keyword suggestions) that the push compiles to a Meta ad set / Google ad group. Wanting two age ranges means two audiences. Local only, and an audience carries NO money — budgets live on the platform draft. Omit everything but the name for broad targeting, which is a legitimate and often correct choice.",
  inputSchema: z.object({
    campaignId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(300),
    personaId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("The brand persona (pers_) this audience narrows."),
    ageMin: z.number().int().min(13).max(100).optional(),
    ageMax: z.number().int().min(13).max(100).optional(),
    countries: z
      .array(z.string().length(2))
      .max(20)
      .optional()
      .describe('ISO country codes, e.g. ["US"].'),
    regions: z
      .array(z.string().trim().min(1).max(100))
      .max(20)
      .optional()
      .describe(
        'Region/state names, e.g. ["California"] — resolved to platform geo keys at push.',
      ),
    keywords: z
      .array(z.string().trim().min(1).max(80))
      .max(50)
      .optional()
      .describe(
        "Loose suggestions. The Google compile derives keywords from these; Meta ignores them.",
      ),
  }),
  execute: async (input, ctx) =>
    addAudience({
      campaignId: input.campaignId,
      name: input.name,
      personaId: input.personaId ?? null,
      ageMin: input.ageMin ?? null,
      ageMax: input.ageMax ?? null,
      geography:
        input.countries?.length || input.regions?.length
          ? { countries: input.countries, regions: input.regions }
          : null,
      keywords: input.keywords ?? null,
      organizationId: ctx.orgId,
    }),
});

export const updateAudienceAction = growthAction({
  description:
    "Update a campaign audience's fields — name, age window, geography, or keyword suggestions. Only the fields sent are changed. Local only. Budgets live on the platform draft (setPlatformDraft), never on an audience.",
  inputSchema: z.object({
    audienceId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(300).optional(),
    ageMin: z.number().int().min(13).max(100).nullish(),
    ageMax: z.number().int().min(13).max(100).nullish(),
    countries: z.array(z.string().length(2)).max(20).optional(),
    regions: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  }),
  execute: async (input, ctx) =>
    updateAudience({
      audienceId: input.audienceId,
      name: input.name,
      ageMin: input.ageMin,
      ageMax: input.ageMax,
      geography:
        input.countries !== undefined || input.regions !== undefined
          ? { countries: input.countries, regions: input.regions }
          : undefined,
      keywords: input.keywords,
      organizationId: ctx.orgId,
    }),
});

export const planPlatformAction = growthAction({
  description:
    "Plan a platform for a LOCAL campaign: creates the draft platform campaign row that holds that platform's authoritative budget and settings. Local only; idempotent per platform.",
  inputSchema: z.object({
    campaignId: z.string().trim().min(1),
    platform: z.enum(PLANNABLE_AD_PLATFORMS),
  }),
  execute: async (input, ctx) =>
    planPlatform({ ...input, organizationId: ctx.orgId }),
});

export const setCreativePoolAction = growthAction({
  description:
    "Replace a campaign's shared creative pool — the images and videos its ads draw from, picked once rather than per ad. Chat attachments are promoted into the media library on the way in. Local only.",
  inputSchema: z.object({
    campaignId: z.string().trim().min(1),
    media: z
      .array(
        z.object({
          url: z.string().url(),
          assetId: z.string().trim().min(1).optional(),
          type: z
            .enum(["image", "video"])
            .optional()
            .describe(
              "Only when the library cannot tell; a stored asset's own kind wins.",
            ),
        }),
      )
      .max(50),
  }),
  execute: async (input, ctx) => {
    const { brand } = await requireOwnedCampaign(input.campaignId, ctx.orgId);
    // Every item used to be stamped "image", so a chat-attached clip rendered
    // through <img> as a blank tile. Ask the library what the bytes are.
    const media: MediaItem[] = await Promise.all(
      input.media.map(async (item) => {
        const resolved = await MediaService.resolveLibraryMedia({
          brandId: brand.id,
          userId: ctx.userId,
          url: item.url,
        });
        const type =
          resolved.kind === "video"
            ? "video"
            : resolved.kind
              ? "image"
              : (item.type ?? mediaTypeForUrl(item.url));
        return {
          url: resolved.url,
          type,
          assetId: item.assetId ?? resolved.assetId,
          ...(resolved.thumbnailUrl
            ? { thumbnail: resolved.thumbnailUrl }
            : {}),
        };
      }),
    );
    return setCampaignCreativePool({
      campaignId: input.campaignId,
      media,
      organizationId: ctx.orgId,
    });
  },
});

export const setPlatformDraftAction = growthAction({
  description:
    "Set a platform draft's AUTHORITATIVE budget and its platform-specific settings before pushing: Google needs a campaign type (a search campaign without keywords is rejected at push — its keywords derive from the audiences' suggestions unless overridden here); Meta takes pixel and budget mode; LinkedIn takes the authoring Company Page id, a manual bid and the CTA, all optional. Local only.",
  inputSchema: z.object({
    platformCampaignId: z
      .string()
      .trim()
      .min(1)
      .describe("The pcamp_ draft row, from openCampaign."),
    budget: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Whole currency units — the number the push will send."),
    budgetType: z.enum(["daily", "lifetime"]).optional(),
    google: z
      .object({
        campaignType: z.enum(["search", "display"]).optional(),
        keywords: z.array(z.string().trim().min(1)).max(200).optional(),
        negativeKeywords: z.array(z.string().trim().min(1)).max(200).optional(),
        additionalHeadlines: z
          .array(z.string().trim().max(30))
          .max(14)
          .optional(),
        additionalDescriptions: z
          .array(z.string().trim().max(90))
          .max(4)
          .optional(),
        businessName: z.string().trim().max(25).optional(),
      })
      .optional(),
    meta: z
      .object({
        pixelId: z.string().trim().min(1).optional(),
        customEventType: z.string().trim().min(1).optional(),
        budgetMode: z.enum(["cbo", "abo"]).optional(),
      })
      .optional(),
    linkedin: z
      .object({
        organizationId: z
          .string()
          .trim()
          .max(64)
          .optional()
          .describe(
            "Company Page that authors the ads (numeric id or urn:li:organization:N). Omit when the ad account is owned by the Page.",
          ),
        costType: z.enum(LINKEDIN_COST_TYPES).optional(),
        unitCost: z
          .number()
          .positive()
          .optional()
          .describe("Manual bid in whole currency units; omit for automated."),
        callToAction: z.enum(LINKEDIN_CALL_TO_ACTIONS).optional(),
      })
      .optional(),
  }),
  execute: async (input, ctx) =>
    setPlatformDraft({ ...input, organizationId: ctx.orgId }),
});

export const attachCampaignAction = growthAction({
  description:
    "Attach a per-platform campaign that sync pulled to a first-party campaign, either an existing one or a new one minted from its name. This is how a campaign nobody authored here gets a parent so its spend rolls up. Local only.",
  inputSchema: z.object({
    platformCampaignId: z.string().trim().min(1),
    campaignId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Attach to this existing campaign…"),
    newCampaignName: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe("…or mint one with this name. Provide exactly one."),
  }),
  execute: async (input, ctx) =>
    attachPlatformCampaign({
      ...input,
      campaignId: input.campaignId ?? null,
      newCampaignName: input.newCampaignName ?? null,
      organizationId: ctx.orgId,
    }),
});

export const pullPlatformAudiencesAction = growthAction({
  description:
    "Mirror the custom audiences already sitting in a brand's allowlisted ad accounts into Growth, so ad sets can target what the client built before they connected. Reads the provider; writes only Growth's own mirror rows and changes nothing on the platform.",
  inputSchema: z.object({ brandSlug: destinationSchema.brandSlug }),
  execute: async (input, ctx) =>
    syncBrandPlatformAudiences({
      brandSlug: input.brandSlug,
      organizationId: ctx.orgId,
    }),
});

export const deleteCampaignDraftAction = growthAction({
  description:
    "Delete a LOCAL campaign draft with its ad sets and ads. Refused once a per-platform campaign exists for it — delete that on the platform first. Nothing on any ad platform is touched.",
  inputSchema: z.object({ campaignId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteDraftCampaign({ ...input, organizationId: ctx.orgId }),
});

export const deleteAudienceAction = growthAction({
  description:
    "Delete a campaign audience. Refused once it is compiled to a live ad set. Local only.",
  inputSchema: z.object({ audienceId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteAudience({ ...input, organizationId: ctx.orgId }),
});

export const deleteAdDraftAction = growthAction({
  description:
    "Delete a drafted ad. Local only — the platform ads it compiled to keep running and keep their history.",
  inputSchema: z.object({ adId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteDraftAd({ ...input, organizationId: ctx.orgId }),
});

export const pushDraftAction = growthAction({
  description:
    "COMPILE a LOCAL campaign onto one platform: each audience becomes an ad set / ad group, every creative ad runs under each, and region names resolve to real platform geo keys. Budget, dates and settings come from the platform DRAFT row (set them with setPlatformDraft first), so this takes no numbers of its own. Everything is created PAUSED; adsWrite.setDelivery starts spend separately. Set validateOnly for a dry run — Meta only, single audience only. LinkedIn: campaign group → campaign (the ad set) → creative. ONE push sends every creative ad, same as Meta — the first opens the campaign and the rest are attached to it, one provider call each. Do not split a campaign across several pushes or ask the operator to pick a subset. LinkedIn targets at country level only, and its goals are engagement / traffic / awareness / video_views. Call adsRead.listDestinations first for the account ids; never guess them.",
  inputSchema: z.object({
    campaignId: z.string().trim().min(1),
    platform: z.enum(PUSHABLE_AD_PLATFORMS).optional(),
    connectionAccountId: destinationSchema.connectionAccountId,
    adAccountId: destinationSchema.adAccountId,
    goal: z.enum(AD_PUSH_GOALS),
    validateOnly: z.boolean().optional(),
  }),
  execute: async (input, ctx) =>
    pushDraftToPlatform(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const setDeliveryAction = growthAction({
  description:
    "Start or pause delivery of a per-platform campaign. Setting status to active STARTS SPEND on the client's ad account immediately. Requires explicit operator approval, and pausing is the reverse of the same action.",
  inputSchema: z.object({
    platformCampaignId: z.string().trim().min(1),
    status: z.enum(["active", "paused"]),
  }),
  execute: async (input, ctx) =>
    setCampaignDelivery(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const deletePlatformCampaignAction = growthAction({
  description:
    "Delete a campaign on the ad account itself, cascading to its ad sets and ads on the platform. Reporting history goes with it and this cannot be undone. Pausing via adsWrite.setDelivery is usually what is wanted instead. Requires explicit operator approval.",
  inputSchema: z.object({
    platformCampaignId: z.string().trim().min(1),
    connectionAccountId: destinationSchema.connectionAccountId.optional(),
  }),
  execute: async (input, ctx) =>
    deletePlatformCampaign(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});
