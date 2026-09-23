import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { actionProcedure, workspaceProcedure } from "@/server/api/orpc";
import {
  addLifecycleStepAction,
  archiveLifecycleProgramAction,
  createLifecycleProgramAction,
  lifecycleOverviewAction,
  updateLifecycleProgramAction,
  updateLifecycleStepAction,
} from "@/server/ai/capabilities/lifecycle";
import { lifecycleProgramStepTable } from "@/server/db/schema";
import { updateLifecycleStep } from "@/server/services/lifecycle.service";

export const lifecycleRouter = {
  overview: actionProcedure(lifecycleOverviewAction),
  createProgram: actionProcedure(createLifecycleProgramAction),
  updateProgram: actionProcedure(updateLifecycleProgramAction),
  archiveProgram: actionProcedure(archiveLifecycleProgramAction),
  addStep: actionProcedure(addLifecycleStepAction),
  updateStep: actionProcedure(updateLifecycleStepAction),

  // Kept for the precise form UI. General chat intentionally has no hard
  // delete action; it can archive programs and edit steps instead.
  deleteStep: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const organizationId = ctx.workspace.orgId;
      const existing = await ctx.db.query.lifecycleProgramStepTable.findFirst({
        where: eq(lifecycleProgramStepTable.id, input.id),
        columns: { id: true, programId: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Step not found" });
      }
      await updateLifecycleStep({
        organizationId,
        stepId: existing.id,
        changes: {},
      });
      await ctx.db
        .delete(lifecycleProgramStepTable)
        .where(eq(lifecycleProgramStepTable.id, existing.id));
      return { id: existing.id };
    }),
};
