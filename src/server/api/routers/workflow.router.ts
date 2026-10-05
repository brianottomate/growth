import { z } from "zod";
import { protectedProcedure } from "@/server/api/orpc";
import {
  workflowActivity,
  dismissWorkflow,
} from "@/server/services/workflow-activity.service";
const scope = z.object({ brandId: z.string().min(1) });
export const workflowRouter = {
  activity: protectedProcedure
    .input(scope)
    .handler(({ input, context }) =>
      workflowActivity(context.session.user.id, input.brandId),
    ),
  dismiss: protectedProcedure
    .input(scope.extend({ runId: z.string().min(1) }))
    .handler(({ input, context }) =>
      dismissWorkflow(context.session.user.id, input.brandId, input.runId),
    ),
};
