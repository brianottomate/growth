import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  amplificationTargetTable,
  brandTable,
  contentPostTable,
  initiativeTable,
} from "@/server/db/schema";
import {
  commitMomentBlueprint,
  generateMomentBlueprint,
  momentBlueprintSchema,
  momentSlotSchema,
} from "@/server/services/plan-moment.service";

/**
 * Moments — the forward-planning capstone. `generate` proposes a shape (no DB
 * writes — review/edit first); `commit` materializes the approved blueprint;
 * `get` reads a committed moment back. Step 2 (drafting slots) reuses Studio.
 */
export const momentRouter = createTRPCRouter({
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
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
      });
      if (!brand) throw new TRPCError({ code: "NOT_FOUND" });
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
    .mutation(async ({ input }) => commitMomentBlueprint(input)),

  get: protectedProcedure
    .input(z.object({ initiativeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const initiative = await ctx.db.query.initiativeTable.findFirst({
        where: eq(initiativeTable.id, input.initiativeId),
      });
      if (!initiative) return null;
      const slots = await ctx.db.query.contentPostTable.findMany({
        where: and(
          eq(contentPostTable.initiativeId, input.initiativeId),
          eq(contentPostTable.status, "slot"),
        ),
        orderBy: [asc(contentPostTable.plannedAt)],
      });
      const targets = await ctx.db.query.amplificationTargetTable.findMany({
        where: eq(amplificationTargetTable.momentId, input.initiativeId),
        with: { amplifier: true },
      });
      return { initiative, slots, targets };
    }),
});
