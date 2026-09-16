import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  addAdShell,
  attachAdSet,
  clearPlacement,
  freezePlacement,
  setPlacementCard,
  setPlacementCopy,
  unfreezePlacement,
  buildAdSet,
  writeSetCopy,
  createAdsFromAssets,
  deleteAd,
  editAdCards,
  setAdCopy,
  setAdHome,
  setAdStatus,
} from "@/server/services/ad-set.service";
import { HAND_MADE_AD_FORMATS, MAX_SET_HOMES } from "@/lib/performance-ads";

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
  deletePlatformCampaign,
  listAdsWriteDestinations,
  previewDraftAd,
  pushDraftToPlatform,
  setCampaignDelivery,
  researchGoogleKeywords,
  syncBrandPlatformAudiences,
} from "@/server/services/ads-write.service";
import {
  addDraftAd,
  addAudience,
  deleteDraftAd,
  deleteAudience,
  deleteDraftCampaign,
  attachPlatformCampaign,
  importPlatformAdCreative,
  replaceDraftAdMedia,
  requireOwnedCampaign,
  planPlatform,
  setPlatformDraft,
  unplanPlatform,
  updateAudience,
  setCampaignCreativePool,
  createDraftCampaign,
  listBrandCampaigns,
} from "@/server/services/ads-draft.service";
import { draftAdsFromHomes } from "@/server/services/property-ads.service";
import { createId } from "@/server/db/utils";

import { protectedProcedure } from "../trpc";
import { memberTable } from "@/server/db/schema";
import type { Database } from "@/server/db";

// Powers the interactive ad-performance cards on /overview: the chat renders the
// first paint from the capability output, then control changes refetch through
// here — same compute functions, no LLM round-trip. Mirrors the adsScope/topAds
// capability input schemas (src/server/ai/capabilities/ads.ts).

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type AdsContext = {
  db: Database;
  session: {
    user: { id: string };
    session: { activeOrganizationId?: string | null };
  };
};

async function organizationIdFor(ctx: AdsContext) {
  const active = ctx.session.session.activeOrganizationId;
  const membership = await ctx.db.query.memberTable.findFirst({
    where: active
      ? and(
          eq(memberTable.userId, ctx.session.user.id),
          eq(memberTable.organizationId, active),
        )
      : eq(memberTable.userId, ctx.session.user.id),
    columns: { organizationId: true },
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
  return membership.organizationId;
}

export const adsRouter = {
  scope: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().trim().min(1),
        fromDate: dateStr.optional(),
        toDate: dateStr.optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      computeAdsScope({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  topAds: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().trim().min(1),
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
    .query(async ({ ctx, input }) =>
      computeTopAds({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  /**
   * The Launch/Pause button. A provider write that starts or stops spend, so
   * it stays a deliberate operator click — the mutation is the approval.
   */
  setCampaignDelivery: protectedProcedure
    .input(
      z.object({
        platformCampaignId: z.string().min(1),
        status: z.enum(["active", "paused"]),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setCampaignDelivery(input, {
        organizationId: await organizationIdFor(ctx),
        runId: createId("run"),
      }),
    ),

  /** A local draft: the editable object chat and the canvas work on. No
   *  provider call — launching is the separate, approved step. */
  createDraft: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        name: z.string().trim().min(1).max(300),
        platforms: z
          .array(z.enum(PLANNABLE_AD_PLATFORMS))
          .min(1)
          .max(PLANNABLE_AD_PLATFORMS.length)
          .default(["meta_ads"]),
        goal: z.string().trim().max(200).nullish(),
        landingUrl: z.string().url().nullish(),
        description: z.string().trim().max(2000).nullish(),
        budget: z.number().int().min(0).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      createDraftCampaign({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  // Experiment: build a static and a carousel from the client's own homes.
  // Drafts only; the push is still what decides whether any of it runs.
  /**
   * Draw the brand's whole set: from the homes named, or from a count when
   * none are, in which case the homes on their record come first. One model
   * call for the words.
   */
  buildAdSet: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        propertyIds: z.array(z.string().min(1)).max(MAX_SET_HOMES).optional(),
        count: z.number().int().min(1).max(MAX_SET_HOMES).optional(),
        copy: z.enum(["ai", "defer"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      buildAdSet({
        brandId: input.brandId,
        orgId: await organizationIdFor(ctx),
        propertyIds: input.propertyIds,
        count: input.count,
        copy: input.copy,
        userId: ctx.session.user.id,
      }),
    ),

  /** The copy pass: AI words onto the drafts already drawn. Headline/body only. */
  writeSetCopy: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      writeSetCopy({
        brandId: input.brandId,
        orgId: await organizationIdFor(ctx),
      }),
    ),

  /** An empty ad of a declared format, waiting for its creative. */
  addAdShell: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        format: z.enum(HAND_MADE_AD_FORMATS),
        propertyId: z.string().min(1).nullish(),
        homeName: z.string().trim().max(200).nullish(),
        campaignId: z.string().min(1).nullish(),
        name: z.string().trim().max(300).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      addAdShell({ ...input, orgId: await organizationIdFor(ctx) }),
    ),

  /** Finished creatives from the library, as one static each or one carousel. */
  createAdsFromAssets: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        mediaAssetIds: z.array(z.string().min(1)).min(1).max(50),
        as: z.enum(["statics", "carousel"]),
        propertyId: z.string().min(1).nullish(),
        homeName: z.string().trim().max(200).nullish(),
        campaignId: z.string().min(1).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      createAdsFromAssets({ ...input, orgId: await organizationIdFor(ctx) }),
    ),

  /** Bind an ad to one of their homes, or unbind it. */
  setAdHome: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        propertyId: z.string().min(1).nullish(),
        homeName: z.string().trim().max(200).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setAdHome({ ...input, orgId: await organizationIdFor(ctx) }),
    ),

  /** One change to an ad's cards; uploads arrive as library assets. */
  editAdCards: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        edit: z.discriminatedUnion("op", [
          z.object({
            op: z.literal("replace"),
            index: z.number().int().min(0).max(9),
            mediaAssetId: z.string().min(1),
          }),
          z.object({
            op: z.literal("append"),
            mediaAssetId: z.string().min(1),
          }),
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
    )
    .mutation(async ({ ctx, input }) =>
      editAdCards({
        ...input,
        orgId: await organizationIdFor(ctx),
        userId: ctx.session.user.id,
      }),
    ),

  /** Put the approved drafts, or the named ones, into a campaign. */
  attachAdSet: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        campaignId: z.string().min(1),
        adIds: z.array(z.string().min(1)).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      attachAdSet({ ...input, orgId: await organizationIdFor(ctx) }),
    ),

  /** Remove one ad, drafted or in a campaign. */
  deleteAd: protectedProcedure
    .input(z.object({ adId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      deleteAd({ ...input, orgId: await organizationIdFor(ctx) }),
    ),

  /** Production state on one drafted ad. Touches no platform. */
  setAdStatus: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        status: z.enum(["drawn", "approved"]),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setAdStatus({
        adId: input.adId,
        orgId: await organizationIdFor(ctx),
        status: input.status,
      }),
    ),

  /** The words on one drafted ad; its cards are left alone. */
  setAdCopy: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        headline: z.string().max(60).optional(),
        body: z.string().max(1200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setAdCopy({
        adId: input.adId,
        orgId: await organizationIdFor(ctx),
        headline: input.headline,
        body: input.body,
      }),
    ),

  draftAdsFromHomes: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        carouselSize: z.number().int().min(1).max(10).optional(),
        listingUrls: z.array(z.string().url()).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      draftAdsFromHomes({
        organizationId: await organizationIdFor(ctx),
        userId: ctx.session.user.id,
        campaignId: input.campaignId,
        carouselSize: input.carouselSize,
        listingUrls: input.listingUrls,
      }),
    ),

  /** The last homes run on a campaign, polled while one is in progress. */
  homesRun: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { campaign } = await requireOwnedCampaign(
        input.campaignId,
        await organizationIdFor(ctx),
      );
      return campaign.homesRun ?? null;
    }),

  /** Put a different library asset in one card slot of a drafted ad. */
  replaceAdMedia: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        index: z.number().int().min(0).max(9),
        mediaAssetId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      replaceDraftAdMedia({
        organizationId: await organizationIdFor(ctx),
        ...input,
      }),
    ),

  addAudience: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        name: z.string().trim().min(1).max(300),
        personaId: z.string().nullish(),
        ageMin: z.number().int().min(13).max(100).nullish(),
        ageMax: z.number().int().min(13).max(100).nullish(),
        countries: z.array(z.string().length(2)).max(20).nullish(),
        // Codes as the source states them; `regions` are the names a platform
        // can be asked for. Both travel, because a code round-trips and a
        // display name is a lookup that can fail.
        states: z.array(z.string().trim().length(2)).max(60).nullish(),
        regions: z.array(z.string().trim().min(1).max(100)).max(60).nullish(),
        cities: z.array(z.string().trim().min(1).max(120)).max(100).nullish(),
        keywords: z.array(z.string().trim().min(1).max(80)).max(50).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
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
                countries: input.countries ?? undefined,
                states: input.states?.map((code) => code.toUpperCase()),
                regions: input.regions ?? undefined,
                cities: input.cities ?? undefined,
              }
            : null,
        keywords: input.keywords ?? null,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  updateAudience: protectedProcedure
    .input(
      z.object({
        audienceId: z.string().min(1),
        name: z.string().trim().min(1).max(300).optional(),
        ageMin: z.number().int().min(13).max(100).nullish(),
        ageMax: z.number().int().min(13).max(100).nullish(),
        countries: z.array(z.string().length(2)).max(20).nullish(),
        states: z.array(z.string().trim().length(2)).max(60).nullish(),
        regions: z.array(z.string().trim().min(1).max(100)).max(60).nullish(),
        cities: z.array(z.string().trim().min(1).max(120)).max(100).nullish(),
        keywords: z.array(z.string().trim().min(1).max(80)).max(50).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
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
                countries: input.countries ?? undefined,
                states: input.states?.map((code) => code.toUpperCase()),
                regions: input.regions ?? undefined,
                cities: input.cities ?? undefined,
              }
            : undefined,
        keywords: input.keywords,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  importAdCreative: protectedProcedure
    .input(z.object({ platformAdId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      importPlatformAdCreative({
        platformAdId: input.platformAdId,
        organizationId: await organizationIdFor(ctx),
        userId: ctx.session.user.id,
      }),
    ),

  planPlatform: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        platform: z.enum(PLANNABLE_AD_PLATFORMS),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      planPlatform({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  unplanPlatform: protectedProcedure
    .input(z.object({ platformCampaignId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      unplanPlatform({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  /** Adopt a synced platform campaign under a first-party campaign. */
  attachPlatformCampaign: protectedProcedure
    .input(
      z
        .object({
          platformCampaignId: z.string().min(1),
          campaignId: z.string().nullish(),
          newCampaignName: z.string().trim().max(300).nullish(),
        })
        .refine(
          (value) =>
            Boolean(value.campaignId) || Boolean(value.newCampaignName?.trim()),
          { message: "Pick a campaign or name a new one" },
        ),
    )
    .mutation(async ({ ctx, input }) =>
      attachPlatformCampaign({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  setPlatformDraft: protectedProcedure
    .input(
      z.object({
        platformCampaignId: z.string().min(1),
        budget: z.number().int().positive().nullish(),
        budgetType: z.enum(["daily", "lifetime"]).nullish(),
        google: z
          .object({
            campaignType: z.enum(["search", "display"]).optional(),
            keywords: z.array(z.string().trim().min(1)).max(200).optional(),
            negativeKeywords: z
              .array(z.string().trim().min(1))
              .max(200)
              .optional(),
            additionalHeadlines: z
              .array(z.string().trim().min(1).max(30))
              .max(14)
              .optional(),
            additionalDescriptions: z
              .array(z.string().trim().min(1).max(90))
              .max(4)
              .optional(),
            businessName: z.string().trim().max(120).optional(),
          })
          .nullish(),
        meta: z
          .object({
            pixelId: z.string().trim().max(64).optional(),
            customEventType: z.string().trim().max(64).optional(),
            customConversionId: z.string().trim().max(64).optional(),
            budgetMode: z.enum(["cbo", "abo"]).optional(),
          })
          .nullish(),
        linkedin: z
          .object({
            organizationId: z.string().trim().max(64).optional(),
            costType: z.enum(LINKEDIN_COST_TYPES).optional(),
            unitCost: z.number().positive().optional(),
            callToAction: z.enum(LINKEDIN_CALL_TO_ACTIONS).optional(),
          })
          .nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setPlatformDraft({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  setCampaignCreativePool: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        media: z
          .array(
            z.object({
              url: z.string().url(),
              type: z.enum(["image", "video", "carousel"]),
              assetId: z.string().optional(),
              thumbnail: z.string().optional(),
              width: z.number().optional(),
              height: z.number().optional(),
            }),
          )
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setCampaignCreativePool({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  /**
   * Keyword Planner for the brand's Google account. Read-only: it creates
   * nothing and spends nothing, so it needs no approval gate.
   */
  researchKeywords: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().min(1),
        seedKeywords: z.array(z.string().trim().min(1)).max(20).optional(),
        seedUrl: z.string().url().optional(),
        estimateKeywords: z.array(z.string().trim().min(1)).max(200).optional(),
        countries: z.array(z.string().length(2)).max(25).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      researchGoogleKeywords({
        organizationId: await organizationIdFor(ctx),
        ...input,
      }),
    ),

  /**
   * Pull the custom audiences already sitting in the brand's allowlisted ad
   * accounts. Read-only against the provider; it only writes our mirror rows.
   */
  syncPlatformAudiences: protectedProcedure
    .input(z.object({ brandSlug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      syncBrandPlatformAudiences({
        organizationId: await organizationIdFor(ctx),
        brandSlug: input.brandSlug,
      }),
    ),

  campaigns: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      listBrandCampaigns({
        brandId: input.brandId,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  /** Drafted ad on a campaign; creative comes from the media library. */
  addDraftAd: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        name: z.string().trim().min(1).max(300),
        type: z.enum(["creative", "text"]).default("creative"),
        headline: z.string().trim().max(255).nullish(),
        body: z.string().trim().max(2_200).nullish(),
        linkUrl: z.string().url().nullish(),
        /** Meta call to action, e.g. BOOK_NOW; the push falls back to LEARN_MORE. */
        callToAction: z.string().trim().max(40).nullish(),
        /** The home the ad is about; the push names the ad `<prefix>_<FORMAT>_<property>`. */
        propertyName: z.string().trim().max(200).nullish(),
        headlines: z.array(z.string().trim().min(1).max(30)).max(15).nullish(),
        descriptions: z
          .array(z.string().trim().min(1).max(90))
          .max(4)
          .nullish(),
        media: z
          .array(
            z.object({
              url: z.string().url(),
              type: z.enum(["image", "video", "carousel"]),
              assetId: z.string().optional(),
              thumbnail: z.string().optional(),
              width: z.number().optional(),
              height: z.number().optional(),
            }),
          )
          .max(10)
          .nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const content =
        input.type === "text"
          ? {
              headlines: input.headlines ?? [],
              descriptions: input.descriptions ?? [],
              linkUrl: input.linkUrl ?? undefined,
            }
          : {
              headline: input.headline ?? input.name,
              body: input.body ?? "",
              linkUrl: input.linkUrl ?? undefined,
              callToAction: input.callToAction ?? undefined,
              propertyName: input.propertyName ?? undefined,
              media: input.media ?? [],
            };
      return addDraftAd({
        campaignId: input.campaignId,
        name: input.name,
        type: input.type,
        content,
        organizationId: await organizationIdFor(ctx),
      });
    }),

  /** Meta's own pre-create previews of a drafted ad. Provider read. */
  previewAd: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        connectionAccountId: z.string().min(1),
        adAccountId: z.string().min(1),
        pageId: z.string().trim().min(1).optional(),
        formats: z.array(z.string().trim().min(1)).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      previewDraftAd(input, {
        organizationId: await organizationIdFor(ctx),
        runId: createId("run"),
      }),
    ),

  /** The allowlisted destinations for the push dialog. */
  destinations: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().trim().min(1),
        platform: z.enum(ZERNIO_AD_PLATFORMS),
      }),
    )
    .query(async ({ ctx, input }) =>
      listAdsWriteDestinations({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  /**
   * Create the draft on Meta — PAUSED — via Zernio's multi-creative shape.
   * A provider write behind a deliberate operator click; spend starts only
   * when the delivery switch is flipped afterwards.
   */
  pushDraftToPlatform: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        // Required: a default here silently pushed the wrong platform.
        platform: z.enum(PUSHABLE_AD_PLATFORMS),
        connectionAccountId: z.string().min(1),
        adAccountId: z.string().min(1),
        goal: z.enum(AD_PUSH_GOALS),
        // Budget, dates and settings come from the platform draft row.
        validateOnly: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      pushDraftToPlatform(input, {
        organizationId: await organizationIdFor(ctx),
        runId: createId("run"),
      }),
    ),
  /**
   * Deletes. The provider one cascades on a real ad account, so it stays an
   * operator click — it is deliberately not exposed to chat.
   */
  deletePlatformCampaign: protectedProcedure
    .input(
      z.object({
        platformCampaignId: z.string().min(1),
        connectionAccountId: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      deletePlatformCampaign(
        {
          platformCampaignId: input.platformCampaignId,
          connectionAccountId: input.connectionAccountId ?? undefined,
        },
        {
          organizationId: await organizationIdFor(ctx),
          runId: createId("run"),
        },
      ),
    ),

  deleteDraftCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      deleteDraftCampaign({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  deleteAudience: protectedProcedure
    .input(z.object({ audienceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      deleteAudience({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  deleteDraftAd: protectedProcedure
    .input(z.object({ adId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      deleteDraftAd({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),
  // ---- Placement cells: one platform × placement of one ad ----------------

  setPlacementCopy: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        placementKey: z.string().min(1),
        patch: z.object({
          headline: z.string().max(400).nullish(),
          body: z.string().max(2000).nullish(),
          callToAction: z.string().max(60).nullish(),
          linkUrl: z.string().url().nullish(),
        }),
        via: z.enum(["manual", "ai", "director"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setPlacementCopy({
        adId: input.adId,
        placementKey: input.placementKey,
        patch: input.patch,
        via: input.via,
        orgId: await organizationIdFor(ctx),
      }),
    ),

  setPlacementCard: protectedProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        placementKey: z.string().min(1),
        index: z.number().int().min(0).max(9),
        source: z.union([
          z.object({ mediaAssetId: z.string().min(1) }),
          z.object({ derive: z.enum(["auto", "crop", "extend"]) }),
        ]),
        via: z.enum(["manual", "ai", "director"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setPlacementCard({
        adId: input.adId,
        placementKey: input.placementKey,
        index: input.index,
        source: input.source,
        via: input.via,
        userId: ctx.session.user.id,
        orgId: await organizationIdFor(ctx),
      }),
    ),

  clearPlacement: protectedProcedure
    .input(
      z.object({ adId: z.string().min(1), placementKey: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }) =>
      clearPlacement({
        adId: input.adId,
        placementKey: input.placementKey,
        orgId: await organizationIdFor(ctx),
      }),
    ),

  freezePlacement: protectedProcedure
    .input(
      z.object({ adId: z.string().min(1), placementKey: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }) =>
      freezePlacement({
        adId: input.adId,
        placementKey: input.placementKey,
        userId: ctx.session.user.id,
        orgId: await organizationIdFor(ctx),
      }),
    ),

  unfreezePlacement: protectedProcedure
    .input(
      z.object({ adId: z.string().min(1), placementKey: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }) =>
      unfreezePlacement({
        adId: input.adId,
        placementKey: input.placementKey,
        orgId: await organizationIdFor(ctx),
      }),
    ),
} satisfies TRPCRouterRecord;
