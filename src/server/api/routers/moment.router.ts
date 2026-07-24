import type { Database } from "@/server/db";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  amplificationTargetTable,
  brandTable,
  contentPostTable,
  initiativeTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import {
  commitMomentBlueprint,
  generateMomentBlueprint,
  ingestSources,
  momentBlueprintSchema,
  momentSlotSchema,
} from "@/server/services/plan-moment.service";

async function assertOwnedBrandAccess(
  ctx: {
    db: Database;
    session: { user: { id: string } };
  },
  brandId: string,
) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand?.organizationId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Owned brand not found",
    });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
  return brand;
}

/**
 * Moments — the forward-planning capstone. `generate` proposes a shape (no DB
 * writes — review/edit first); `commit` materializes the approved blueprint;
 * `get` reads a committed moment back. Step 2 (drafting slots) reuses Studio.
 */
export const momentRouter = createTRPCRouter({
  /**
   * Phase 0 (optional): turn pasted sources — a press release / landing-page
   * URL, image URLs — into planner input (name + brief + reference images).
   * Run once up front; the planner model can't fetch URLs itself. Persists NOTHING.
   */
  ingest: protectedProcedure
    .input(z.object({ sources: z.array(z.string()).min(1) }))
    .mutation(async ({ input }) => ingestSources(input.sources)),

  /** Phase 1: propose a shape from a name/prompt/images. Persists NOTHING. */
  generate: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        name: z.string().optional(),
        prompt: z.string().optional(),
        imageUrls: z.array(z.string()).optional(),
        goal: z.string().optional(),
        scaleHint: z.enum(["single", "arc"]).optional(),
        refine: z
          .object({
            keepSlots: z.array(momentSlotSchema),
            blanks: z.number().int().min(0).optional(),
            drop: z.array(z.string()).optional(),
            steer: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brand = await assertOwnedBrandAccess(ctx, input.brandId);
      return generateMomentBlueprint({
        brandName: brand.name,
        brandTagline: brand.tagline,
        name: input.name,
        prompt: input.prompt,
        imageUrls: input.imageUrls,
        goal: input.goal,
        scaleHint: input.scaleHint,
        refine: input.refine,
      });
    }),

  /** Phase 2: materialize the approved (possibly edited) blueprint. */
  commit: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        name: z.string().min(1),
        launchDateISO: z.string(),
        blueprint: momentBlueprintSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedBrandAccess(ctx, input.brandId);
      return commitMomentBlueprint(input);
    }),

  get: protectedProcedure
    .input(z.object({ initiativeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const initiative = await ctx.db.query.initiativeTable.findFirst({
        where: eq(initiativeTable.id, input.initiativeId),
      });
      if (!initiative) return null;
      await assertOwnedBrandAccess(ctx, initiative.brandId);
      const slots = await ctx.db.query.contentPostTable.findMany({
        where: and(
          eq(contentPostTable.initiativeId, input.initiativeId),
          eq(contentPostTable.status, "slot"),
        ),
        orderBy: [asc(contentPostTable.plannedAt)],
      });
      // Targets hang off platform posts now; roll up across the initiative's
      // content items.
      const contents = await ctx.db.query.contentPostTable.findMany({
        where: eq(contentPostTable.initiativeId, input.initiativeId),
        columns: { id: true },
      });
      const posts = contents.length
        ? await ctx.db.query.platformPostTable.findMany({
            where: inArray(
              platformPostTable.contentPostId,
              contents.map((content) => content.id),
            ),
            columns: { id: true },
          })
        : [];
      const targets = posts.length
        ? await ctx.db.query.amplificationTargetTable.findMany({
            where: inArray(
              amplificationTargetTable.platformPostId,
              posts.map((post) => post.id),
            ),
            with: { amplifier: true },
          })
        : [];
      return { initiative, slots, targets };
    }),
});
