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
  applyDirection,
  critiqueCard,
  extendSource,
  extendToCanvas,
} from "@/server/services/card-director.service";
import { isGeminiImageConfigured } from "@/server/clients/gemini-image.client";
import {
  CompositionAccessError,
  freezeComposition,
  loadCompositionSource,
  openComposition,
  renderComposition,
  resolveCompositionContext,
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
        const context = await loadCompositionSource(
          await resolveCompositionContext(ctx.session.user.id, input),
        );
        if (!context.sourceUrl || !input.sourceMediaAssetId) {
          throw new CompositionAccessError(
            "The art director judges a card against its photo; this blueprint has none.",
            422,
          );
        }
        const spec = { ...input, assetTitle: input.title || "preview" };
        const [card, source] = await Promise.all([
          renderComposition(input, context).arrayBuffer(),
          fetch(context.sourceUrl, { signal: AbortSignal.timeout(20_000) }).then(
            (response) => response.arrayBuffer(),
          ),
        ]);
        const direction = await critiqueCard({
          card: Buffer.from(card),
          source: Buffer.from(source),
          spec,
          brandName: context.brand.name,
          home: { name: input.title, facts: input.subtitle ?? "" },
        });
        if (!direction) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The art director could not be reached.",
          });
        }
        const applied = applyDirection(spec, direction);
        const changes = [...applied.changes];
        let sourceMediaAssetId: string | null = null;
        let focal = applied.spec.focal ?? null;
        // The same step the homes flow takes: when no crop can show the
        // subject, paint more of the scene in and start from that photo.
        if (direction.verdict === "adjust" && direction.extend !== "none") {
          if (isGeminiImageConfigured) {
            try {
              const extended = await extendSource({
                brandId: input.brandId,
                userId: ctx.session.user.id,
                source: { id: input.sourceMediaAssetId, url: context.sourceUrl },
                formatId: input.formatId,
                axis: direction.extend,
                home: input.title || context.brand.name,
              });
              sourceMediaAssetId = extended.id;
              focal = null;
              changes.push(
                `extended the photo ${direction.extend === "vertical" ? "above and below" : "to both sides"} so the subject fits`,
              );
            } catch (error) {
              console.error("photo extension failed", error);
              changes.push("wanted the photo extended, which failed, so the crop stands");
            }
          } else {
            changes.push("wanted the photo extended, which is not configured here");
          }
        }
        return {
          verdict: direction.verdict,
          note: direction.note,
          changes,
          title: applied.spec.title,
          subtitle: applied.spec.subtitle ?? null,
          focal,
          scrim: applied.spec.scrim ?? null,
          sourceMediaAssetId,
        };
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
        const context = await resolveCompositionContext(ctx.session.user.id, {
          brandId: input.brandId,
          templateId: "photo-only",
          formatId: input.formatId,
          sourceMediaAssetId: input.sourceMediaAssetId,
          title: "",
          imagePosition: "center",
          mark: "auto",
        });
        if (!context.sourceUrl) {
          throw new CompositionAccessError("Choose a photo to extend", 422);
        }
        return await extendToCanvas({
          brandId: input.brandId,
          userId: ctx.session.user.id,
          source: { id: input.sourceMediaAssetId, url: context.sourceUrl },
          formatId: input.formatId,
          home: input.title?.trim() || context.brand.name,
        });
      } catch (error) {
        rethrowAccess(error);
      }
    }),
});
