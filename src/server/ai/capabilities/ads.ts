import {
  previewMetaAdditions,
  publishMetaAdditions,
  refreshMetaCampaign,
} from "@/server/services/ads-reconcile.service";
import { addDeliveryGroup } from "@/server/services/ads-draft.service";
import {
  previewMetaAdditionsOutputSchema,
  publishMetaAdditionsOutputSchema,
} from "./outputs/ads";
import { audienceAgeSchema } from "@/lib/audience-age";
import { deliveryGroupConfigurationSchema } from "@/lib/platform-delivery";
import { deliveryGeographySchema } from "@/lib/platform-delivery";
import { catalogCopyPatchSchema } from "@/lib/catalog-studio";
import { steerSchema } from "@/lib/generation-steer";
import {
  deletePlatformCampaignActionNativeResultSchema,
  setDeliveryActionNativeResultSchema,
  pushDraftActionNativeResultSchema,
  setPlatformDraftActionNativeResultSchema,
  updateAudienceActionNativeResultSchema,
  addAudienceActionNativeResultSchema,
  openCampaignActionNativeResultSchema,
  createAudienceActionNativeResultSchema,
  duplicateCampaignActionNativeResultSchema,
  boostMetaPostActionNativeResultSchema,
  createSpecializedMetaDraftActionNativeResultSchema,
  draftCampaignActionNativeResultSchema,
  draftAdResultSchema,
  adsScopeOutputSchema,
  topAdsOutputSchema,
  listAdsDestinationsOutputSchema,
  draftCampaignActionOutputSchema,
  createSpecializedMetaDraftActionOutputSchema,
  boostMetaPostActionOutputSchema,
  duplicateAdActionOutputSchema,
  duplicateCampaignActionOutputSchema,
  pushAdActionOutputSchema,
  removePlatformAdActionOutputSchema,
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
  createGoogleAdsAccountActionOutputSchema,
  listPixelsActionOutputSchema,
  setupMetaPixelActionOutputSchema,
  setTrackingDefaultsActionOutputSchema,
  createReportingConversionActionOutputSchema,
  createLeadFormActionOutputSchema,
  listLeadFormsActionOutputSchema,
  addAdShellActionOutputSchema,
  createAdsFromAssetsActionOutputSchema,
  setAdHomeActionOutputSchema,
  setHomeHeroActionOutputSchema,
  catalogHomeFactsActionOutputSchema,
  suggestCampaignAudiencesActionOutputSchema,
  editCatalogCardActionOutputSchema,
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

import {
  AD_OWNER_MESSAGE,
  adAuthoringFields,
  hasAdOwner,
  textAdCopySchema,
} from "@/lib/ad-authoring";
import { env } from "@/env";
import { campaignPath } from "@/lib/campaign-navigation";

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
  AD_CALL_TO_ACTIONS,
  LINKEDIN_CALL_TO_ACTIONS,
  LINKEDIN_COST_TYPES,
  OPENAI_BID_STRATEGIES,
  OPENAI_PUSH_GOALS,
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
  ensureBrandReportingConversion,
  listAdsWriteDestinations,
  createAdAudience,
  addAdAudienceUsers,
  pushAdToPlatformCampaign,
  pushDraftToPlatform,
  previewDraftAd,
  setCampaignDelivery,
  syncBrandPlatformAudiences,
} from "@/server/services/ads-write.service";
import { ensureBrandGoogleAdsAccount } from "@/server/services/google-ads-accounts.service";
import {
  duplicateAd,
  duplicateCampaign,
} from "@/server/services/ads-duplicate.service";
import { removePlatformAd } from "@/server/services/platform-ad.service";
import {
  createBrandLeadForm,
  listBrandLeadForms,
} from "@/server/services/meta-lead-forms.service";
import { META_LEAD_FORM_TEMPLATES } from "@/lib/meta-lead-forms";
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
  setDeliveryGroup,
  deleteDeliveryGroup,
  updateAudience,
} from "@/server/services/ads-draft.service";
import {
  catalogHomeFacts,
  catalogListingId,
  catalogListingIds,
  editCatalogCard,
  setCatalogHomeHero,
} from "@/server/services/catalog-studio.service";
import {
  requireOwnedCampaign,
  resolveAdAuthoringScope,
} from "@/server/services/ads-draft.service";
import { MediaService } from "@/server/services/media.service";
import { mediaTypeForUrl } from "@/lib/media-url";

import { type AdCard, type MediaItem } from "@/server/db/schema";
import { videoAdCardFor } from "@/server/services/video-delivery.service";
import {
  addAdShell,
  attachAdSet,
  clearPlacement,
  createAdsFromAssets,
  deleteAd,
  freezePlacement,
  setAdCopy,
  setAdHome,
  setAdStatus,
  setPlacementCopy,
  unfreezePlacement,
  setAdPlatforms,
} from "@/server/services/ad-set.service";
import { returnAdToStudio } from "@/server/services/ad-approval.service";

import { AD_PLACEMENT_SPECS } from "@/lib/ad-placements";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { writeGoogleTextAds } from "@/server/services/google-text-ads.service";
import { HAND_MADE_AD_FORMATS } from "@/lib/performance-ads";

import {
  listBrandMetaPixels,
  setBrandMetaTrackingDefaults,
  setupBrandMetaPixel,
} from "@/server/services/meta-connect-setup.service";
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
  audienceInclude: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe(
      "Platform custom-audience ids to include (the platformAudienceId from adsRead, never Zernio's own id).",
    ),
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
    "List the active Zernio Meta, Google, LinkedIn or OpenAI connection and the live provider ad accounts that are explicitly allowlisted for one owned brand. Use this before any adsWrite action; never guess either account id. Each Meta destination carries the Facebook Page it runs as (pageId) and runsAsBrandPage; a false value means the connection cannot access the brand Page. Performance clients may use an explicitly shared managing-brand connection with their own Page identity. trackingDefaults contains the verified pixelId and customEventType inherited for this paying account; use these for campaign setup unless the operator requests an override.",
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
  nativeOutputSchema: draftCampaignActionNativeResultSchema,
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
        "Editable campaign label. Omit for a readable monthly sales label with a nickname. Meta house naming is compiled separately on platform push.",
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
      userId: ctx.userId,
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

/**
 * Callers built before the dry run was removed still send validateOnly: true.
 * Stripping it silently would turn their check into a real create, so it is
 * refused by name.
 */
const removedDryRunSchema = z
  .literal(false, {
    error:
      "There is no dry run any more. Drop validateOnly and push for real: everything is created paused.",
  })
  .optional()
  .describe("Removed. Omit it: there is no dry run.");

export const createSpecializedMetaDraftAction = growthAction({
  nativeOutputSchema: createSpecializedMetaDraftActionNativeResultSchema,
  outputSchema: createSpecializedMetaDraftActionOutputSchema,
  description:
    "Create a specialized Meta campaign for lead generation, lead conversion, app promotion, or catalog sales through Zernio. Standard traffic, engagement, awareness, video views, and conversion campaigns must use draftCampaign then push. Create a campaign, ad set, and ad — single-image via imageUrl, or a 2–10 card carousel via carouselCards. The campaign is forced to PAUSED so it cannot spend until activated in a separate operator step. Requires explicit operator approval.",
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
      validateOnly: removedDryRunSchema,
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
  nativeOutputSchema: boostMetaPostActionNativeResultSchema,
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

export const duplicateCampaignAction = growthAction({
  nativeOutputSchema: duplicateCampaignActionNativeResultSchema,
  outputSchema: duplicateCampaignActionOutputSchema,
  description:
    "Copy a LOCAL campaign inside Growth: its ads (same creative and media, unpushed so they are editable again), audiences with their lookalike links, and platform drafts with their delivery groups and budget. Nothing touches any ad platform; the copy is a draft that push takes to the platform paused. Use it to run the same creative in a second campaign or to change ads that a push has locked.",
  inputSchema: z.object({
    campaignId: z
      .string()
      .trim()
      .min(1)
      .describe("The camp_ id of the campaign to copy."),
    name: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe('Name for the copy. Omit for the source name plus " copy".'),
  }),
  execute: async (input, ctx) => {
    const result = await duplicateCampaign({
      ...input,
      userId: ctx.userId,
      organizationId: ctx.orgId,
    });
    const path = campaignPath(
      result.brandSlug ?? result.campaign.brandId,
      result.campaign.id,
      "performance",
    );
    return {
      ...result,
      path,
      handoff: {
        reviewUrl: new URL(path, env.NEXT_PUBLIC_BASE_URL).href,
        brandId: result.campaign.brandId,
        campaignId: result.campaign.id,
        reviewPath: path,
        state: "draft" as const,
        nextAction:
          "Review the copy in Growth, then push it from the campaign page. It is created paused on the platform.",
      },
    };
  },
});

export const duplicateAdAction = growthAction({
  outputSchema: duplicateAdActionOutputSchema,
  description:
    "Copy ONE ad into another campaign of the same brand, inside Growth: same creative, copy and media (shared, not re-uploaded), approval kept, nothing pushed. Use it to run an ad in a second campaign. When the target campaign is already on a platform, the result lists those platform campaigns; send the copy into each with adsWrite.pushAd. Nothing touches any ad platform.",
  inputSchema: z.object({
    adId: z.string().trim().min(1).describe("The ad_ id of the ad to copy."),
    targetCampaignId: z
      .string()
      .trim()
      .min(1)
      .describe("The camp_ id of the campaign the copy belongs to."),
  }),
  execute: async (input, ctx) =>
    duplicateAd({ ...input, organizationId: ctx.orgId }),
});

export const createAudienceAction = growthAction({
  nativeOutputSchema: createAudienceActionNativeResultSchema,
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
  nativeOutputSchema: draftAdResultSchema,
  outputSchema: draftAdActionOutputSchema,
  description:
    "Add an unassigned draft to Ad Studio, using a brand or campaign as authoring context (campaignId, brandId, or both). Approval is required before the existing ad is consumed by a campaign. Local only. Type creative (default) carries headline, body and media: a library assetId, one image url, several image urls (a carousel, in order), or a video url, for Meta. Media the operator attached this turn can be passed by its chat url directly; it is saved into the brand's library and its video poster resolved for you. Type text is a pool of headlines and descriptions, for Google/OpenAI.",
  inputSchema: z
    .object({
      ...adAuthoringFields,
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
          "Meta wants a still alongside the clip. Only read while the clip has no renditions; once they exist each crop carries its own poster and this is ignored.",
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
        .describe(
          "creative only: a media_asset id (media_…) from the brand's library, as mediaLibraryRead.list returns it. Enough on its own for a single-image or video ad; its url is resolved here, so no imageUrl is needed.",
        ),
    })
    .refine(hasAdOwner, { message: AD_OWNER_MESSAGE })
    .refine(
      (input) =>
        input.type === "text" ||
        (Boolean(input.headline) &&
          Boolean(input.body) &&
          ((input.imageUrls?.length ?? 0) > 0 ||
            Boolean(input.imageUrl) ||
            Boolean(input.videoUrl) ||
            Boolean(input.assetId))),
      {
        // Name the actual fields: an error that says "imageUrl" teaches the
        // model to resend the wrong shape.
        error:
          "A creative ad needs headline, body, and media: assetId (a library media_asset id), imageUrls (array, carousel-capable), imageUrl (single), or videoUrl.",
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
  examples: [
    {
      campaignId: "camp_01",
      brandId: "brand_01",
      name: "Lake house weekend",
      headline: "Room for everyone this fall",
      body: "Book the lake house your whole crew fits in.",
      assetId: "media_01",
    },
  ],
  execute: async (input, ctx) => {
    let media: AdCard[] = [];
    // A library id is the whole media reference; the url lives on the row.
    let videoUrl = input.videoUrl;
    if (input.type === "creative") {
      const { brand } = await resolveAdAuthoringScope({
        ...input,
        organizationId: ctx.orgId,
      });
      const resolve = (url: string) =>
        MediaService.resolveLibraryMedia({
          brandId: brand.id,
          userId: ctx.userId,
          url,
        });

      let imageUrls = input.imageUrls?.length
        ? input.imageUrls
        : input.imageUrl
          ? [input.imageUrl]
          : [];
      if (input.assetId && !videoUrl && imageUrls.length === 0) {
        const asset = await MediaService.get(input.assetId);
        if (!asset || asset.brandId !== brand.id || !asset.url)
          throw new Error(
            `No library media ${input.assetId} on brand ${brand.id}. Pass an assetId from mediaLibraryRead.list for this brand, or the image's url.`,
          );
        if (asset.kind === "video") videoUrl = asset.url;
        else if (asset.kind === "image" || asset.kind === "gif")
          imageUrls = [asset.url];
        else
          throw new Error(
            `Library media ${input.assetId} is ${asset.kind}; an ad takes an image, gif or video asset.`,
          );
      }

      if (videoUrl) {
        const resolved = await resolve(videoUrl);
        const item: MediaItem = {
          url: resolved.url,
          type: "video",
          assetId: input.assetId ?? resolved.assetId,
        };
        // A library video with renditions becomes the 4:5 feed crop carrying
        // its 9:16 file as the Stories/Reels cut, as the studio builds it.
        const card = (await videoAdCardFor(item)) ?? item;
        const thumbnail =
          card.thumbnail ?? input.videoThumbnailUrl ?? resolved.thumbnailUrl;
        if (!thumbnail) {
          throw new Error(
            "This video has no poster frame yet, and Meta will not take a video ad without one. A library video gets its poster when its renditions finish, a few minutes after upload; try again then, or pass videoThumbnailUrl.",
          );
        }
        media = [{ ...card, thumbnail }];
      } else {
        media = await Promise.all(
          imageUrls.map(async (url) => {
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
      brandId: input.brandId,
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
              ...(videoUrl ? { format: "video" as const } : {}),
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
  nativeOutputSchema: openCampaignActionNativeResultSchema,
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

export const listLeadFormsAction = growthAction({
  outputSchema: listLeadFormsActionOutputSchema,
  description:
    "List the active Meta instant (lead) forms on the Facebook Page a brand's ads run as, with their questions. A Meta platform draft with the lead_generation goal points at one of these by id (setPlatformDraft meta.leadFormId). Read before choosing; never guess a form id.",
  inputSchema: z.object({
    brandSlug: destinationSchema.brandSlug,
  }),
  execute: async (input, ctx) =>
    listBrandLeadForms({ ...input, organizationId: ctx.orgId }),
});

const leadFormQuestionSchema = z.union([
  z.object({
    type: z.enum([
      "EMAIL",
      "PHONE",
      "FULL_NAME",
      "FIRST_NAME",
      "LAST_NAME",
      "STREET_ADDRESS",
      "CITY",
    ]),
  }),
  z.object({
    type: z.literal("CUSTOM"),
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]+$/)
      .max(64)
      .describe(
        "Answer key, lowercase snake_case; what the lead payload carries.",
      ),
    label: z.string().trim().min(1).max(200),
    options: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(64),
          value: z.string().trim().min(1).max(100),
        }),
      )
      .min(2)
      .max(20)
      .optional()
      .describe("Multiple choice when given; free text otherwise."),
  }),
]);

export const createLeadFormAction = growthAction({
  outputSchema: createLeadFormActionOutputSchema,
  description:
    "Create a Meta instant (lead) form on the Facebook Page a brand's ads run as, from a house template (operator_qualification for WanderOS property-manager leads, guest_inquiry for a client's travellers) or an explicit spec. Meta never edits a form, so a change is a new form, and the create is not idempotent: call it once, then point the Meta platform draft at the returned form id with setPlatformDraft meta.leadFormId and the lead_generation goal. Creates a Page asset; spends nothing.",
  inputSchema: z.object({
    brandSlug: destinationSchema.brandSlug,
    template: z.enum(META_LEAD_FORM_TEMPLATES).optional(),
    locations: z
      .array(z.string().trim().min(1).max(60))
      .max(12)
      .optional()
      .describe(
        "owner_acquisition only: the places offered for 'Where is the property?', e.g. ['Bend, Oregon', 'Redmond, Oregon']. Omit for the brand's market towns.",
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("Overrides the template's name; required with a spec."),
    spec: z
      .object({
        privacyPolicyUrl: z.string().url(),
        followUpUrl: z
          .string()
          .url()
          .describe("Where the thank-you button sends people."),
        higherIntent: z
          .boolean()
          .default(false)
          .describe("Adds a review step before submit."),
        locale: z.string().trim().max(10).default("en_US"),
        questions: z.array(leadFormQuestionSchema).min(1).max(15),
      })
      .optional()
      .describe("Explicit form content; fields given override the template."),
  }),
  execute: async (input, ctx) =>
    createBrandLeadForm({ ...input, organizationId: ctx.orgId }),
});

export const createGoogleAdsAccountAction = growthAction({
  outputSchema: createGoogleAdsAccountActionOutputSchema,
  description:
    "Create (or reuse) a Performance client's own Google Ads account under Wander's manager account, plus its one booking conversion. Currency (USD) and time zone (Eastern) cannot be changed afterwards. Run it once per client when asked; billing and the Zernio connection are set up by a person afterwards.",
  inputSchema: z.object({
    brandSlug: z.string().trim().min(1),
  }),
  execute: async (input, ctx) =>
    ensureBrandGoogleAdsAccount(input, { organizationId: ctx.orgId }),
});

export const listPixelsAction = growthAction({
  outputSchema: listPixelsActionOutputSchema,
  description:
    "List the Meta pixels on a brand's pinned ad account: which is the saved default (the tracking campaigns inherit) and which the brand's WanderOS site fires (firesOnSite null when the site could not be read). Reads only.",
  inputSchema: z.object({ brandId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    listBrandMetaPixels({ ...input, organizationId: ctx.orgId }),
});

export const setupMetaPixelAction = growthAction({
  outputSchema: setupMetaPixelActionOutputSchema,
  description:
    "Settle a brand's default Meta pixel on its pinned ad account, the same step that runs when the client connects Meta: keep the saved or site pixel, adopt a sole pixel, CREATE one in the client's own ad account when it has none (once per brand and account, never retried), or open a pixel-choice task when several exist (pendingChoice). Also opens a task to install the pixel on the WanderOS site when the site does not fire it. Spends nothing and changes no campaign.",
  inputSchema: z.object({ brandId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    setupBrandMetaPixel({ ...input, organizationId: ctx.orgId }),
});

export const setTrackingDefaultsAction = growthAction({
  outputSchema: setTrackingDefaultsActionOutputSchema,
  description:
    "Save the default Meta pixel and conversion event for a brand's pinned ad account; campaigns inherit them unless a draft overrides. The pixel must be one adsRead.listPixels returns. Closes any open pixel-choice task and opens a site-install task when the site does not fire it. Local only.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    pixelId: z.string().trim().regex(/^\d+$/),
    customEventType: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .default("PURCHASE")
      .describe("Meta conversion event; PURCHASE for bookings."),
  }),
  execute: async (input, ctx) =>
    setBrandMetaTrackingDefaults({ ...input, organizationId: ctx.orgId }),
});

export const listCampaignsAction = growthAction({
  outputSchema: listCampaignsActionOutputSchema,
  description:
    "List the brand's first-party campaigns. Set availableForAds to find campaigns that can consume approved Studio ads.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    availableForAds: z.boolean().optional(),
  }),
  execute: async (input, ctx) =>
    listBrandCampaigns({ ...input, organizationId: ctx.orgId }),
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

/** Audience geography is residence intent, never the homes' destinations. */
const audienceGeographyInput = deliveryGeographySchema
  .nullish()
  .describe(
    "Where the people to reach live, never where the homes are. Default to whole US states; infer origin markets from destinations (e.g. drive-to states) and say so in the description. Cities are qualified 'City, ST' and need no separate state.",
  );

export const addAudienceAction = growthAction({
  nativeOutputSchema: addAudienceActionNativeResultSchema,
  outputSchema: addAudienceActionOutputSchema,
  description:
    "Add a shared campaign audience: who to reach and why, with optional intended geography, age range and a brand persona link. Platform plans own executable targeting. Local only.",
  inputSchema: z.object({
    campaignId: z.string().min(1),
    name: z.string().trim().min(1).max(300),
    type: z.enum(["segment", "lookalike", "custom"]).optional(),
    description: z.string().max(4000).nullish(),
    personaId: z.string().min(1).nullish(),
    geography: audienceGeographyInput,
    ...audienceAgeSchema.shape,
  }),
  execute: async (input, ctx) =>
    addAudience({ ...input, organizationId: ctx.orgId }),
});
export const updateAudienceAction = growthAction({
  nativeOutputSchema: updateAudienceActionNativeResultSchema,
  outputSchema: updateAudienceActionOutputSchema,
  description:
    "Update a shared campaign audience's name, explanation, intended geography, age range or persona. Executable targeting belongs in the platform plan. Local only.",
  inputSchema: z.object({
    audienceId: z.string().min(1),
    name: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(4000).nullish(),
    personaId: z.string().min(1).nullish(),
    geography: audienceGeographyInput,
    ...audienceAgeSchema.shape,
  }),
  execute: async (input, ctx) =>
    updateAudience({ ...input, organizationId: ctx.orgId }),
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
  nativeOutputSchema: setPlatformDraftActionNativeResultSchema,
  outputSchema: setPlatformDraftActionOutputSchema,
  description:
    "Set a platform draft's AUTHORITATIVE budget and its platform-specific settings before pushing: Google needs a campaign type (a search campaign without keywords is rejected at push — keywords live in delivery groups, with optional fallback keywords here); Meta takes pixel, conversion event, placements, budget mode, and optional schedule controls (startWhenLaunched/runUntilPaused). Daily budgets need no dates; lifetime budgets need an end. Read listDestinations for verified trackingDefaults instead of guessing a pixel; LinkedIn takes the authoring Company Page id, a manual bid and the CTA, all optional; OpenAI takes the goal, a fixed bid where automatic bidding is refused, and the conversion event. Also the only place to set flight dates, which a lifetime budget requires. Local only.",
  inputSchema: z.object({
    platformCampaignId: z
      .string()
      .trim()
      .min(1)
      .describe("The pcamp_ draft row, from openCampaign."),
    previewAdIds: z
      .array(z.string().trim().min(1))
      .max(500)
      .nullish()
      .describe(
        "Unassigned Studio ad IDs to preview in this platform plan. Local only; does not approve, assign or publish. null clears previews.",
      ),
    selectedAdIds: z
      .array(z.string().trim().min(1))
      .max(500)
      .nullish()
      .describe(
        "Campaign ad IDs to include on this platform. Omit to preserve, null for all eligible ads, [] for none. Local drafts only; does not approve ads.",
      ),
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
        goal: z
          .enum(["traffic", "engagement", "awareness", "conversions"])
          .optional(),
        geography: deliveryGeographySchema.optional(),
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
        leadFormId: z
          .string()
          .trim()
          .max(64)
          .optional()
          .describe(
            "lead_generation goal: the Meta instant form the ad set points at, from adsRead.listLeadForms or adsWrite.createLeadForm. Empty string drops it.",
          ),
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
    openai: z
      .object({
        goal: z.enum(OPENAI_PUSH_GOALS).optional(),
        bidStrategy: z
          .enum(OPENAI_BID_STRATEGIES)
          .optional()
          .describe(
            "Omit for Maximize Results, which OpenAI allows only for traffic and conversions on a daily budget; awareness and lifetime budgets need LOWEST_COST_WITH_BID_CAP or COST_CAP with bidAmount.",
          ),
        bidAmount: z
          .number()
          .positive()
          .optional()
          .describe(
            "Fixed bid in whole currency units, with a capped strategy.",
          ),
        customEventType: z
          .string()
          .trim()
          .max(64)
          .optional()
          .describe(
            "conversions goal: the optimizable event on the account's OpenAI tracking tag (id, eventType or name).",
          ),
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
    "Attach a per-platform campaign that sync pulled to a first-party campaign, either an existing one or a new one minted from its name, and read it back into the plan: each of its ad sets becomes an audience and each of its ads is matched to an idea with the same words and picture or becomes a new one. Attach a Meta and a Google campaign to the same plan to group them. Local only; nothing on the platform changes.",
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
      userId: ctx.userId,
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
    "Delete a LOCAL campaign draft with its ad sets and ads, and purge generated exports unused elsewhere. Source photos and shared media are retained. Refused while a live platform campaign exists — delete that first. Nothing on any ad platform is touched.",
  inputSchema: z.object({ campaignId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteDraftCampaign({ ...input, organizationId: ctx.orgId }),
});

export const deleteCampaignLeavingPlatformAction = growthAction({
  outputSchema: deleteCampaignDraftActionOutputSchema,
  description:
    "Delete a campaign's plan in Growth but LEAVE its platform campaigns on the ad account, where they keep running and spending with nothing here describing them. To remove them too, call adsWrite.deletePlatformCampaign for each first, then deleteCampaignDraft. Requires explicit operator approval.",
  inputSchema: z.object({ campaignId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteDraftCampaign({
      ...input,
      leaveOnPlatform: true,
      organizationId: ctx.orgId,
    }),
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
    "Delete an ad, wherever it is. If it is live on a platform it is deleted there first (Zernio deletes the platform ad, and an ad set or campaign Zernio created that is left empty). The record of what ran stays, with its stats. Pausing is the reversible alternative.",
  inputSchema: z.object({ adId: z.string().trim().min(1) }),
  execute: async (input, ctx) =>
    deleteAd({ adId: input.adId, orgId: ctx.orgId }),
});

export const pushDraftAction = growthAction({
  nativeOutputSchema: pushDraftActionNativeResultSchema,
  outputSchema: pushDraftActionOutputSchema,
  description:
    "COMPILE a LOCAL campaign onto one platform: each planned delivery group becomes an ad set / ad group, every creative ad runs under each, and region names resolve to real platform geo keys. Budget, dates and settings come from the platform DRAFT row (set them with setPlatformDraft first), so this takes no numbers of its own. Everything is created PAUSED; adsWrite.setDelivery starts spend separately. There is no dry run: push for real. If the push fails partway, what it created stays paused and recorded as an incomplete push, and the error says where it stopped; report that and let the operator choose to finish it in the platform or delete it with adsWrite.deletePlatformCampaign before pushing again. LinkedIn: campaign group → campaign (the ad set) → creative. ONE push sends every creative ad, same as Meta — the first opens the campaign and the rest are attached to it, one provider call each. Do not split a campaign across several pushes or ask the operator to pick a subset. LinkedIn targets at country level only, and its goals are engagement / traffic / awareness / video_views. OpenAI: campaign → ad group → ONE chat card per push (Zernio has no attach there), from the ad's openai_ads:chat_card placement copy (title 3–50, body ≤100; set it with adsWrite.setPlacementCopy), country targeting only, goals traffic / awareness / conversions; the push refuses more than one included ad or delivery group. Meta uses the exact connection already pinned in brand settings; omit credential ids and use the saved goal (default conversions). Do not ask the operator to choose credentials. For other platforms call adsRead.listDestinations for the account ids; never guess them.",
  inputSchema: z.object({
    campaignId: z.string().trim().min(1),
    platform: z
      .enum(PUSHABLE_AD_PLATFORMS)
      .describe(
        "Required. Always name the platform the operator asked for — this is not inferred, and getting it wrong creates a campaign on the wrong ad account.",
      ),
    connectionAccountId: destinationSchema.connectionAccountId.optional(),
    adAccountId: destinationSchema.adAccountId.optional(),
    goal: z.enum(AD_PUSH_GOALS).optional(),
    validateOnly: removedDryRunSchema,
  }),
  execute: async (input, ctx) =>
    pushDraftToPlatform(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const pushAdAction = growthAction({
  outputSchema: pushAdActionOutputSchema,
  description:
    "Send ONE approved ad into a platform campaign that is ALREADY pushed: it is created PAUSED inside each of that campaign's existing ad sets (or only deliveryGroupId), with the same names, link, placements and creative the full push builds. The ad must already belong to the campaign (adsWrite.duplicateAd or adsWrite.attachAdSet first). An ad set that already runs the ad is skipped. Nothing is created at campaign or ad set level and nothing starts spending; adsWrite.setDelivery does that. Meta only. For a campaign not on the platform yet, use adsWrite.push. Undo one with adsWrite.removePlatformAd.",
  inputSchema: z.object({
    adId: z.string().trim().min(1).describe("The ad_ id to send."),
    platformCampaignId: z
      .string()
      .trim()
      .min(1)
      .describe("The pcamp_ id of the pushed platform campaign."),
    deliveryGroupId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "One pdg_ ad set to send into. Omit for every ad set of the campaign.",
      ),
  }),
  execute: async (input, ctx) =>
    pushAdToPlatformCampaign(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const removePlatformAdAction = growthAction({
  outputSchema: removePlatformAdActionOutputSchema,
  description:
    "Take ONE ad out of a platform campaign by its platform_ad id (pad_, from adsRead.openCampaign or adsWrite.pushAd): the ad is cancelled on the platform and its record here is marked deleted, keeping what it ran. The plan ad, its ad set and the campaign stay. The inverse of adsWrite.pushAd; to delete the plan ad everywhere use adsWrite.deleteAdDraft. Meta only. Requires explicit operator approval.",
  inputSchema: z.object({
    platformAdId: z.string().trim().min(1).describe("The pad_ id."),
  }),
  execute: async (input, ctx) =>
    removePlatformAd({ ...input, organizationId: ctx.orgId }),
});

export const setDeliveryAction = growthAction({
  nativeOutputSchema: setDeliveryActionNativeResultSchema,
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
  nativeOutputSchema: deletePlatformCampaignActionNativeResultSchema,
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

export const writeGoogleTextAdsAction = growthAction({
  description:
    "Write Google Search text ads for a campaign or brand studio from a landing page and optional search terms: each a pool of up to 15 headlines (30 chars) and 4 descriptions (90 chars). Lands as unapproved text ideas; nothing is pushed. The same as Generate Search drafts in Ad Studio.",
  inputSchema: z
    .object({
      ...adAuthoringFields,
      steer: steerSchema,
      landingUrl: z.string().url().optional(),
      keywords: z.array(z.string().trim().min(1)).max(40).optional(),
      count: z.number().int().min(1).max(3).default(2),
    })
    .refine(hasAdOwner, { message: AD_OWNER_MESSAGE }),
  outputSchema: z.object({
    created: z.number(),
    adIds: z.array(z.string()),
  }),
  examples: [{ campaignId: "camp_01", count: 2 }],
  execute: (input, ctx) =>
    writeGoogleTextAds({ ...input, organizationId: ctx.orgId }),
});

export const setAdPlatformsAction = growthAction({
  description:
    "Choose which platforms an unpushed ad idea runs on. null (or an empty list) means every planned platform that can render it: text ideas go to Google Search, creative ideas to feeds. Local only.",
  inputSchema: z.object({
    adId: z.string().min(1),
    platforms: z.array(z.enum(channelPlatformEnum.enumValues)).nullable(),
  }),
  outputSchema: z.object({
    adId: z.string(),
    platforms: z.array(z.enum(channelPlatformEnum.enumValues)).nullable(),
  }),
  examples: [{ adId: "ad_01", platforms: ["meta_ads"] }],
  execute: (input, ctx) => setAdPlatforms({ ...input, orgId: ctx.orgId }),
});

export const addAdShellAction = growthAction({
  outputSchema: addAdShellActionOutputSchema,
  description:
    "Add one empty visual ad of a declared format (static, carousel or video). The catalog ad is not made here; it comes from the approved catalog. Supply linkUrl for an arbitrary HTTP or HTTPS destination. Optional propertyId or homeName supports home-aware studio authoring. Lands on the brand's wall, or straight in a campaign when campaignId is given. The creative comes afterwards with saveIdea. Use this when the operator wants the ads to exist first and fill them in, or wants an ad the build does not make.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    linkUrl: z
      .string()
      .url()
      .refine(
        (value) => ["http:", "https:"].includes(new URL(value).protocol),
        "Use an HTTP or HTTPS destination.",
      )
      .optional(),
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
      .describe("Omit for a generated ad name."),
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
    "Make one of a Performance client's home photos that home's hero: the photo its ads, previews and catalog card draw on. photoNumber is the 1-based number from catalogHomeFacts photos, the same one the catalog contact sheets print; photoUrl is one of the home's gallery photo URLs instead. Replaces the previous hero; run it again to change it. Refused while the home's catalog card is approved.",
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
        "Reserved for local export tooling. Approved card edits require reopening.",
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
  execute: async ({ photoNumber, photoUrl, ...input }, ctx) => {
    if ((photoNumber === undefined) === (photoUrl === undefined))
      throw new GrowthActionError(
        "invalid_input",
        "Give either photoNumber or photoUrl.",
      );
    return setCatalogHomeHero({
      ...input,
      homeId: await catalogListingId(input.brandId, input.homeId),
      userId: ctx.userId,
      photo: photoUrl ? { url: photoUrl } : { number: photoNumber! },
    });
  },
});

export const suggestCampaignAudiencesAction = growthAction({
  outputSchema: suggestCampaignAudiencesActionOutputSchema,
  description:
    "Suggest general campaign audiences from the brand story, personas and optional explicitly supplied research context. Nothing is saved or sent to providers.",
  inputSchema: z.object({
    campaignId: z.string().min(1),
    steer: steerSchema,
    context: z.string().trim().max(30000).optional(),
    count: z.number().int().min(1).max(5).optional(),
  }),
  examples: [{ campaignId: "camp_01" }],
  execute: (input, ctx) =>
    suggestCampaignAudiences({ ...input, organizationId: ctx.orgId }),
});

export const catalogHomeFactsAction = growthAction({
  outputSchema: catalogHomeFactsActionOutputSchema,
  description:
    "Read what homes' listings say, for writing their catalog cards: the complete amenity list, the description, the location paragraph (what the home is near), pets, bedrooms, baths, guests, the listing URL, every gallery photo numbered with its room (the numbers setHomeHero takes), current catalog card and related ads (captions and image recipes), brand story, market and production copy guidance. Use this instead of reading the public listing page, which shows only the first few amenities. Up to 16 homes per call; for a whole catalog, call it once per batch.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    homeIds: z
      .array(z.string().min(1))
      .min(1)
      .max(16)
      .describe("WanderOS listing ids."),
  }),
  examples: [{ brandId: "brd_01", homeIds: ["1234567890123"] }],
  execute: async ({ brandId, homeIds }, ctx) =>
    catalogHomeFacts(
      ctx.userId,
      brandId,
      await catalogListingIds(brandId, homeIds),
    ),
});

export const editCatalogCardAction = growthAction({
  outputSchema: editCatalogCardActionOutputSchema,
  description:
    "Change one home's card in a Performance client's catalog draft: the headline printed on the image (title, e.g. 'Exposed-brick loft in Louisville, KY'), the facts line (subtitle), the composition template, the crop focus, the logo, whether the home is in the export, the amenity pills on the amenities cards, the ad headline and description Meta prints under the card (adHeadline, adDescription), and the library image or supplied artwork it uses. Send only the fields to change. Saves the draft; nothing is exported or pushed. An approved card is locked: only whether it is in the export can change until the operator reopens it. Approval is the operator's, through setCatalogApproval.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    homeId: z.string().min(1).describe("The WanderOS listing id."),
    ...catalogCopyPatchSchema.shape,
    adHeadline: catalogCopyPatchSchema.shape.adHeadline.describe(
      "The ad headline Meta prints under the card: the home's name, cleaned up.",
    ),
    adDescription: catalogCopyPatchSchema.shape.adDescription.describe(
      "The line under the ad headline, e.g. 'Gatlinburg, TN · Sleeps 8 · Hot tub'.",
    ),
    templateId: compositionTemplateIdSchema.optional(),
    imagePosition: compositionImagePositionSchema.optional(),
    showLogo: z.boolean().optional(),
    included: z.boolean().optional(),
    pills: catalogCopyPatchSchema.shape.pills.describe(
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
        "Reserved for local export tooling. Approved card edits require reopening.",
      ),
  }),
  examples: [
    {
      brandId: "brd_01",
      homeId: "1234567890123",
      title: "Exposed-brick loft in Louisville, KY",
    },
  ],
  execute: async ({ brandId, homeId, force, ...patch }, ctx) =>
    editCatalogCard({
      userId: ctx.userId,
      brandId,
      homeId: await catalogListingId(brandId, homeId),
      patch,
      force,
    }),
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

export const attachAdSetAction = growthAction({
  outputSchema: attachAdSetActionOutputSchema,
  description:
    "Send selected approved Studio ads to a campaign (export), or add them from the campaign (import). Both render the approved recipes into fixed media and assign the existing ad IDs. Supply exactly one of campaignId or newCampaignName; a new campaign requires explicit adIds. Refuses cross-brand, unapproved and assigned selections. Nothing reaches a platform until adsWrite.push, or adsWrite.pushAd per ad when the campaign is already pushed.",
  inputSchema: z
    .object({
      brandId: z.string().min(1),
      campaignId: z.string().min(1).optional(),
      newCampaignName: z.string().trim().min(1).max(200).optional(),
      adIds: z.array(z.string().min(1)).max(100).optional(),
    })
    .refine(
      (input) => Boolean(input.campaignId) !== Boolean(input.newCampaignName),
      { message: "Choose an existing campaign or a new campaign name." },
    )
    .refine((input) => !input.newCampaignName || Boolean(input.adIds?.length), {
      message: "Select ads to create a campaign from.",
    }),
  examples: [
    { brandId: "brand_01", campaignId: "camp_01" },
    {
      brandId: "brand_01",
      newCampaignName: "Fall stays",
      adIds: ["ad_01", "ad_02"],
    },
  ],
  execute: (input, ctx) =>
    attachAdSet({ ...input, orgId: ctx.orgId, userId: ctx.userId }),
});

export const setAdStatusAction = growthAction({
  outputSchema: setAdStatusActionOutputSchema,
  description:
    "Move an ad along draft → ready → approved. ready is a human mark for review that survives edits; drawn takes a ready mark back. approved is the person's final sign-off: its recipe, copy and branding are captured immediately. Images render when attachAdSet sends it to a campaign. To revise an approved ad use returnToStudio; its platform ads remain unchanged. This never publishes to a platform.",
  inputSchema: z.object({
    adId: z.string().min(1),
    status: z.enum(["drawn", "ready", "approved"]),
    exportShapes: ideaExportShapesSchema.optional(),
  }),
  execute: (input, ctx) => {
    if (ctx.surface !== "app" && input.status !== "approved")
      throw new Error("Ready is set by a person on the page.");
    return setAdStatus({
      adId: input.adId,
      orgId: ctx.orgId,
      status: input.status,
      exportShapes: input.exportShapes,
      userId: ctx.userId,
    });
  },
});

export const returnAdToStudioAction = growthAction({
  outputSchema: z.object({
    adId: z.string(),
    status: z.literal("drawn"),
    platformAdsUnchanged: z.number(),
    mediaCleanup: z.object({
      deleted: z.number(),
      kept: z.number(),
      errors: z.array(z.string()),
      pending: z.boolean().optional(),
    }),
  }),
  description:
    "Return the same approved or campaign ad to Studio as an unassigned draft. Clears approval and Ready attribution, keeps its source artwork, composition and comments, purges unused generated exports, and records the optional comment with the return event. Existing platform ads and their creative remain unchanged and may still run; this does not pause delivery. Use as=user only for words the user explicitly asks you to post on their behalf; otherwise as=agent.",
  inputSchema: z.object({
    adId: z.string().min(1),
    comment: z.string().trim().max(8000).optional(),
    as: z.enum(["user", "agent"]).default("agent"),
  }),
  execute: returnAdToStudio,
});

export const setAdCopyAction = growthAction({
  outputSchema: setAdCopyActionOutputSchema,
  description:
    "Rewrite a drafted ad. For text-first ads supply the full text pool. For creative ads: its headline, primary text, description, call to action, and each carousel card's own Meta headline and description. `name` renames the ad itself (the card title in the studio and the ad name on Meta), which is not the headline. The images are left alone. Use the caption style from adsRead.ideaContext consistently across the brand. Emoji belong only in primary text, never in Meta headlines, descriptions or words drawn onto a card. After a material edit, leave an internal reviewWrite.addComment with as=agent describing the change and reason.",
  inputSchema: z.object({
    adId: z.string().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    callToAction: z
      .enum(AD_CALL_TO_ACTIONS.map((cta) => cta.value))
      .optional()
      .describe("Creative ads only: the Meta button."),
    text: textAdCopySchema.optional(),
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
      name: input.name,
      callToAction: input.callToAction,
      headline: input.headline,
      body: input.body,
      description: input.description,
      cards: input.cards,
      text: input.text,
    }),
});

// ---- Placement cells: one platform x placement of one ad ------------------
// The base creative is edited with saveIdea or setAdCopy; these touch one cell
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
  nativeOutputSchema: draftAdResultSchema,
  outputSchema: saveIdeaActionOutputSchema,
  description:
    "Save an editable image ad idea: shared ad copy, ordered source images, per-image composition recipes and shape overrides. Read adsRead.ideaContext immediately before saving for this ad's current updatedAt and complete document. After any prior save, read again; never reuse the old version. Preserves recipes and the existing Draft or Ready state; approved ads must be reopened before editing. Does not publish or materialize renders. After a material edit, leave an internal reviewWrite.addComment with as=agent describing the change and reason.",
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
    "Read one ad's current editable document, version, ordered source-image URLs (including size variants), brand story, voice, market, existing catalog/ad copy and complete listing facts for every represented home. Use before proposing copy sets and before saveIdea. Image URLs are references; inspect them visually before making composition decisions. Write every slide's copy by its copyRules, from the homes' facts, never from the images.",
  inputSchema: z.object({
    adId: z.string().min(1),
  }),
  execute: (input, ctx) =>
    adChatContext({ adId: input.adId, organizationId: ctx.orgId }),
});

export const setDeliveryGroupAction = growthAction({
  description:
    "Edit an unpublished platform delivery group. Meta uses ad sets, Google uses ad groups. Configuration must match its parent platform. Local only; no provider writes.",
  inputSchema: z.object({
    deliveryGroupId: z.string().min(1),
    name: z.string().trim().min(1).max(300).optional(),
    audienceId: z.string().min(1).nullable().optional(),
    budget: z.number().int().positive().nullish(),
    budgetType: z.enum(["daily", "lifetime"]).nullish(),
    configuration: deliveryGroupConfigurationSchema,
  }),
  outputSchema: z.strictObject({ id: z.string() }),
  execute: async (input, ctx) =>
    setDeliveryGroup({ ...input, organizationId: ctx.orgId }),
});

export const deleteDeliveryGroupAction = growthAction({
  description:
    "Remove an unpublished platform delivery group without deleting its shared audience. Keep at least one group. Local only; no provider writes.",
  inputSchema: z.object({ deliveryGroupId: z.string().min(1) }),
  outputSchema: z.strictObject({ deleted: z.boolean() }),
  execute: (input, ctx) =>
    deleteDeliveryGroup({ ...input, organizationId: ctx.orgId }),
});

export const previewMetaAdditionsAction = growthAction({
  outputSchema: previewMetaAdditionsOutputSchema,
  description:
    "Review additions to one ad set within an existing Meta campaign. Reads live ownership/status and lists missing approved ads, a possible new ad set, and launch blockers. Changes nothing on Meta. Use its reviewToken with publishAdditions.",
  inputSchema: z.object({ deliveryGroupId: z.string().min(1) }),
  execute: (input, ctx) =>
    previewMetaAdditions({ ...input, organizationId: ctx.orgId }),
});
export const publishMetaAdditionsAction = growthAction({
  outputSchema: publishMetaAdditionsOutputSchema,
  description:
    "Publish the reviewed missing ads and, if needed, one new ad set inside an existing Meta campaign, all PAUSED. Requires reviewToken from adsRead.previewAdditions. Preserves existing delivery and campaign budget. Refuses missing audience links and locations. Records partial progress for resume.",
  inputSchema: z.object({
    deliveryGroupId: z.string().min(1),
    reviewToken: z.string().length(64),
  }),
  execute: (input, ctx) =>
    publishMetaAdditions(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});
export const addDeliveryGroupAction = growthAction({
  outputSchema: z.strictObject({ id: z.string() }),
  description:
    "Plan a new ad set in a draft or existing Meta campaign. Local only. Set explicit targeting and link its audience before publishing additions; creates nothing on Meta.",
  inputSchema: z.object({
    platformCampaignId: z.string().min(1),
    name: z.string().trim().min(1).max(300),
    audienceId: z.string().min(1).nullish(),
    budget: z.number().int().positive().nullish(),
    budgetType: z.enum(["daily", "lifetime"]).nullish(),
    configuration: deliveryGroupConfigurationSchema,
  }),
  execute: (input, ctx) =>
    addDeliveryGroup({ ...input, organizationId: ctx.orgId }),
});

export const refreshMetaCampaignAction = growthAction({
  outputSchema: z.strictObject({
    updated: z.number(),
    adsWritten: z.number(),
    errors: z.array(z.string()),
  }),
  description:
    "Refresh Meta campaigns, ad sets, ads and performance in the selected campaign's allowlisted account. Provider read; writes only Growth mirror rows and preserves Studio creative and unpublished ad sets.",
  inputSchema: z.object({ platformCampaignId: z.string().min(1) }),
  execute: (input, ctx) =>
    refreshMetaCampaign({ ...input, organizationId: ctx.orgId }),
});
