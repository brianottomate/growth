import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  CompositionAccessError,
  openComposition,
} from "@/server/services/composition.service";
import { protectedProcedure, actionProcedure } from "@/server/api/orpc";
import {
  directCompositionAction,
  extendCompositionAction,
  freezeCompositionToLibrary,
  writeCompositionCopyAction,
} from "@/server/ai/capabilities/content";

export const compositionRouter = {
  /** Reopen a frozen card in the Studio: the spec that made it, plus its direction. */
  open: protectedProcedure
    .input(z.object({ assetId: z.string().min(1) }))
    .handler(async ({ context: ctx, input }) => {
      try {
        return await openComposition({
          userId: ctx.session.user.id,
          assetId: input.assetId,
        });
      } catch (error) {
        if (error instanceof CompositionAccessError) {
          throw new ORPCError(
            error.status === 403
              ? "FORBIDDEN"
              : error.status === 404
                ? "NOT_FOUND"
                : "BAD_REQUEST",
            { message: error.message },
          );
        }
        throw error;
      }
    }),

  freeze: actionProcedure(freezeCompositionToLibrary),

  /**
   * The art director's read of the composition as it stands: renders it once,
   * shows the card and its photo to the model, and returns the corrections as
   * form values. Nothing is saved; the operator sees the fixed preview and
   * decides whether to freeze it.
   */
  direct: actionProcedure(directCompositionAction),

  /**
   * Words for the card before the art director judges it: the blueprint's
   * fields filled from the brand's voice and the home behind the photo.
   * Nothing is saved; the Studio puts the values in the form.
   */
  writeCopy: actionProcedure(writeCompositionCopyAction),

  /**
   * Extend the chosen photo to the canvas's ratio, on the operator's say-so.
   * Returns the new library asset; the Studio switches to it.
   */
  extend: actionProcedure(extendCompositionAction),
};
