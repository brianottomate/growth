import { z } from "zod";
import { workspaceProcedure } from "@/server/api/orpc";
import { brandTaskFields } from "@/lib/brand-task";
import {
  createBrandTask,
  listBrandTasks,
  moveBrandTask,
  removeBrandTask,
  restoreBrandTask,
  updateBrandTask,
} from "@/server/services/brand-task.service";
import { confirmMetaPixel } from "@/server/services/meta-connect-setup.service";

const brandInput = z.object({ brandId: z.string().min(1) });
const taskInput = brandInput.extend({ id: z.string().min(1) });

export const brandTaskRouter = {
  restore: workspaceProcedure
    .input(taskInput)
    .handler(({ context, input }) =>
      restoreBrandTask(context.workspace, input),
    ),
  list: workspaceProcedure
    .input(brandInput)
    .handler(({ context, input }) =>
      listBrandTasks(context.workspace.orgId, input.brandId),
    ),
  create: workspaceProcedure
    .input(brandInput.extend(brandTaskFields.shape))
    .handler(({ context, input }) => createBrandTask(context.workspace, input)),
  update: workspaceProcedure
    .input(
      taskInput.extend({
        patch: brandTaskFields
          .partial()
          .refine(
            (patch) => Object.keys(patch).length > 0,
            "No changes supplied",
          ),
      }),
    )
    .handler(({ context, input }) => updateBrandTask(context.workspace, input)),
  remove: workspaceProcedure
    .input(taskInput)
    .handler(({ context, input }) => removeBrandTask(context.workspace, input)),
  /** The one-click answer to a "Confirm the client's Meta pixel" task. */
  confirmPixel: workspaceProcedure
    .input(taskInput.extend({ pixelId: z.string().regex(/^\d+$/) }))
    .handler(({ context, input }) =>
      confirmMetaPixel(
        { brandId: input.brandId, taskId: input.id, pixelId: input.pixelId },
        {
          organizationId: context.workspace.orgId,
          userId: context.workspace.userId,
        },
      ),
    ),
  move: workspaceProcedure
    .input(taskInput.extend({ beforeId: z.string().min(1).nullable() }))
    .handler(({ context, input }) => moveBrandTask(context.workspace, input)),
};
