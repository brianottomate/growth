import type { Database } from "@/server/db";
import { z } from "zod";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  computeAlignmentOverview,
  computeCampaignAlignment,
} from "@/server/services/ads-alignment.service";
import {
  brandTable,
  platformCampaignTable,
  channelPlatformEnum,
  contentPostTable,
  campaignStatusEnum,
  campaignTable,
  memberTable,
} from "@/server/db/schema";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

async function getOrgId(ctx: Ctx) {
  const membership = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  if (!membership?.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization" });
  }
  return membership.organizationId;
}

async function orgBrandIds(ctx: Ctx, orgId: string) {
  const brands = await ctx.db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  return brands.map((b) => b.id);
}

async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand?.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to brand" });
  }
}

/** Load a campaign and assert access through its brand. */
async function assertCampaignAccess(ctx: Ctx, campaignId: string) {
  const campaign = await ctx.db.query.campaignTable.findFirst({
    where: and(
      eq(campaignTable.id, campaignId),
      isNull(campaignTable.deletedAt),
    ),
  });
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
  await assertBrandAccess(ctx, campaign.brandId);
  return campaign;
}

const statusSchema = z.enum(campaignStatusEnum.enumValues);
const platformSchema = z.enum(channelPlatformEnum.enumValues);

const campaignFields = {
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  goal: z.string().max(100).nullish(),
  status: statusSchema.optional(),
  landingUrl: z.string().max(2000).nullish(),
  color: z.string().max(20).nullish(),
  budget: z.number().int().min(0).nullish(),
  startAt: z.date().nullish(),
  endAt: z.date().nullish(),
};

/**
 * Campaigns — the campaign/moment management surface (/app/campaigns).
 * An campaign is the umbrella for a push: a seasonal moment, a major
 * event, or a long-running campaign. Content posts and ad campaigns hang
 * off it via their `campaignId`. The moment planner (/app/plan) creates
 * these too; this router is the generic CRUD + linking lane.
 */
export const campaignRouter = createTRPCRouter({
  /** All campaigns for the org's brands, with linked-work rollups. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx);
    const brandIds = await orgBrandIds(ctx, orgId);
    if (brandIds.length === 0) return { campaigns: [] };

    const campaigns = await ctx.db.query.campaignTable.findMany({
      where: and(
        inArray(campaignTable.brandId, brandIds),
        isNull(campaignTable.deletedAt),
      ),
      with: { brand: { columns: { id: true, name: true, slug: true } } },
      orderBy: [desc(campaignTable.startAt)],
    });
    const ids = campaigns.map((i) => i.id);
    if (ids.length === 0) return { campaigns: [] };

    const [contentCounts, adCounts] = await Promise.all([
      ctx.db
        .select({
          campaignId: contentPostTable.campaignId,
          status: contentPostTable.status,
          n: count(),
        })
        .from(contentPostTable)
        .where(
          and(
            inArray(contentPostTable.campaignId, ids),
            isNull(contentPostTable.deletedAt),
          ),
        )
        .groupBy(contentPostTable.campaignId, contentPostTable.status),
      ctx.db
        .select({ campaignId: platformCampaignTable.campaignId, n: count() })
        .from(platformCampaignTable)
        .where(inArray(platformCampaignTable.campaignId, ids))
        .groupBy(platformCampaignTable.campaignId),
    ]);

    return {
      campaigns: campaigns.map((i) => {
        const mine = contentCounts.filter((c) => c.campaignId === i.id);
        return {
          ...i,
          contentCount: mine.reduce((s, c) => s + c.n, 0),
          publishedCount: mine
            .filter((c) => c.status === "published")
            .reduce((s, c) => s + c.n, 0),
          adCampaignCount: adCounts.find((c) => c.campaignId === i.id)?.n ?? 0,
        };
      }),
    };
  }),

  /** One campaign with everything linked to it. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await assertCampaignAccess(ctx, input.id);

      const [brand, contentPosts, adCampaigns] = await Promise.all([
        ctx.db.query.brandTable.findFirst({
          where: eq(brandTable.id, campaign.brandId),
          columns: { id: true, name: true, slug: true },
        }),
        ctx.db.query.contentPostTable.findMany({
          where: and(
            eq(contentPostTable.campaignId, campaign.id),
            isNull(contentPostTable.deletedAt),
          ),
          columns: {
            id: true,
            title: true,
            status: true,
            pillar: true,
            plannedAt: true,
          },
          with: { series: { columns: { id: true, name: true, color: true } } },
          orderBy: [contentPostTable.plannedAt],
        }),
        ctx.db.query.platformCampaignTable.findMany({
          where: eq(platformCampaignTable.campaignId, campaign.id),
          columns: { id: true, name: true, status: true },
          with: { channel: { columns: { platform: true } } },
        }),
      ]);

      return { ...campaign, brand, contentPosts, adCampaigns };
    }),

  create: protectedProcedure
    .input(z.object({ brandId: z.string(), ...campaignFields }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const { brandId, ...rest } = input;
      const [campaign] = await ctx.db
        .insert(campaignTable)
        .values({ brandId, ...rest })
        .returning();
      return campaign;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), ...campaignFields }))
    .mutation(async ({ ctx, input }) => {
      await assertCampaignAccess(ctx, input.id);
      const { id, ...rest } = input;
      const [campaign] = await ctx.db
        .update(campaignTable)
        .set(rest)
        .where(eq(campaignTable.id, id))
        .returning();
      return campaign;
    }),

  /** Soft-delete. Linked content keeps its rows; campaignId is cleared. */
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCampaignAccess(ctx, input.id);
      await ctx.db
        .update(contentPostTable)
        .set({ campaignId: null })
        .where(eq(contentPostTable.campaignId, input.id));
      await ctx.db
        .update(campaignTable)
        .set({ deletedAt: new Date(), status: "archived" })
        .where(eq(campaignTable.id, input.id));
      return { ok: true };
    }),

  /** Brand content not yet attached to any campaign — the link picker. */
  linkableContent: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await assertCampaignAccess(ctx, input.campaignId);
      return ctx.db.query.contentPostTable.findMany({
        where: and(
          eq(contentPostTable.brandId, campaign.brandId),
          isNull(contentPostTable.campaignId),
          isNull(contentPostTable.deletedAt),
        ),
        columns: {
          id: true,
          title: true,
          status: true,
          pillar: true,
          plannedAt: true,
        },
        orderBy: [desc(contentPostTable.plannedAt)],
        limit: 200,
      });
    }),

  linkContent: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        contentPostIds: z.array(z.string()).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await assertCampaignAccess(ctx, input.campaignId);
      // Same-brand only — a campaign never owns another brand's content.
      await ctx.db
        .update(contentPostTable)
        .set({ campaignId: campaign.id })
        .where(
          and(
            inArray(contentPostTable.id, input.contentPostIds),
            eq(contentPostTable.brandId, campaign.brandId),
          ),
        );
      return { ok: true };
    }),

  unlinkContent: protectedProcedure
    .input(z.object({ campaignId: z.string(), contentPostId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCampaignAccess(ctx, input.campaignId);
      await ctx.db
        .update(contentPostTable)
        .set({ campaignId: null })
        .where(
          and(
            eq(contentPostTable.id, input.contentPostId),
            eq(contentPostTable.campaignId, input.campaignId),
          ),
        );
      return { ok: true };
    }),

  // ---- intent vs. actual (strategy layer ↔ Zernio-synced reality) --------

  /** Full alignment diff for one campaign (detail page). */
  alignment: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCampaignAccess(ctx, input.campaignId);
      return computeCampaignAlignment(input.campaignId);
    }),

  /** Per-campaign drift rollup across the org's brands (index page). */
  alignmentOverview: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx);
    const brandIds = await orgBrandIds(ctx, orgId);
    return computeAlignmentOverview(brandIds);
  }),

  /** Attach synced ad campaigns to the campaign they implement. */
  linkCampaigns: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        campaignIds: z.array(z.string()).min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await assertCampaignAccess(ctx, input.campaignId);
      // Same-brand only — a campaign never claims another brand's platform campaign.
      await ctx.db
        .update(platformCampaignTable)
        .set({ campaignId: campaign.id })
        .where(
          and(
            inArray(platformCampaignTable.id, input.campaignIds),
            eq(platformCampaignTable.brandId, campaign.brandId),
          ),
        );
      return { ok: true };
    }),

  unlinkCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string(), platformCampaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCampaignAccess(ctx, input.campaignId);
      await ctx.db
        .update(platformCampaignTable)
        .set({ campaignId: null })
        .where(
          and(
            eq(platformCampaignTable.id, input.platformCampaignId),
            eq(platformCampaignTable.campaignId, input.campaignId),
          ),
        );
      return { ok: true };
    }),
});
