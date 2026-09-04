import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  compositionSpecSchema,
  freezeCompositionSchema,
} from "@/lib/compositions";
import {
  applyDirection,
  critiqueCard,
} from "@/server/services/card-director.service";
import {
  CompositionAccessError,
  freezeComposition,
  loadCompositionSource,
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const context = await loadCompositionSource(
          await resolveCompositionContext(ctx.session.user.id, input),
        );
        if (!context.sourceUrl) {
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
        return {
          verdict: direction.verdict,
          note: direction.note,
          changes: applied.changes,
          title: applied.spec.title,
          subtitle: applied.spec.subtitle ?? null,
          focal: applied.spec.focal ?? null,
          scrim: applied.spec.scrim ?? null,
        };
      } catch (error) {
        rethrowAccess(error);
      }
    }),
});
