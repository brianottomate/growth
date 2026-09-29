import { env } from "@/env";
import { campaignPath } from "@/lib/campaign-navigation";
import {
  adsScopeOutputSchema,
  topAdsOutputSchema,
  listAdsDestinationsOutputSchema,
  draftCampaignActionOutputSchema,
  createSpecializedMetaDraftActionOutputSchema,
  boostMetaPostActionOutputSchema,
  duplicateMetaCampaignActionOutputSchema,
  createAudienceActionOutputSchema,
  addAudienceUsersActionOutputSchema,
  draftAdActionOutputSchema,
  openCampaignActionOutputSchema,
  previewAdActionOutputSchema,
  importCreativeActionOutputSchema,
  linkAudienceActionOutputSchema,
  listCampaignsActionOutputSchema,
  replaceAdCardActionOutputSchema,
  addAudienceActionOutputSchema,
  updateAudienceActionOutputSchema,
  planPlatformActionOutputSchema,
  setCreativePoolActionOutputSchema,
  setPlatformDraftActionOutputSchema,
  attachCampaignActionOutputSchema,
  pullPlatformAudiencesActionOutputSchema,
  deleteCampaignDraftActionOutputSchema,
  deleteAudienceActionOutputSchema,
  deleteAdDraftActionOutputSchema,
  pushDraftActionOutputSchema,
  setDeliveryActionOutputSchema,
  deletePlatformCampaignActionOutputSchema,
  createReportingConversionActionOutputSchema,
  buildAdSetActionOutputSchema,
  addAdShellActionOutputSchema,
  createAdsFromAssetsActionOutputSchema,
  setAdHomeActionOutputSchema,
  setHomeHeroActionOutputSchema,
  catalogHomeFactsActionOutputSchema,
  suggestCampaignAudiencesActionOutputSchema,
  editCatalogCardActionOutputSchema,
  editAdCardsActionOutputSchema,
  attachAdSetActionOutputSchema,
  setAdStatusActionOutputSchema,
  setAdCopyActionOutputSchema,
  setPlacementCopyActionOutputSchema,
  clearPlacementActionOutputSchema,
  freezePlacementActionOutputSchema,
  unfreezePlacementActionOutputSchema,
  saveIdeaActionOutputSchema,
  ideaHomePhotosActionOutputSchema,
  importMetaCampaignActionOutputSchema,
  ideaContextActionOutputSchema,
} from "./outputs/ads";
import { adChatContext } from "@/server/services/ad-chat-context.service";
import { suggestCampaignAudiences } from "@/server/services/campaign-audience-suggestions.service";
import {
  importMetaCampaign,
  importMetaCampaignSchema,
} from "@/server/services/meta-campaign-import.service";
import { metaPlacementPlanSchema } from "@/lib/meta-placement-plan";
import {
  compositionImagePositionSchema,
  compositionTemplateIdSchema,
} from "@/lib/compositions";
import { EM_DASH_MESSAGE, hasEmDash } from "@/lib/catalog-copy";
import "server-only";
import { ideaSaveSchema, ideaExportShapesSchema } from "@/lib/ad-idea-studio";
import { saveAdIdea } from "@/server/services/ad-idea-studio.service";

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
  createMetaAdDraft,
  deletePlatformCampaign,
  duplicateMetaCampaign,
  ensureBrandReportingConversion,
  listAdsWriteDestinations,
  createAdAudience,
  addAdAudienceUsers,
  pushDraftToPlatform,
  previewDraftAd,
  setCampaignDelivery,
  syncBrandPlatformAudiences,
} from "@/server/services/ads-write.service";
import {
  adIdeaHomePhotos,
  addAudience,
  addDraftAd,
  attachPlatformCampaign,
  createDraftCampaign,
  deleteAudience,
  deleteDraftCampaign,
  getDraftCampaign,
  importPlatformAdCreative,
  replaceDraftAdMedia,
  linkPlatformAudience,
  listBrandCampaigns,
  planPlatform,
  setCampaignCreativePool,
  setPlatformDraft,
  updateAudience,
} from "@/server/services/ads-draft.service";
import {
  catalogHomeFacts,
  editCatalogCard,
  setCatalogHomeHero,
} from "@/server/services/catalog-studio.service";
import {
  requireOwnedCampaign,
  starterIdeaHomes,
} from "@/server/services/ads-draft.service";
import { MediaService } from "@/server/services/media.service";
import { mediaTypeForUrl } from "@/lib/media-url";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, type MediaItem } from "@/server/db/schema";
import {
  addAdShell,
  attachAdSet,
  buildAdSet,
  clearPlacement,
  createAdsFromAssets,
  deleteAd,
  editAdCards,
  freezePlacement,
  setAdCopy,
  setAdHome,
  setAdStatus,
  setPlacementCopy,
  unfreezePlacement,
  writeSetCopy,
} from "@/server/services/ad-set.service";
import {
  runStarterGeneration,
  startStarterGeneration,
  starterGenerationStatus,
} from "@/server/services/starter-ad-generation.service";
import { AD_PLACEMENT_SPECS } from "@/lib/ad-placements";
import { HAND_MADE_AD_FORMATS, MAX_SET_HOMES } from "@/lib/performance-ads";

import { GrowthActionError, growthAction } from "./types";

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
  outputSchema: adsScopeOutputSchema,
  description:
    "CHEAP lay-of-the-land for Wander's Meta (Facebook) ad performance over a window (default last 365 days): totals (impressions/clicks/CTR/spend/engagement), spend-by-month, and breakdowns by objective (OUTCOME_SALES≈consumer marketplace vs OUTCOME_LEADS≈PM/WanderOS) and by ad DESTINATION (audit / os / marketplace / lead-form / …). Includes flags like hasAuditAds. CALL THIS FIRST for any 'which ads / ad performance / what are we running / are we driving to X' question — it grounds your follow-ups (e.g. it tells you instantly that we've run zero audit-destination ads). Then call topAds to drill in.",
  inputSchema: z.object(windowSchema),
  execute: async (input, ctx) =>
    computeAdsScope({ ...input, organizationId: ctx.orgId }),
});

export const topAds = growthAction({
  outputSchema: topAdsOutputSchema,
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
  outputSchema: listAdsDestinationsOutputSchema,
  description:
    "List the active Zernio Meta, Google or LinkedIn connection and the live provider ad accounts that are explicitly allowlisted for one owned brand. Use this before any adsWrite action; never guess either account id. Each Meta destination carries the Facebook Page it runs as (pageId) and runsAsBrandPage; a false value means the connection cannot access the brand Page. Performance clients may use an explicitly shared managing-brand connection with their own Page identity. trackingDefaults contains the verified pixelId and customEventType inherited for this paying account; use these for campaign setup unless the operator requests an override.",
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
  outputSchema: draftCampaignActionOutputSchema,
  description:
    "Create a LOCAL campaign draft — the editable first-party object shown at /app/brands/{brandSlug}/ads/{campaignId}. Nothing touches any ad platform: per-platform campaigns are created later by the push, which is a separate operator-approved step. Use planPlatform and setPlatformDraft to prepare delivery, then push after operator approval.",
  inputSchema: z.object({
    brandSlug: destinationSchema.brandSlug,
    name: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe(
        "Omit to use the house convention: META_PERF+BRAND_SALES_PURCHASE_YYYYMM for a signed client, META_BRAND_SALES_PURCHASE_YYYYMM otherwise.",
      ),
    platforms: z
      .array(z.enum(PLANNABLE_AD_PLATFORMS))
      .max(PLANNABLE_AD_PLATFORMS.length)
      .optional()
      .describe(
        "Platforms to plan: each gets a local draft platform campaign holding its budget and settings. Omit for a thin campaign with no platform planned yet.",
      ),
    landingUrl: z.string().url().optional(),
    goal: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    budget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Total intended budget in whole dollars (an intake's is monthly). Advisory only: the platform draft's daily or lifetime budget is set separately with setPlatformDraft before a push.",
      ),
    campaignId: z.string().trim().min(1).optional(),
  }),
  execute: async (input, ctx) => {
    const result = await createDraftCampaign({
      ...input,
      organizationId: ctx.orgId,
    });
    return {
      ...result,
      handoff: {
        reviewUrl: new URL(
          campaignPath(
            result.brandSlug ?? result.campaign.brandId,
            result.campaign.id,
            "performance",
          ),
          env.NEXT_PUBLIC_BASE_URL,
        ).href,
        brandId: result.campaign.brandId,
        campaignId: result.campaign.id,
        reviewPath: campaignPath(
          result.brandSlug ?? result.campaign.brandId,
          result.campaign.id,
          "performance",
        ),
        state: "draft" as const,
        nextAction:
          "Review the creative, audience and platform plan in Growth. Provider push and delivery require in-app approval.",
      },
    };
  },
});

export const createSpecializedMetaDraftAction = growthAction({
  outputSchema: createSpecializedMetaDraftActionOutputSchema,
  description:
    "Create a specialized Meta campaign for lead generation, lead conversion, app promotion, or catalog sales through Zernio. Standard traffic, engagement, awareness, video views, and conversion campaigns must use draftCampaign then push. Create a campaign, ad set, and ad — single-image via imageUrl, or a 2–10 card carousel via carouselCards. The campaign is forced to PAUSED so it cannot spend until activated in a separate operator step. Set validateOnly to check Meta's tree without creating it. Requires explicit operator approval even for validation because Meta uploads referenced media during dry runs.",
  inputSchema: z
    .object({
      ...destinationSchema,
      name: z.string().trim().min(1).max(255),
      campaignName: z.string().trim().min(1).max(255).optional(),
      adSetName: z.string().trim().min(1).max(255).optional(),
      adName: z.string().trim().min(1).max(255).optional(),
      goal: z.enum([
        "lead_generation",
        "lead_conversion",
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

export const boostMetaPostAction = growthAction({
  outputSchema: boostMetaPostActionOutputSchema,
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
  outputSchema: duplicateMetaCampaignActionOutputSchema,
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
  outputSchema: createAudienceActionOutputSchema,
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
    personaId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "The persona this asset is bought for. Every campaign audience derived from the persona then targets it; it replaces the persona's previous asset on Meta.",
      ),
  }),
  execute: async (input, ctx) =>
    createAdAudience(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const addAudienceUsersAction = growthAction({
  outputSchema: addAudienceUsersActionOutputSchema,
  description:
    "Upload members (plaintext email and/or phone; Zernio hashes server-side) to a customer_list audience created through createAudience. Audiences made directly in Meta cannot take uploads. Batches of 10,000 per request; partial progress is reported on failure so a retry can resume rather than duplicate.",
  inputSchema: z.object({
    platformAudienceId: z
      .string()
      .trim()
      .min(1)
      .describe("The platformAudienceId (paud_…) returned by createAudience."),
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
  execute: async (input, ctx) =>
    addAdAudienceUsers({ ...input, organizationId: ctx.orgId }),
});

export const draftAdAction = growthAction({
  outputSchema: draftAdActionOutputSchema,
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
        .describe(
          "creative only; required for it. 20 to 40 characters, sentence case, one idea. Meta shows it beside the primary text, so never repeat the body's first line.",
        ),
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
          "creative only: shorthand for imageUrls with a single entry — the single-image creative shape.",
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
  outputSchema: openCampaignActionOutputSchema,
  description:
    "Read one first-party campaign in full: its brief, ad sets and their audiences, drafted and live ads, and any per-platform campaigns the push created. Use this before editing a campaign so you are working from its current state rather than what was said earlier in the conversation.",
  inputSchema: z.object({
    campaignId: z
      .string()
      .trim()
      .min(1)
      .describe("A camp_ id, from the campaign URL or adsRead.listCampaigns."),
  }),
  execute: async (input, ctx) => {
    const result = await getDraftCampaign(ctx.orgId, input.campaignId);
    return {
      ...result,
      handoff: {
        reviewUrl: new URL(
          campaignPath(
            result.brand.slug ?? result.brand.id,
            result.campaign.id,
            "performance",
          ),
          env.NEXT_PUBLIC_BASE_URL,
        ).href,
        brandId: result.brand.id,
        campaignId: result.campaign.id,
        reviewPath: campaignPath(
          result.brand.slug ?? result.brand.id,
          result.campaign.id,
          "performance",
        ),
        state: result.platformCampaigns.some((row) => row.status === "live")
          ? ("live" as const)
          : result.platformCampaigns.some((row) => row.externalId)
            ? ("pushed" as const)
            : ("draft" as const),
        nextAction:
          "Review this campaign in Growth. Provider changes require the in-app approval flow; local draft edits remain available here.",
      },
    };
  },
});

export const previewAdAction = growthAction({
  outputSchema: previewAdActionOutputSchema,
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
  outputSchema: importCreativeActionOutputSchema,
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
  outputSchema: linkAudienceActionOutputSchema,
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

export const createReportingConversionAction = growthAction({
  outputSchema: createReportingConversionActionOutputSchema,
  description:
    "Create (or reuse) a Performance client's reporting conversion on one Meta ad account: a custom conversion for the account's default tracking event, scoped to the brand's website, so the client's own bookings report apart from the fleet's. It only counts events from its creation on. Run it once per client when asked; pushes do not create it.",
  inputSchema: z.object({
    brandSlug: z.string().trim().min(1),
    connectionAccountId: z.string().trim().min(1),
    adAccountId: z.string().trim().min(1),
  }),
  execute: async (input, ctx) =>
    ensureBrandReportingConversion(input, { organizationId: ctx.orgId }),
});

export const listCampaignsAction = growthAction({
  outputSchema: listCampaignsActionOutputSchema,
  description:
    "List a brand's per-platform campaigns, including ones sync pulled that are not attached to any first-party campaign. Use it to find a campaign id, or to see what is waiting to be attached.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
  }),
  execute: async (input, ctx) =>
    listBrandCampaigns({ brandId: input.brandId, organizationId: ctx.orgId }),
});

export const replaceAdCardAction = growthAction({
  outputSchema: replaceAdCardActionOutputSchema,
  description:
    "Put a different library asset in one card slot of a LOCAL draft ad (index 0 is the first card; a single-image ad has one). Use it after freezing a corrected composition to swap the card that looked wrong. Local only; a pushed ad keeps the platform's copy.",
  inputSchema: z.object({
    adId: z.string().min(1),
    index: z.number().int().min(0).max(9).default(0),
    mediaAssetId: z.string().min(1),
  }),
  examples: [{ adId: "ad_01", index: 2, mediaAssetId: "media_01" }],
  execute: async (input, ctx) => {
    const { ad, replaced } = await replaceDraftAdMedia({
      organizationId: ctx.orgId,
      ...input,
    });
    return {
      adId: ad.id,
      index: input.index,
      replacedUrl: replaced.url,
      cards: ("media" in ad.content ? ad.content.media : []).length,
    };
  },
});

export const addAudienceAction = growthAction({
  outputSchema: addAudienceActionOutputSchema,
  description:
    "Add an audience to a LOCAL campaign: one buyable narrowing (one age window, one geography, optional keyword suggestions) that the push compiles to a Meta ad set / Google ad group. Default to ONE audience and ONE ad set per campaign. Reuse or update the existing audience. Only propose or create multiple audiences when the operator explicitly requests a split or experiment. Local only, and an audience carries NO money — budgets live on the platform draft. Omit everything but the name for broad targeting, which is a legitimate and often correct choice.",
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
    states: z
      .array(z.string().trim().length(2))
      .max(60)
      .optional()
      .describe('US state codes, e.g. ["CO"]. Send regions alongside them.'),
    regions: z
      .array(z.string().trim().min(1).max(100))
      .max(60)
      .optional()
      .describe(
        'Region/state names, e.g. ["California"] — resolved to platform geo keys at push.',
      ),
    cities: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    keywords: z
      .array(z.string().trim().min(1).max(80))
      .max(50)
      .optional()
      .describe(
        "Loose suggestions. The Google compile derives keywords from these; Meta ignores them.",
      ),
  }),
  examples: [
    {
      campaignId: "camp_contract",
      name: "US multi-state",
      regions: Array.from({ length: 28 }, (_, index) => `Region ${index + 1}`),
    },
  ],
  execute: async (input, ctx) =>
    addAudience({
      campaignId: input.campaignId,
      name: input.name,
      personaId: input.personaId ?? null,
      ageMin: input.ageMin ?? null,
      ageMax: input.ageMax ?? null,
      geography:
        input.countries?.length ||
        input.states?.length ||
        input.regions?.length ||
        input.cities?.length
          ? {
              countries: input.countries,
              states: input.states?.map((code) => code.toUpperCase()),
              regions: input.regions,
              cities: input.cities,
            }
          : null,
      keywords: input.keywords ?? null,
      organizationId: ctx.orgId,
    }),
});

export const updateAudienceAction = growthAction({
  outputSchema: updateAudienceActionOutputSchema,
  description:
    "Update a campaign audience's fields — name, age window, geography, or keyword suggestions. Only the fields sent are changed. Local only. Budgets live on the platform draft (setPlatformDraft), never on an audience.",
  inputSchema: z.object({
    audienceId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(300).optional(),
    ageMin: z.number().int().min(13).max(100).nullish(),
    ageMax: z.number().int().min(13).max(100).nullish(),
    countries: z.array(z.string().length(2)).max(20).optional(),
    states: z.array(z.string().trim().length(2)).max(60).optional(),
    regions: z.array(z.string().trim().min(1).max(100)).max(60).optional(),
    cities: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  }),
  examples: [
    {
      audienceId: "aud_contract",
      regions: Array.from({ length: 28 }, (_, index) => `Region ${index + 1}`),
    },
  ],
  execute: async (input, ctx) =>
    updateAudience({
      audienceId: input.audienceId,
      name: input.name,
      ageMin: input.ageMin,
      ageMax: input.ageMax,
      geography:
        input.countries !== undefined ||
        input.states !== undefined ||
        input.regions !== undefined ||
        input.cities !== undefined
          ? {
              countries: input.countries,
              states: input.states?.map((code) => code.toUpperCase()),
              regions: input.regions,
              cities: input.cities,
            }
          : undefined,
      keywords: input.keywords,
      organizationId: ctx.orgId,
    }),
});

export const planPlatformAction = growthAction({
  outputSchema: planPlatformActionOutputSchema,
  description:
    "Plan a platform for a LOCAL campaign: creates the draft platform campaign row that holds that platform's authoritative budget and settings. Local only; idempotent per platform. Does not require Zernio, a connected ad account, or listDestinations. Account connection is needed later for pushing, not planning.",
  inputSchema: z.object({
    campaignId: z.string().trim().min(1),
    platform: z.enum(PLANNABLE_AD_PLATFORMS),
  }),
  execute: async (input, ctx) =>
    planPlatform({ ...input, organizationId: ctx.orgId }),
});

export const setCreativePoolAction = growthAction({
  outputSchema: setCreativePoolActionOutputSchema,
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
  outputSchema: setPlatformDraftActionOutputSchema,
  description:
    "Set a platform draft's AUTHORITATIVE budget and its platform-specific settings before pushing: Google needs a campaign type (a search campaign without keywords is rejected at push — its keywords derive from the audiences' suggestions unless overridden here); Meta takes pixel, conversion event, placements, budget mode, and optional schedule controls (startWhenLaunched/runUntilPaused). Daily budgets need no dates; lifetime budgets need an end. Read listDestinations for verified trackingDefaults instead of guessing a pixel; LinkedIn takes the authoring Company Page id, a manual bid and the CTA, all optional. Also the only place to set flight dates, which a lifetime budget requires. Local only.",
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
      .nullish()
      .describe(
        "Whole currency units — the number the push will send. null clears it.",
      ),
    budgetType: z.enum(["daily", "lifetime"]).nullish(),
    startAt: z
      .string()
      .datetime()
      .nullish()
      .describe(
        "Optional ISO start; overrides the campaign, null clears it. For Meta, set startWhenLaunched false when scheduling, true to start on launch.",
      ),
    endAt: z
      .string()
      .datetime()
      .nullish()
      .describe(
        "ISO end for this platform's flight, null clears it. REQUIRED by a lifetime budget — the push refuses one without an end date, and this is the only place to set it.",
      ),
    google: z
      .object({
        campaignType: z.enum(["search", "display"]).optional(),
        images: z
          .object({ landscape: z.string().url(), square: z.string().url() })
          .optional()
          .describe(
            "Display crops: separate 1.91:1 landscape and 1:1 square images. Omit to use the creative image for both.",
          ),
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
        destination: z
          .object({
            connectionAccountId: z.string().trim().min(1),
            adAccountId: z.string().trim().min(1),
          })
          .optional()
          .describe(
            "The ad account the push uses, from listDestinations. Saved so every later push and preview reuses it.",
          ),
        goal: z.enum(AD_PUSH_GOALS).optional(),
        startWhenLaunched: z
          .boolean()
          .optional()
          .describe(
            "Start when launched; do not inherit or invent a start date.",
          ),
        runUntilPaused: z
          .boolean()
          .optional()
          .describe(
            "No end date; daily budgets only. False allows a scheduled or inherited end.",
          ),
        pixelId: z
          .string()
          .trim()
          .max(64)
          .optional()
          .describe("Empty string drops the override."),
        customEventType: z.string().trim().max(64).optional(),
        customConversionId: z.string().trim().max(64).optional(),
        conversionScope: z
          .enum(["host", "pixel"])
          .optional()
          .describe(
            "Client brands only. pixel (default) optimises on the shared pixel event, for volume; host optimises on the conversion scoped to the client's site. Either way the site-scoped conversion is provisioned for reporting. Use host only when the operator asks for it.",
          ),
        budgetMode: z
          .enum(["cbo", "abo"])
          .optional()
          .describe("cbo (default) is how Performance campaigns run."),
        placements: metaPlacementPlanSchema.optional(),
        importReviewed: z.boolean().optional(),
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
  execute: async ({ startAt, endAt, ...input }, ctx) =>
    setPlatformDraft({
      ...input,
      organizationId: ctx.orgId,
      startAt: startAt == null ? startAt : new Date(startAt),
      endAt: endAt == null ? endAt : new Date(endAt),
    }),
});

export const attachCampaignAction = growthAction({
  outputSchema: attachCampaignActionOutputSchema,
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
  outputSchema: pullPlatformAudiencesActionOutputSchema,
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
  outputSchema: deleteCampaignDraftActionOutputSchema,
  description:
    "Delete a LOCAL campaign draft with its ad sets and ads. Refused once a per-platform campaign exists for it — delete that on the platform first. Nothing on any ad platform is touched.",
  inputSchema: z.object({ campaignId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteDraftCampaign({ ...input, organizationId: ctx.orgId }),
});

export const deleteAudienceAction = growthAction({
  outputSchema: deleteAudienceActionOutputSchema,
  description:
    "Delete a campaign audience. Refused once it is compiled to a live ad set. Local only.",
  inputSchema: z.object({ audienceId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteAudience({ ...input, organizationId: ctx.orgId }),
});

export const deleteAdDraftAction = growthAction({
  outputSchema: deleteAdDraftActionOutputSchema,
  description:
    "Delete a drafted ad, whether it sits on the brand's set or in a campaign. Local only — the platform ads it compiled to keep running and keep their history.",
  inputSchema: z.object({ adId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteAd({ adId: input.adId, orgId: ctx.orgId }),
});

export const pushDraftAction = growthAction({
  outputSchema: pushDraftActionOutputSchema,
  description:
    "COMPILE a LOCAL campaign onto one platform: each audience becomes an ad set / ad group, every creative ad runs under each, and region names resolve to real platform geo keys. Budget, dates and settings come from the platform DRAFT row (set them with setPlatformDraft first), so this takes no numbers of its own. Everything is created PAUSED; adsWrite.setDelivery starts spend separately. Set validateOnly for a dry run — Meta only, single audience only. LinkedIn: campaign group → campaign (the ad set) → creative. ONE push sends every creative ad, same as Meta — the first opens the campaign and the rest are attached to it, one provider call each. Do not split a campaign across several pushes or ask the operator to pick a subset. LinkedIn targets at country level only, and its goals are engagement / traffic / awareness / video_views. Call adsRead.listDestinations first for the account ids; never guess them.",
  inputSchema: z.object({
    campaignId: z.string().trim().min(1),
    platform: z
      .enum(PUSHABLE_AD_PLATFORMS)
      .describe(
        "Required. Always name the platform the operator asked for — this is not inferred, and getting it wrong creates a campaign on the wrong ad account.",
      ),
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
  outputSchema: setDeliveryActionOutputSchema,
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
  outputSchema: deletePlatformCampaignActionOutputSchema,
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

export const buildAdSetAction = growthAction({
  outputSchema: buildAdSetActionOutputSchema,
  description:
    "Draw a Performance client's whole ad set: a static and a carousel per home, then BOTH a portfolio carousel and a catalog ad, which is the house plan and is not negotiable. Name the homes (propertyIds, WanderOS listing ids in portfolio order) or name a count ('build me five statics and five carousels' is count 5): the homes on the client's Performance record come first and their site's own order fills the rest, and the result says which were chosen. Writes the captions in one pass from each home's own amenities and description, walks each home's carousel through its real room photos, and lands every ad as a draft against the brand with no campaign. Rebuilding replaces the last set and leaves anything already approved alone. Bind or swap a home afterwards with setAdHome. Call it only when the operator asks for ads; to feature a home, use performanceWrite.updateHome.",
  inputSchema: z
    .object({
      brandId: z.string().min(1),
      propertyIds: z.array(z.string().min(1)).max(MAX_SET_HOMES).optional(),
      count: z
        .number()
        .int()
        .min(1)
        .max(MAX_SET_HOMES)
        .optional()
        .describe(
          "How many homes to choose when none are named; 3 to 10 is the product, 5 the default.",
        ),
    })
    .refine((value) => !(value.propertyIds?.length && value.count), {
      message: "Name the homes or a count, not both.",
    }),
  examples: [
    { brandId: "brand_01", count: 5 },
    { brandId: "brand_01", propertyIds: ["1234567890123", "1234567890124"] },
  ],
  execute: async (input, ctx) => {
    const result = await buildAdSet({
      brandId: input.brandId,
      orgId: ctx.orgId,
      propertyIds: input.propertyIds,
      count: input.count,
      userId: ctx.userId,
      // A person drawing the set writes the words after the cards look right.
      copy: ctx.surface === "app" ? "defer" : "ai",
    });
    return { ok: true as const, ...result };
  },
});

export const writeSetCopyAction = growthAction({
  description:
    "Write the headline and caption onto ads already drawn, in one model pass that sees each home's photos: the brand's unassigned set (unapproved ads only), or one campaign's ads when campaignId is given (approved ads too, since the operator asked for that campaign by name; artwork is never touched). The same as Write copy in the app.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    campaignId: z.string().min(1).optional(),
  }),
  outputSchema: z.object({ brandId: z.string(), updated: z.number() }),
  examples: [
    { brandId: "brand_01" },
    { brandId: "brand_01", campaignId: "camp_01" },
  ],
  execute: (input, ctx) => writeSetCopy({ ...input, orgId: ctx.orgId }),
});

export const generateStarterIdeasAction = growthAction({
  description:
    "Generate a campaign's starter ad ideas, the same as Generate ideas on the campaign page: from the brand's featured homes (source featured, the default: per home a static and a carousel with photos chosen from its gallery, plus a portfolio hero carousel) or three copy-only brand concepts (source brand). Every idea lands as an unapproved draft for the operator to review and approve; nothing is pushed. Waits for the run to finish and reports what it made.",
  inputSchema: z.object({
    campaignId: z.string().min(1),
    source: z.enum(["featured", "brand"]).default("featured"),
    homeIds: z
      .array(z.string().min(1))
      .max(10)
      .optional()
      .describe(
        "Featured home row ids. Omit for every featured home that has photos, up to ten.",
      ),
    stories: z
      .boolean()
      .default(true)
      .describe("Also plan Facebook and Instagram Stories for featured ideas."),
  }),
  outputSchema: z.object({
    runId: z.string(),
    status: z.enum(["queued", "processing", "ready", "error", "cancelled"]),
    created: z.number(),
    total: z.number(),
    error: z.string().nullable(),
  }),
  examples: [
    { campaignId: "camp_01" },
    { campaignId: "camp_01", source: "brand" },
  ],
  execute: async (input, ctx) => {
    const homeIds =
      input.source === "brand"
        ? []
        : (input.homeIds ??
          (
            await starterIdeaHomes({
              campaignId: input.campaignId,
              organizationId: ctx.orgId,
            })
          )
            .filter((home) => home.photos.length)
            .slice(0, 10)
            .map((home) => home.id));
    const args = {
      campaignId: input.campaignId,
      source: input.source,
      homeIds,
      intendedPlacements: [
        "facebook-feed" as const,
        "instagram-feed" as const,
        ...(input.source === "featured" && input.stories
          ? (["facebook-story", "instagram-story"] as const)
          : []),
      ],
      organizationId: ctx.orgId,
    };
    const { runId } = await startStarterGeneration(args);
    await runStarterGeneration(runId, args);
    const run = await starterGenerationStatus({
      campaignId: input.campaignId,
      organizationId: ctx.orgId,
    });
    return {
      runId,
      status: run?.status ?? ("error" as const),
      created: run?.created ?? 0,
      total: run?.total ?? 0,
      error: run?.error ?? null,
    };
  },
});

export const addAdShellAction = growthAction({
  outputSchema: addAdShellActionOutputSchema,
  description:
    "Add one empty ad of a declared format (static, carousel, catalog or video), bound to one of their homes by WanderOS listing id, or by name alone when the brand's site is not connected. Lands on the brand's wall, or straight in a campaign when campaignId is given. The creative comes afterwards with editAdCards, by upload into the library or from it. Use this when the operator wants the ads to exist first and fill them in, or wants an ad the build does not make.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    format: z.enum(HAND_MADE_AD_FORMATS),
    propertyId: z
      .string()
      .min(1)
      .optional()
      .describe("WanderOS listing id; omit for a brand ad about no home."),
    homeName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe(
        "The home by name, for a brand with no WanderOS site connected.",
      ),
    campaignId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Put the ad in this draft campaign instead of on the brand's wall.",
      ),
    name: z
      .string()
      .trim()
      .max(300)
      .optional()
      .describe("Omit for the house name."),
  }),
  examples: [
    { brandId: "brand_01", format: "static", propertyId: "1234567890123" },
  ],
  execute: (input, ctx) => addAdShell({ ...input, orgId: ctx.orgId }),
});

export const createAdsFromAssetsAction = growthAction({
  outputSchema: createAdsFromAssetsActionOutputSchema,
  description:
    "Turn finished creatives already in the media library into drafted ads in one go: 'statics' makes one static per asset, 'carousel' makes one carousel of them all in the order given (2 to 10). The home each ad is about is read off the filename when it follows the export convention (Brand_Home_Format_...) and matches a home on their site; pass propertyId to bind them all to one home instead. Files that name no home make ads that wait to be bound.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    mediaAssetIds: z.array(z.string().min(1)).min(1).max(50),
    as: z.enum(["statics", "carousel"]),
    propertyId: z.string().min(1).optional(),
    homeName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe(
        "Bind them all to this home by name, for a brand with no site connected.",
      ),
    campaignId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Put the ads in this draft campaign instead of on the brand's wall.",
      ),
  }),
  examples: [
    {
      brandId: "brand_01",
      mediaAssetIds: ["media_01", "media_02"],
      as: "statics",
    },
  ],
  execute: (input, ctx) => createAdsFromAssets({ ...input, orgId: ctx.orgId }),
});

export const setHomeHeroAction = growthAction({
  outputSchema: setHomeHeroActionOutputSchema,
  description:
    "Make one of a Performance client's home photos that home's hero: the photo its ads, previews and catalog card draw on. photoNumber is the 1-based number printed on the home's contact sheet in the catalog conversation; photoUrl is one of the home's gallery photo URLs instead. Replaces the previous hero; run it again to change it. Refused while the home's catalog card is approved.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    homeId: z.string().min(1).describe("The WanderOS listing id."),
    photoNumber: z.number().int().min(1).optional(),
    photoUrl: z
      .string()
      .url()
      .optional()
      .describe("A photo from the home's own gallery, when not by number."),
    force: z
      .boolean()
      .optional()
      .describe(
        "Local development only: change an approved card anyway. Ignored when deployed.",
      ),
  }),
  examples: [
    { brandId: "brd_01", homeId: "1234567890123", photoNumber: 4 },
    {
      brandId: "brd_01",
      homeId: "1234567890123",
      photoUrl: "https://example.com/photo.jpg",
    },
  ],
  execute: ({ photoNumber, photoUrl, ...input }, ctx) => {
    if ((photoNumber === undefined) === (photoUrl === undefined))
      throw new GrowthActionError(
        "invalid_input",
        "Give either photoNumber or photoUrl.",
      );
    return setCatalogHomeHero({
      ...input,
      userId: ctx.userId,
      photo: photoUrl ? { url: photoUrl } : { number: photoNumber! },
    });
  },
});

export const suggestCampaignAudiencesAction = growthAction({
  outputSchema: suggestCampaignAudiencesActionOutputSchema,
  description:
    "Propose 1 to 5 audiences for a Performance client's campaign from the evidence: the brand's market (feeder cities), what its direct bookings say about the booking window, and the audiences already synced in its ad account. Each suggestion says why; add the ones the operator wants with addAudience (geo: cities, states, countries, ages; lookalike or retargeting: the platformAudienceId names the asset). Nothing is saved or pushed. Guest-origin data is not available for WanderOS sites, so geo suggestions rest on the market on Setup.",
  inputSchema: z.object({
    campaignId: z.string().min(1),
    count: z.number().int().min(1).max(5).optional(),
  }),
  examples: [{ campaignId: "camp_01" }],
  execute: (input, ctx) =>
    suggestCampaignAudiences({ ...input, organizationId: ctx.orgId }),
});

export const catalogHomeFactsAction = growthAction({
  outputSchema: catalogHomeFactsActionOutputSchema,
  description:
    "Read what homes' listings say, for writing their catalog cards: the complete amenity list, the description, the location paragraph (what the home is near), pets, bedrooms, baths, guests, the listing URL and the card's current headline. Use this instead of reading the public listing page, which shows only the first few amenities. Up to 16 homes per call; for a whole catalog, call it once per batch.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    homeIds: z
      .array(z.string().min(1))
      .min(1)
      .max(16)
      .describe("WanderOS listing ids."),
  }),
  examples: [{ brandId: "brd_01", homeIds: ["1234567890123"] }],
  execute: ({ brandId, homeIds }, ctx) =>
    catalogHomeFacts(ctx.userId, brandId, homeIds),
});

export const editCatalogCardAction = growthAction({
  outputSchema: editCatalogCardActionOutputSchema,
  description:
    "Change one home's card in a Performance client's catalog draft: the headline printed on the image (title, e.g. 'Exposed-brick loft in Louisville, KY'), the facts line (subtitle), the composition template, the crop focus, the logo, whether the home is in the export, the amenity pills on the amenities cards, and the library image or supplied artwork it uses. Send only the fields to change. Saves the draft; nothing is exported or pushed. An approved card is locked: only whether it is in the export can change until the operator reopens it. Approval is the operator's, through setCatalogApproval.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    homeId: z.string().min(1).describe("The WanderOS listing id."),
    title: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((text) => !hasEmDash(text), EM_DASH_MESSAGE)
      .optional(),
    subtitle: z
      .string()
      .max(220)
      .refine((text) => !hasEmDash(text), EM_DASH_MESSAGE)
      .optional(),
    templateId: compositionTemplateIdSchema.optional(),
    imagePosition: compositionImagePositionSchema.optional(),
    showLogo: z.boolean().optional(),
    included: z.boolean().optional(),
    pills: z
      .array(z.string().trim().min(1).max(24))
      .max(4)
      .optional()
      .describe(
        "Amenity pills on the amenities cards: two to four short labels of amenities this listing has.",
      ),
    mode: z
      .enum(["compose", "finished"])
      .nullable()
      .optional()
      .describe(
        "finished: the card is supplied artwork (finishedAssetId) used as-is; compose: drawn from a photo and the template; null: back to the default.",
      ),
    imageAssetId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe(
        "A brand media library image to draw the card on instead of the home's hero; null goes back to the hero.",
      ),
    finishedAssetId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe(
        "Supplied artwork from the brand's media library for a finished card; null clears it.",
      ),
    force: z
      .boolean()
      .optional()
      .describe(
        "Local development only: change an approved card anyway. Ignored when deployed.",
      ),
  }),
  examples: [
    {
      brandId: "brd_01",
      homeId: "1234567890123",
      title: "Exposed-brick loft in Louisville, KY",
    },
  ],
  execute: ({ brandId, homeId, force, ...patch }, ctx) =>
    editCatalogCard({ userId: ctx.userId, brandId, homeId, patch, force }),
});

export const setAdHomeAction = growthAction({
  outputSchema: setAdHomeActionOutputSchema,
  description:
    "Bind a drafted ad to one of the client's homes (WanderOS listing id), or by name alone when their site is not connected, or unbind it with neither. The link moves to that home's page unless someone typed one by hand, a name in the house convention follows the home, and the wall files the ad under it. This is how an ad is retrofitted onto a different home.",
  inputSchema: z.object({
    adId: z.string().min(1),
    propertyId: z.string().min(1).nullable().optional(),
    homeName: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .optional()
      .describe(
        "The home by name, for a brand with no WanderOS site connected.",
      ),
  }),
  examples: [{ adId: "ad_01", propertyId: "1234567890123" }],
  execute: (input, ctx) => setAdHome({ ...input, orgId: ctx.orgId }),
});

export const editAdCardsAction = growthAction({
  outputSchema: editAdCardsActionOutputSchema,
  description:
    "One change to a drafted ad's cards. With a library asset: replace the card at an index, append a card, remove one, move one. Per placement: setStory pins a 9:16 library asset to a card for stories and reels, clearStory drops it, makeStory derives one from the card's baseline (auto picks the best method: re-render when the card came from a composition, extend the photo past its edges via outpaint, else a centred crop; or name crop/extend/render). A static holds one card, a carousel two to ten (one while it is being filled), a video ad one clip. Works on ads in the brand's set and on ads in a campaign that has not been pushed.",
  inputSchema: z.object({
    adId: z.string().min(1),
    edit: z.discriminatedUnion("op", [
      z.object({
        op: z.literal("replace"),
        index: z.number().int().min(0).max(9),
        mediaAssetId: z.string().min(1),
      }),
      z.object({ op: z.literal("append"), mediaAssetId: z.string().min(1) }),
      z.object({
        op: z.literal("remove"),
        index: z.number().int().min(0).max(9),
      }),
      z.object({
        op: z.literal("move"),
        index: z.number().int().min(0).max(9),
        to: z.number().int().min(0).max(9),
      }),
      z.object({
        op: z.literal("setStory"),
        index: z.number().int().min(0).max(9),
        mediaAssetId: z.string().min(1),
      }),
      z.object({
        op: z.literal("clearStory"),
        index: z.number().int().min(0).max(9),
      }),
      z.object({
        op: z.literal("makeStory"),
        index: z.number().int().min(0).max(9),
        how: z.enum(["auto", "crop", "extend", "render"]).optional(),
      }),
    ]),
  }),
  examples: [
    { adId: "ad_01", edit: { op: "append", mediaAssetId: "media_01" } },
  ],
  execute: (input, ctx) =>
    editAdCards({ ...input, orgId: ctx.orgId, userId: ctx.userId }),
});

export const attachAdSetAction = growthAction({
  outputSchema: attachAdSetActionOutputSchema,
  description:
    "Put the brand's approved drafted ads, or the ones named, into a campaign so the push can send them. Refuses an ad with no creative. Local only; nothing reaches a platform until adsWrite.push.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    campaignId: z.string().min(1),
    adIds: z.array(z.string().min(1)).max(100).optional(),
  }),
  examples: [{ brandId: "brand_01", campaignId: "camp_01" }],
  execute: (input, ctx) => attachAdSet({ ...input, orgId: ctx.orgId }),
});

export const setAdStatusAction = growthAction({
  outputSchema: setAdStatusActionOutputSchema,
  description:
    "Approve an ad (a sign-off on copy and creative), or reopen it as an editable draft. Its images are rendered and saved at push, which waits for them before creating anything. Supply expectedUpdatedAt from the latest read. This never publishes to a platform.",
  inputSchema: z.object({
    adId: z.string().min(1),
    status: z.enum(["drawn", "approved"]),
    expectedUpdatedAt: z.string().datetime().optional(),
    exportShapes: ideaExportShapesSchema.optional(),
  }),
  execute: (input, ctx) =>
    setAdStatus({
      adId: input.adId,
      orgId: ctx.orgId,
      status: input.status,
      expectedUpdatedAt: input.expectedUpdatedAt,
      exportShapes: input.exportShapes,
      userId: ctx.userId,
    }),
});

export const setAdCopyAction = growthAction({
  outputSchema: setAdCopyActionOutputSchema,
  description:
    "Rewrite the words on one drafted ad: its headline, primary text, description, and each carousel card's own Meta headline and description. The images are left alone. Emoji belong in primary text and never in the words drawn onto a card.",
  inputSchema: z.object({
    adId: z.string().min(1),
    headline: z
      .string()
      .max(60)
      .optional()
      .describe(
        '20 to 40 characters, sentence case, one idea: what the stay offers, who it is for or a proof point ("Room for 18 in the Hocking Hills woods"). Never the primary text\'s first line; Meta shows both.',
      ),
    body: z
      .string()
      .max(1200)
      .optional()
      .describe(
        "For one home: a hook naming the place and what sets the home apart with one emoji, four to six emoji bullets, the facts bullet, one sentence on who it is for, a short closing line, blank lines between the parts.",
      ),
    description: z
      .string()
      .max(120)
      .optional()
      .describe(
        "Meta's grey line under the headline, ideally under 60 characters: plain facts such as sleeps, bedrooms, one amenity. Never the headline again. Empty string clears it.",
      ),
    cards: z
      .array(
        z.object({
          headline: z.string().max(60).optional(),
          description: z.string().max(120).optional(),
        }),
      )
      .max(10)
      .optional()
      .describe(
        "Carousel only, in card order: each card's own Meta headline and description. A card showing a different home should name it. Blank inherits the ad's.",
      ),
  }),
  execute: (input, ctx) =>
    setAdCopy({
      adId: input.adId,
      orgId: ctx.orgId,
      headline: input.headline,
      body: input.body,
      description: input.description,
      cards: input.cards,
    }),
});

// ---- Placement cells: one platform x placement of one ad ------------------
// The base creative is edited with setAdCopy/editAdCards; these touch one cell
// that differs from the base. Singular by design: the model reads the matrix,
// then fires one call per cell it wants to change, freeze or reset.

const PLACEMENT_KEY_DESC =
  "Which cell: '<platform>:<placement>'. Meta today: " +
  AD_PLACEMENT_SPECS.map((s) => s.key).join(", ") +
  ".";

export const setPlacementCopyAction = growthAction({
  outputSchema: setPlacementCopyActionOutputSchema,
  description:
    "Override the words for ONE placement of one ad, leaving the base and every other placement alone. Use for copy that should differ on, say, the story but not the feed. A field left out inherits the base; send an empty string to clear one override back to the base.",
  inputSchema: z.object({
    adId: z.string().min(1),
    placementKey: z.string().min(1).describe(PLACEMENT_KEY_DESC),
    headline: z.string().max(400).optional(),
    body: z.string().max(2000).optional(),
    callToAction: z.string().max(60).optional(),
  }),
  execute: (input, ctx) =>
    setPlacementCopy({
      adId: input.adId,
      orgId: ctx.orgId,
      placementKey: input.placementKey,
      patch: {
        headline: input.headline === "" ? null : input.headline,
        body: input.body === "" ? null : input.body,
        callToAction: input.callToAction === "" ? null : input.callToAction,
      },
      via: ctx.surface === "app" ? "manual" : "ai",
    }),
});

export const clearPlacementAction = growthAction({
  outputSchema: clearPlacementActionOutputSchema,
  description:
    "Drop every override on ONE placement of one ad, back to a live render of the base. Refuses nothing; a cell that was already rendering is unchanged.",
  inputSchema: z.object({
    adId: z.string().min(1),
    placementKey: z.string().min(1).describe(PLACEMENT_KEY_DESC),
  }),
  execute: (input, ctx) =>
    clearPlacement({
      adId: input.adId,
      orgId: ctx.orgId,
      placementKey: input.placementKey,
    }),
});

export const freezePlacementAction = growthAction({
  outputSchema: freezePlacementActionOutputSchema,
  description:
    "Freeze ONE placement of one ad: pin the copy and files the push will take for it, so a later base edit cannot move it. A story cell derives its 9:16; the feed shapes pin the base asset. Freezing does not push anything; it marks a cell decided. Read the returned fit before you freeze copy that is over a platform limit.",
  inputSchema: z.object({
    adId: z.string().min(1),
    placementKey: z.string().min(1).describe(PLACEMENT_KEY_DESC),
  }),
  execute: (input, ctx) =>
    freezePlacement({
      adId: input.adId,
      orgId: ctx.orgId,
      userId: ctx.userId,
      placementKey: input.placementKey,
    }),
});

export const unfreezePlacementAction = growthAction({
  outputSchema: unfreezePlacementActionOutputSchema,
  description:
    "Unfreeze ONE placement of one ad, keeping its pinned copy and files as an ordinary override so it can be edited again.",
  inputSchema: z.object({
    adId: z.string().min(1),
    placementKey: z.string().min(1).describe(PLACEMENT_KEY_DESC),
  }),
  execute: (input, ctx) =>
    unfreezePlacement({
      adId: input.adId,
      orgId: ctx.orgId,
      placementKey: input.placementKey,
    }),
});

export const saveIdeaAction = growthAction({
  outputSchema: saveIdeaActionOutputSchema,
  description:
    "Save an editable image ad idea: shared ad copy, ordered source images, per-image composition recipes and shape overrides. Read the campaign first for the current updatedAt and ideaStudio document. Preserves recipes and returns the ad to draft; does not publish or materialize renders.",
  inputSchema: ideaSaveSchema,
  execute: (input, ctx) =>
    saveAdIdea(input, { orgId: ctx.orgId, userId: ctx.userId }),
});

export const ideaHomePhotosAction = growthAction({
  outputSchema: ideaHomePhotosActionOutputSchema,
  description:
    "Read the full home gallery for a campaign ad idea. To shortlist candidates, add source references to the ideaStudio document pool using saveIdea; selected slides live separately in cards.",
  inputSchema: z.object({ adId: z.string().min(1) }),
  execute: (input, ctx) =>
    adIdeaHomePhotos({ ...input, organizationId: ctx.orgId }),
});

export const importMetaCampaignAction = growthAction({
  outputSchema: importMetaCampaignActionOutputSchema,
  description:
    "Read a live Meta campaign from this brand’s allowlisted account and copy its ads, original artwork and audiences into a NEW local draft. Preserve raw creative and delivery settings, explicitly mark unsupported mappings, and leave the live campaign unchanged. Repeated imports return the existing copy.",
  inputSchema: importMetaCampaignSchema,
  execute: (input, ctx) =>
    importMetaCampaign(input, { orgId: ctx.orgId, userId: ctx.userId }),
});

export const ideaContextAction = growthAction({
  outputSchema: ideaContextActionOutputSchema,
  description:
    "Read one ad's current editable document, version, ordered source-image URLs (including size variants), brand voice and facts for every represented home. Use before saveIdea. Image URLs are references; inspect them visually before making composition decisions. Write every slide's copy by its copyRules, from the homes' facts, never from the images.",
  inputSchema: z.object({
    campaignId: z.string().min(1),
    adId: z.string().min(1),
  }),
  execute: (input, ctx) =>
    adChatContext({ ...input, organizationId: ctx.orgId }),
});
