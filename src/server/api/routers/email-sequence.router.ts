import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { actionProcedure, workspaceProcedure } from "@/server/api/orpc";
import {
  listSequences,
  getSequence,
  sequenceEmails,
  saveSequence,
  archiveSequence,
  previewSequence,
  prepareSequence,
  cancelSequenceEnrollment,
} from "@/server/ai/capabilities/email-sequences";
import { createEmailSlot } from "@/server/services/email-document.service";
import { lifecycleEnrollmentSchema } from "@/lib/validators/lifecycle-runtime";
import {
  previewTestJourney,
  startTestJourney,
  executionOverview,
  setExecutionEnabled,
  rotateIngestToken,
  enrollRecipient,
  recoverJourney,
} from "@/server/services/lifecycle-runtime/service";

import { createFlexTestSequence } from "@/server/services/lifecycle-runtime/flex";

const sequenceInput = z.object({ sequenceId: z.string().min(1) });
export const emailSequenceRouter = {
  createFlexTest: workspaceProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .handler(({ context, input }) =>
      createFlexTestSequence({
        ...input,
        organizationId: context.workspace.orgId,
        userId: context.session.user.id,
      }),
    ),
  previewTest: workspaceProcedure
    .input(sequenceInput.extend({ fast: z.boolean() }))
    .handler(({ context, input }) =>
      previewTestJourney(
        context.workspace.orgId,
        input.sequenceId,
        context.session.user.id,
        input.fast,
      ),
    ),
  startTest: workspaceProcedure
    .input(
      sequenceInput.extend({
        fast: z.boolean(),
        reviewedHash: z.string().min(1),
        requestId: z.uuid(),
        confirmSends: z.literal(true),
      }),
    )
    .handler(({ context, input }) =>
      startTestJourney({
        ...input,
        organizationId: context.workspace.orgId,
        userId: context.session.user.id,
      }),
    ),
  list: actionProcedure(listSequences),
  get: actionProcedure(getSequence),
  save: actionProcedure(saveSequence),
  archive: actionProcedure(archiveSequence),
  emails: actionProcedure(sequenceEmails),
  createEmail: workspaceProcedure
    .input(
      z.object({
        brandId: z.string(),
        title: z.string().trim().min(1).max(160),
      }),
    )
    .handler(({ context, input }) =>
      createEmailSlot({
        ...input,
        organizationId: context.workspace.orgId,
        userId: context.session.user.id,
        format: "newsletter.blast",
      }),
    ),
  executionOverview: workspaceProcedure
    .input(sequenceInput)
    .handler(({ context, input }) =>
      executionOverview(context.workspace.orgId, input.sequenceId),
    ),
  previewExecution: actionProcedure(previewSequence),
  prepareExecution: actionProcedure(prepareSequence),
  setExecutionEnabled: workspaceProcedure
    .input(
      sequenceInput.extend({
        enabled: z.boolean(),
        expectedRevisionId: z.string().optional(),
        confirmSends: z.literal(true).optional(),
      }),
    )
    .handler(({ context, input }) => {
      if (input.enabled && !input.confirmSends)
        throw new ORPCError("BAD_REQUEST", {
          message: "Confirm delivery before activating this journey.",
        });
      return setExecutionEnabled(
        context.workspace.orgId,
        input.sequenceId,
        input.enabled,
        input.expectedRevisionId,
      );
    }),
  rotateIngestToken: workspaceProcedure
    .input(sequenceInput)
    .handler(({ context, input }) =>
      rotateIngestToken(context.workspace.orgId, input.sequenceId),
    ),
  enrollRecipient: workspaceProcedure
    .input(
      sequenceInput.extend({
        enrollment: lifecycleEnrollmentSchema,
        confirmSends: z.literal(true),
      }),
    )
    .handler(({ context, input }) =>
      enrollRecipient(
        context.workspace.orgId,
        input.sequenceId,
        input.enrollment,
      ),
    ),
  recoverExecution: workspaceProcedure
    .input(
      sequenceInput.extend({
        afterId: z.string().optional(),
        confirmSends: z.literal(true),
      }),
    )
    .handler(({ context, input }) =>
      recoverJourney(context.workspace.orgId, input.sequenceId, input.afterId),
    ),
  cancelEnrollment: actionProcedure(cancelSequenceEnrollment),
};
