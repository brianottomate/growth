import { saveBaselineTarget } from "@/server/services/cadence-target.service";
import type { Database } from "@/server/db";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { protectedProcedure, actionProcedure } from "@/server/api/orpc";
import {
  brandTable,
  cadenceTargetTable,
  channelTable,
  memberTable,
  mixTargetTable,
} from "@/server/db/schema";
import { generateMonthSlots } from "@/server/services/slot-generate.service";
import { proposeStrategyTargets } from "@/server/ai/capabilities/operations";

type Ctx = { db: Database; session: { user: { id: string } } };

/** Ensure the user can manage strategy for this owned brand. Returns the brand. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) {
    throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
  }
  if (!brand.organizationId) {
    throw new ORPCError("BAD_REQUEST", {
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
    throw new ORPCError("FORBIDDEN", { message: "No access to this brand" });
  }
  return brand;
}

const periodEnum = z.enum(["day", "week", "month"]);

export const cadenceRouter = {
  /**
   * AI target-update proposals from own Zernio performance + peer cadences.
   * Persists nothing — the dialog applies accepted rows via
   * setCadenceTarget / setMixTarget.
   */
  suggestTargets: actionProcedure(proposeStrategyTargets),

  /**
   * The strategy→calendar computation: expand the brand's cadence/mix targets
   * into a month of empty slot placeholders. Idempotent top-up (claimed slots
   * still count toward the rhythm) — safe to re-run after target edits.
   * dryRun previews the per-channel counts without writing.
   */
  generateMonthSlots: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        year: z.number().int().min(2024).max(2100),
        month: z.number().int().min(1).max(12),
        dryRun: z.boolean().optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return generateMonthSlots({
        brandId: input.brandId,
        year: input.year,
        month: input.month,
        dryRun: input.dryRun,
      });
    }),

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
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const channel = await ctx.db.query.channelTable.findFirst({
        where: eq(channelTable.id, input.channelId),
        columns: { id: true, brandId: true, platform: true },
      });
      if (channel?.brandId !== input.brandId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Channel does not belong to this brand",
        });
      }

      return saveBaselineTarget(
        { ...input, platform: channel.platform },
        ctx.db,
      );
    }),
};
