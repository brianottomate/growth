import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  cadenceTargetTable,
  channelTable,
  memberTable,
  mixTargetTable,
} from "@/server/db/schema";

type Ctx = { db: typeof import("@/server/db").db; session: { user: { id: string } } };

/** Ensure the user can manage strategy for this owned brand. Returns the brand. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }
  if (!brand.organizationId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot set strategy on a tracked/reference brand",
    });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to this brand" });
  }
  return brand;
}

const periodEnum = z.enum(["day", "week", "month"]);

export const cadenceRouter = createTRPCRouter({
  // ---- Mix targets (pillar distribution, brand-level) ----
  setMixTarget: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        pillar: z.string().min(1),
        targetPct: z.number().int().min(0).max(100),
        period: periodEnum.default("week"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      // Brand-default rows (channelId null) upsert on the partial unique index
      // (brandId, pillar, period) WHERE channel_id IS NULL.
      const [row] = await ctx.db
        .insert(mixTargetTable)
        .values({
          brandId: input.brandId,
          pillar: input.pillar,
          targetPct: input.targetPct,
          period: input.period,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [
            mixTargetTable.brandId,
            mixTargetTable.pillar,
            mixTargetTable.period,
          ],
          targetWhere: sql`channel_id is null`,
          set: { targetPct: input.targetPct, isActive: true },
        })
        .returning();
      return row;
    }),

  removeMixTarget: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.query.mixTargetTable.findFirst({
        where: eq(mixTargetTable.id, input.id),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, target.brandId);
      await ctx.db.delete(mixTargetTable).where(eq(mixTargetTable.id, input.id));
      return { ok: true };
    }),

  // ---- Cadence targets (per channel × archetype) ----
  setCadenceTarget: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        channelId: z.string(),
        archetype: z.string().min(1),
        template: z.string().nullish(),
        count: z.number().int().min(0),
        period: periodEnum.default("week"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const channel = await ctx.db.query.channelTable.findFirst({
        where: eq(channelTable.id, input.channelId),
        columns: { id: true, brandId: true, platform: true },
      });
      if (channel?.brandId !== input.brandId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Channel does not belong to this brand",
        });
      }

      // Manual upsert: the unique index includes nullable `template`, where
      // Postgres treats NULLs as distinct (so ON CONFLICT wouldn't dedup).
      const template = input.template ?? null;
      const existing = await ctx.db.query.cadenceTargetTable.findFirst({
        where: and(
          eq(cadenceTargetTable.channelId, input.channelId),
          eq(cadenceTargetTable.archetype, input.archetype),
          template === null
            ? isNull(cadenceTargetTable.template)
            : eq(cadenceTargetTable.template, template),
          eq(cadenceTargetTable.period, input.period),
        ),
      });

      if (existing) {
        const [row] = await ctx.db
          .update(cadenceTargetTable)
          .set({ count: input.count, isActive: true })
          .where(eq(cadenceTargetTable.id, existing.id))
          .returning();
        return row;
      }
      const [row] = await ctx.db
        .insert(cadenceTargetTable)
        .values({
          brandId: input.brandId,
          channelId: input.channelId,
          platform: channel.platform,
          archetype: input.archetype,
          template,
          count: input.count,
          period: input.period,
          isActive: true,
        })
        .returning();
      return row;
    }),

  removeCadenceTarget: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.query.cadenceTargetTable.findFirst({
        where: eq(cadenceTargetTable.id, input.id),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, target.brandId);
      await ctx.db
        .delete(cadenceTargetTable)
        .where(eq(cadenceTargetTable.id, input.id));
      return { ok: true };
    }),
});
