import { z } from "zod";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  computeAlignmentOverview,
  computeInitiativeAlignment,
} from "@/server/services/ads-alignment.service";
import {
  brandTable,
  campaignTable,
  channelPlatformEnum,
  contentPostTable,
  initiativeStatusEnum,
  initiativeTable,
  memberTable,
} from "@/server/db/schema";

type Ctx = {
  db: typeof import("@/server/db").db;
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

/** Load an initiative and assert access through its brand. */
async function assertInitiativeAccess(ctx: Ctx, initiativeId: string) {
  const initiative = await ctx.db.query.initiativeTable.findFirst({
    where: and(
      eq(initiativeTable.id, initiativeId),
      isNull(initiativeTable.deletedAt),
    ),
  });
  if (!initiative) throw new TRPCError({ code: "NOT_FOUND" });
  await assertBrandAccess(ctx, initiative.brandId);
  return initiative;
}

const statusSchema = z.enum(initiativeStatusEnum.enumValues);
const platformSchema = z.enum(channelPlatformEnum.enumValues);

const initiativeFields = {
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  goal: z.string().max(100).nullish(),
  status: statusSchema.optional(),
  landingUrl: z.string().max(2000).nullish(),
  color: z.string().max(20).nullish(),
  targetChannels: z.array(platformSchema).optional(),
  budget: z.number().int().min(0).nullish(),
  startAt: z.date().nullish(),
  endAt: z.date().nullish(),
};

/**
 * Initiatives — the campaign/moment management surface (/app/campaigns).
 * An initiative is the umbrella for a push: a seasonal moment, a major
 * event, or a long-running campaign. Content posts and ad campaigns hang
 * off it via their `initiativeId`. The moment planner (/app/plan) creates
 * these too; this router is the generic CRUD + linking lane.
 */
export const initiativeRouter = createTRPCRouter({
  /** All initiatives for the org's brands, with linked-work rollups. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx);
    const brandIds = await orgBrandIds(ctx, orgId);
    if (brandIds.length === 0) return { initiatives: [] };

    const initiatives = await ctx.db.query.initiativeTable.findMany({
      where: and(
        inArray(initiativeTable.brandId, brandIds),
        isNull(initiativeTable.deletedAt),
      ),
      with: { brand: { columns: { id: true, name: true, slug: true } } },
      orderBy: [desc(initiativeTable.startAt)],
    });
    const ids = initiatives.map((i) => i.id);
    if (ids.length === 0) return { initiatives: [] };

    const [contentCounts, adCounts] = await Promise.all([
      ctx.db
        .select({
          initiativeId: contentPostTable.initiativeId,
          status: contentPostTable.status,
          n: count(),
        })
        .from(contentPostTable)
        .where(
          and(
            inArray(contentPostTable.initiativeId, ids),
            isNull(contentPostTable.deletedAt),
          ),
        )
        .groupBy(contentPostTable.initiativeId, contentPostTable.status),
      ctx.db
        .select({ initiativeId: campaignTable.initiativeId, n: count() })
        .from(campaignTable)
        .where(inArray(campaignTable.initiativeId, ids))
        .groupBy(campaignTable.initiativeId),
    ]);

    return {
      initiatives: initiatives.map((i) => {
        const mine = contentCounts.filter((c) => c.initiativeId === i.id);
        return {
          ...i,
          contentCount: mine.reduce((s, c) => s + c.n, 0),
          publishedCount: mine
            .filter((c) => c.status === "published")
            .reduce((s, c) => s + c.n, 0),
          adCampaignCount:
            adCounts.find((c) => c.initiativeId === i.id)?.n ?? 0,
        };
      }),
    };
  }),

  /** One initiative with everything linked to it. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const initiative = await assertInitiativeAccess(ctx, input.id);

      const [brand, contentPosts, adCampaigns] = await Promise.all([
        ctx.db.query.brandTable.findFirst({
          where: eq(brandTable.id, initiative.brandId),
          columns: { id: true, name: true, slug: true },
        }),
        ctx.db.query.contentPostTable.findMany({
          where: and(
            eq(contentPostTable.initiativeId, initiative.id),
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
        ctx.db.query.campaignTable.findMany({
          where: eq(campaignTable.initiativeId, initiative.id),
          columns: { id: true, name: true, status: true },
          with: { channel: { columns: { platform: true } } },
        }),
      ]);

      return { ...initiative, brand, contentPosts, adCampaigns };
    }),

  create: protectedProcedure
    .input(z.object({ brandId: z.string(), ...initiativeFields }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const { brandId, ...rest } = input;
      const [initiative] = await ctx.db
        .insert(initiativeTable)
        .values({ brandId, ...rest })
        .returning();
      return initiative;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), ...initiativeFields }))
    .mutation(async ({ ctx, input }) => {
      await assertInitiativeAccess(ctx, input.id);
      const { id, ...rest } = input;
      const [initiative] = await ctx.db
        .update(initiativeTable)
        .set(rest)
        .where(eq(initiativeTable.id, id))
        .returning();
      return initiative;
    }),

  /** Soft-delete. Linked content keeps its rows; initiativeId is cleared. */
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertInitiativeAccess(ctx, input.id);
      await ctx.db
        .update(contentPostTable)
        .set({ initiativeId: null })
        .where(eq(contentPostTable.initiativeId, input.id));
      await ctx.db
        .update(initiativeTable)
        .set({ deletedAt: new Date(), status: "archived" })
        .where(eq(initiativeTable.id, input.id));
      return { ok: true };
    }),

  /** Brand content not yet attached to any initiative — the link picker. */
  linkableContent: protectedProcedure
    .input(z.object({ initiativeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const initiative = await assertInitiativeAccess(ctx, input.initiativeId);
      return ctx.db.query.contentPostTable.findMany({
        where: and(
          eq(contentPostTable.brandId, initiative.brandId),
          isNull(contentPostTable.initiativeId),
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
        initiativeId: z.string(),
        contentPostIds: z.array(z.string()).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const initiative = await assertInitiativeAccess(ctx, input.initiativeId);
      // Same-brand only — a campaign never owns another brand's content.
      await ctx.db
        .update(contentPostTable)
        .set({ initiativeId: initiative.id })
        .where(
          and(
            inArray(contentPostTable.id, input.contentPostIds),
            eq(contentPostTable.brandId, initiative.brandId),
          ),
        );
      return { ok: true };
    }),

  unlinkContent: protectedProcedure
    .input(z.object({ initiativeId: z.string(), contentPostId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertInitiativeAccess(ctx, input.initiativeId);
      await ctx.db
        .update(contentPostTable)
        .set({ initiativeId: null })
        .where(
          and(
            eq(contentPostTable.id, input.contentPostId),
            eq(contentPostTable.initiativeId, input.initiativeId),
          ),
        );
      return { ok: true };
    }),

  // ---- intent vs. actual (strategy layer ↔ Zernio-synced reality) --------

  /** Full alignment diff for one initiative (detail page). */
  alignment: protectedProcedure
    .input(z.object({ initiativeId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertInitiativeAccess(ctx, input.initiativeId);
      return computeInitiativeAlignment(input.initiativeId);
    }),

  /** Per-initiative drift rollup across the org's brands (index page). */
  alignmentOverview: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx);
    const brandIds = await orgBrandIds(ctx, orgId);
    return computeAlignmentOverview(brandIds);
  }),

  /** Attach synced ad campaigns to the initiative they implement. */
  linkCampaigns: protectedProcedure
    .input(
      z.object({
        initiativeId: z.string(),
        campaignIds: z.array(z.string()).min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const initiative = await assertInitiativeAccess(ctx, input.initiativeId);
      // Same-brand only — an initiative never claims another brand's campaign.
      await ctx.db
        .update(campaignTable)
        .set({ initiativeId: initiative.id })
        .where(
          and(
            inArray(campaignTable.id, input.campaignIds),
            eq(campaignTable.brandId, initiative.brandId),
          ),
        );
      return { ok: true };
    }),

  unlinkCampaign: protectedProcedure
    .input(z.object({ initiativeId: z.string(), campaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertInitiativeAccess(ctx, input.initiativeId);
      await ctx.db
        .update(campaignTable)
        .set({ initiativeId: null })
        .where(
          and(
            eq(campaignTable.id, input.campaignId),
            eq(campaignTable.initiativeId, input.initiativeId),
          ),
        );
      return { ok: true };
    }),
});
