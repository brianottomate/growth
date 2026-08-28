import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  AD_DESTINATIONS,
  computeAdsScope,
  computeTopAds,
} from "@/server/services/ads-analytics.service";

import { setCampaignDelivery } from "@/server/services/ads-write.service";
import {
  createDraftCampaign,
  linkCampaignToInitiative,
  listBrandInitiatives,
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
        campaignId: z.string().min(1),
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
  createDraftCampaign: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        name: z.string().trim().min(1).max(300),
        platform: z.enum(["meta_ads", "google_ads"]),
        objective: z.string().trim().max(200).nullish(),
        budget: z.number().int().min(0).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      createDraftCampaign({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  linkToInitiative: protectedProcedure
    .input(
      z
        .object({
          campaignId: z.string().min(1),
          initiativeId: z.string().nullish(),
          newInitiativeName: z.string().trim().max(200).nullish(),
        })
        .refine(
          (value) =>
            Boolean(value.initiativeId) ||
            Boolean(value.newInitiativeName?.trim()),
          { message: "Pick an initiative or name a new one" },
        ),
    )
    .mutation(async ({ ctx, input }) =>
      linkCampaignToInitiative({
        ...input,
        organizationId: await organizationIdFor(ctx),
      }),
    ),

  initiatives: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      listBrandInitiatives({
        brandId: input.brandId,
        organizationId: await organizationIdFor(ctx),
      }),
    ),
} satisfies TRPCRouterRecord;
