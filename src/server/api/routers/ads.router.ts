import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  AD_DESTINATIONS,
  computeAdsScope,
  computeTopAds,
} from "@/server/services/ads-analytics.service";

import {
  deletePlatformCampaign,
  listAdsWriteDestinations,
  pushDraftToPlatform,
  setCampaignDelivery,
} from "@/server/services/ads-write.service";
import {
  addDraftAd,
  addDraftAdSet,
  deleteDraftAd,
  deleteDraftAdSet,
  deleteDraftCampaign,
  attachPlatformCampaign,
  listBrandAudienceTargets,
  setCampaignPlatformConfig,
  setCampaignCreativePool,
  createDraftInitiative,
  listBrandCampaigns,
} from "@/server/services/ads-draft.service";
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
        targetChannels: z
          .array(z.enum(["meta_ads", "google_ads"]))
          .min(1)
          .max(2)
          .default(["meta_ads"]),
        goal: z.string().trim().max(200).nullish(),
        landingUrl: z.string().url().nullish(),
        description: z.string().trim().max(2000).nullish(),
        budget: z.number().int().min(0).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      createDraftInitiative({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  addDraftAdSet: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        name: z.string().trim().min(1).max(300),
        audienceTargetId: z.string().nullish(),
        budget: z.number().int().min(0).nullish(),
        budgetType: z.enum(["daily", "lifetime"]).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      addDraftAdSet({
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

  setCampaignPlatformConfig: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
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
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setCampaignPlatformConfig({
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

  audienceTargets: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      listBrandAudienceTargets({
        brandId: input.brandId,
        organizationId: await organizationIdFor(ctx),
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

  /** Drafted ad on a draft campaign; creative comes from the media library. */
  addDraftAd: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        adSetId: z.string().nullish(),
        name: z.string().trim().min(1).max(300),
        headline: z.string().trim().max(255).nullish(),
        body: z.string().trim().max(2_200).nullish(),
        linkUrl: z.string().url().nullish(),
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
          .max(1)
          .nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      addDraftAd({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  /** The allowlisted destinations for the push dialog. */
  destinations: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().trim().min(1),
        platform: z.enum(["meta", "google"]),
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
        platform: z.enum(["meta_ads", "google_ads"]).default("meta_ads"),
        connectionAccountId: z.string().min(1),
        adAccountId: z.string().min(1),
        goal: z.enum([
          "engagement",
          "traffic",
          "awareness",
          "video_views",
          "conversions",
        ]),
        budgetAmount: z.number().positive(),
        budgetType: z.enum(["daily", "lifetime"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
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

  deleteDraftAdSet: protectedProcedure
    .input(z.object({ adSetId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      deleteDraftAdSet({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  deleteDraftAd: protectedProcedure
    .input(z.object({ adSpotId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      deleteDraftAd({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),
} satisfies TRPCRouterRecord;
