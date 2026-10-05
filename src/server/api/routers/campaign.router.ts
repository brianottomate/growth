import type { Database } from "@/server/db";
import { z } from "zod";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "@/server/api/orpc";
import { computeCampaignAlignment } from "@/server/services/ads-alignment.service";
import {
  brandTable,
  platformCampaignTable,
  channelPlatformEnum,
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
    throw new ORPCError("FORBIDDEN", { message: "No organization" });
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
    throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No access to brand" });
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
  if (!campaign) throw new ORPCError("NOT_FOUND");
  await assertBrandAccess(ctx, campaign.brandId);
  return campaign;
}

const statusSchema = z.enum(campaignStatusEnum.enumValues);
const platformSchema = z.enum(channelPlatformEnum.enumValues);

const campaignFields = {
  name: z.string().trim().min(1).max(300),
  description: z.string().max(2000).nullish(),
  goal: z.string().max(100).nullish(),
  status: statusSchema.optional(),
  landingUrl: z.string().max(2000).nullish(),
  color: z.string().max(20).nullish(),
  budget: z.number().int().min(0).nullish(),
  startAt: z.date().nullish(),
  endAt: z.date().nullish(),
};

/** Paid campaign management. Cross-channel pushes are grouped by Initiative. */
export const campaignRouter = {
  /** All campaigns for the org's brands, with linked-work rollups. */
  overview: protectedProcedure.handler(async ({ context: ctx }) => {
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

    const adCounts = await ctx.db
      .select({ campaignId: platformCampaignTable.campaignId, n: count() })
      .from(platformCampaignTable)
      .where(inArray(platformCampaignTable.campaignId, ids))
      .groupBy(platformCampaignTable.campaignId);

    return {
      campaigns: campaigns.map((i) => {
        return {
          ...i,
          adCampaignCount: adCounts.find((c) => c.campaignId === i.id)?.n ?? 0,
        };
      }),
    };
  }),

  /** One campaign with everything linked to it. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const campaign = await assertCampaignAccess(ctx, input.id);

      const [brand, adCampaigns] = await Promise.all([
        ctx.db.query.brandTable.findFirst({
          where: eq(brandTable.id, campaign.brandId),
          columns: { id: true, name: true, slug: true },
        }),
        ctx.db.query.platformCampaignTable.findMany({
          where: eq(platformCampaignTable.campaignId, campaign.id),
          columns: { id: true, name: true, status: true },
          with: { channel: { columns: { platform: true } } },
        }),
      ]);

      return { ...campaign, brand, adCampaigns };
    }),

  create: protectedProcedure
    .input(z.object({ brandId: z.string(), ...campaignFields }))
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
      await assertCampaignAccess(ctx, input.id);
      const { id, ...rest } = input;
      const [campaign] = await ctx.db
        .update(campaignTable)
        .set(rest)
        .where(eq(campaignTable.id, id))
        .returning();
      return campaign;
    }),

  // ---- intent vs. actual (strategy layer ↔ Zernio-synced reality) --------

  /** Full alignment diff for one campaign (detail page). */
  alignment: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      await assertCampaignAccess(ctx, input.campaignId);
      return computeCampaignAlignment(input.campaignId);
    }),

  /** Attach synced ad campaigns to the campaign they implement. */
  linkCampaigns: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        campaignIds: z.array(z.string()).min(1).max(100),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
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
};
