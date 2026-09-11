import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  launchBriefSchema,
  launchDeliverableStatuses,
  launchMaturities,
  launchStatuses,
  launchSurfaces,
  launchRefSchema,
} from "@/lib/launch";
import {
  createLaunch,
  listLaunches,
  readLaunch,
  setDeliverable,
} from "@/server/services/launch.service";
import { launchTable, memberTable, productTable } from "@/server/db/schema";
import type { Database } from "@/server/db";

import { createTRPCRouter, protectedProcedure } from "../trpc";

type Ctx = { db: Database; session: { user: { id: string } } };

async function getOrgId(ctx: Ctx) {
  const membership = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  if (!membership?.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization" });
  }
  return membership.organizationId;
}

const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const launchRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) =>
    listLaunches(await getOrgId(ctx)),
  ),

  products: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx);
    return ctx.db.query.productTable.findMany({
      where: eq(productTable.organizationId, orgId),
      columns: { id: true, name: true, slug: true },
    });
  }),

  get: protectedProcedure
    .input(z.object({ launchId: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await readLaunch(await getOrgId(ctx), input.launchId);
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Launch not found" });
      }
      return result;
    }),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        name: z.string().trim().min(1).max(200),
        tier: tierSchema,
        targetDate: z.string().date().optional(),
        sourceUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx);
      const product = await ctx.db.query.productTable.findFirst({
        where: and(
          eq(productTable.id, input.productId),
          eq(productTable.organizationId, orgId),
        ),
        columns: { id: true },
      });
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }
      return createLaunch({
        orgId,
        userId: ctx.session.user.id,
        productId: input.productId,
        name: input.name,
        tier: input.tier,
        targetDate: input.targetDate,
        sourceUrl: input.sourceUrl,
      });
    }),

  setBrief: protectedProcedure
    .input(
      z.object({
        launchId: z.string(),
        brief: launchBriefSchema.partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx);
      const existing = await ctx.db.query.launchTable.findFirst({
        where: and(
          eq(launchTable.id, input.launchId),
          eq(launchTable.organizationId, orgId),
        ),
        columns: { brief: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Launch not found" });
      }
      const brief = launchBriefSchema.parse({
        ...existing.brief,
        ...input.brief,
      });
      const [row] = await ctx.db
        .update(launchTable)
        .set({ brief })
        .where(eq(launchTable.id, input.launchId))
        .returning();
      return row!;
    }),

  setFields: protectedProcedure
    .input(
      z.object({
        launchId: z.string(),
        name: z.string().trim().min(1).max(200).optional(),
        tier: tierSchema.optional(),
        targetDate: z.string().date().nullable().optional(),
        maturity: z.enum(launchMaturities).optional(),
        status: z.enum(launchStatuses).optional(),
        marketingOwnerId: z.string().nullable().optional(),
        releaseTheme: z.string().trim().max(240).nullable().optional(),
        sourceUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx);
      const { launchId, ...fields } = input;
      const patch: Partial<typeof launchTable.$inferInsert> =
        Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined),
        );
      if (Object.keys(patch).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to set" });
      }
      // Shipping stamps its own timestamp so the atlas can be dated later.
      if (patch.status === "shipped") patch.shippedAt = new Date();
      const [row] = await ctx.db
        .update(launchTable)
        .set(patch)
        .where(
          and(
            eq(launchTable.id, launchId),
            eq(launchTable.organizationId, orgId),
          ),
        )
        .returning();
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Launch not found" });
      }
      return row;
    }),

  setFeatures: protectedProcedure
    .input(
      z.object({
        launchId: z.string(),
        storyIds: z.array(z.string().trim().min(1)).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx);
      const existing = await ctx.db.query.launchTable.findFirst({
        where: and(
          eq(launchTable.id, input.launchId),
          eq(launchTable.organizationId, orgId),
        ),
        columns: { brief: true },
        with: { product: { columns: { atlas: true } } },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Launch not found" });
      }
      // A launch may only ship features its own product actually has.
      const known = new Set(existing.product.atlas.stories.map((s) => s.id));
      const unknown = input.storyIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Not features of this product: ${unknown.join(", ")}`,
        });
      }
      const brief = launchBriefSchema.parse({
        ...existing.brief,
        atlas: {
          ...(existing.brief.atlas ?? { storyIds: [], viewIds: [] }),
          storyIds: input.storyIds,
        },
      });
      const [row] = await ctx.db
        .update(launchTable)
        .set({ brief })
        .where(eq(launchTable.id, input.launchId))
        .returning();
      return row!;
    }),

  setDeliverable: protectedProcedure
    .input(
      z.object({
        launchId: z.string(),
        surface: z.enum(launchSurfaces),
        ownerName: z.string().trim().max(160).nullable().optional(),
        ownerId: z.string().nullable().optional(),
        readyBy: z.string().date().nullable().optional(),
        status: z.enum(launchDeliverableStatuses).optional(),
        ref: launchRefSchema.nullable().optional(),
        note: z.string().trim().max(1_000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx);
      const { launchId, surface, ...rest } = input;
      const patch = Object.fromEntries(
        Object.entries(rest)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, v === null ? undefined : v]),
      );
      return setDeliverable(orgId, launchId, surface, patch);
    }),
});
