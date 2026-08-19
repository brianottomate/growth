import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  freezeCompositionSchema,
} from "@/lib/compositions";
import {
  CompositionAccessError,
  freezeComposition,
} from "@/server/services/composition.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

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
    }),
});
