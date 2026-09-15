import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  compositionFormatIdSchema,
  compositionSpecSchema,
  freezeCompositionSchema,
} from "@/lib/compositions";
import {
  directComposition,
  extendCompositionSource,
} from "@/server/services/composition-direct.service";
import {
  writeCompositionCopy,
  writeCompositionCopySchema,
} from "@/server/services/composition-copy.service";
import {
  CompositionAccessError,
  freezeComposition,
  openComposition,
} from "@/server/services/composition.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function rethrowAccess(error: unknown): never {
  if (error instanceof CompositionAccessError) {
    throw new TRPCError({
      code:
        error.status === 403
          ? "FORBIDDEN"
          : error.status === 404
            ? "NOT_FOUND"
            : "BAD_REQUEST",
      message: error.message,
    });
  }
  throw error;
}

export const compositionRouter = createTRPCRouter({
  blueprints: protectedProcedure.query(() => ({
    templates: COMPOSITION_TEMPLATES,
    formats: COMPOSITION_FORMATS,
  })),

  /** Reopen a frozen card in the Studio: the spec that made it, plus its direction. */
  open: protectedProcedure
    .input(z.object({ assetId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        return await openComposition({
          userId: ctx.session.user.id,
          assetId: input.assetId,
        });
      } catch (error) {
        rethrowAccess(error);
      }
    }),

  freeze: protectedProcedure
    .input(freezeCompositionSchema)
    .output(z.object({ id: z.string(), url: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const asset = await freezeComposition({
          userId: ctx.session.user.id,
          spec: input,
        });
        return { id: asset.id, url: asset.url };
      } catch (error) {
        rethrowAccess(error);
      }
    }),

  /**
   * The art director's read of the composition as it stands: renders it once,
   * shows the card and its photo to the model, and returns the corrections as
   * form values. Nothing is saved; the operator sees the fixed preview and
   * decides whether to freeze it.
   */
  direct: protectedProcedure
    .input(compositionSpecSchema)
    .output(
      z.object({
        verdict: z.enum(["keep", "adjust"]),
        note: z.string(),
        changes: z.array(z.string()),
        title: z.string(),
        subtitle: z.string().nullable(),
        focal: z.object({ x: z.number(), y: z.number() }).nullable(),
        scrim: z.string().nullable(),
        /** Set when the director had the photo extended; the new source. */
        sourceMediaAssetId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await directComposition({
          userId: ctx.session.user.id,
          spec: input,
        });
      } catch (error) {
        rethrowAccess(error);
      }
    }),

  /**
   * Words for the card before the art director judges it: the blueprint's
   * fields filled from the brand's voice and the home behind the photo.
   * Nothing is saved; the Studio puts the values in the form.
   */
  writeCopy: protectedProcedure
    .input(writeCompositionCopySchema)
    .output(
      z.object({
        eyebrow: z.string().nullable(),
        title: z.string(),
        subtitle: z.string().nullable(),
        cta: z.string().nullable(),
        rating: z.number().nullable(),
        note: z.string(),
        homeUrl: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await writeCompositionCopy({
          userId: ctx.session.user.id,
          spec: input,
        });
      } catch (error) {
        rethrowAccess(error);
      }
    }),

  /**
   * Extend the chosen photo to the canvas's ratio, on the operator's say-so.
   * Returns the new library asset; the Studio switches to it.
   */
  extend: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        sourceMediaAssetId: z.string().min(1),
        formatId: compositionFormatIdSchema,
        title: z.string().trim().max(120).optional(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        url: z.string(),
        reused: z.boolean(),
        axis: z.enum(["vertical", "horizontal"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await extendCompositionSource({
          userId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        rethrowAccess(error);
      }
    }),
});
