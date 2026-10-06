import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { workspaceProcedure } from "@/server/api/orpc";
import { emailSequenceDraftSchema } from "@/lib/validators/email-sequence";
import {
  getEmailSequence,
  listEmailSequences,
  saveEmailSequence,
  archiveEmailSequence,
  listSequenceEmails,
} from "@/server/services/email-sequence.service";
import { createEmailSlot } from "@/server/services/email-document.service";
import {
  lifecycleExecutionSettingsSchema,
  lifecycleEnrollmentSchema,
} from "@/lib/validators/lifecycle-runtime";
import {
  previewJourney,
  prepareJourney,
  executionOverview,
  setExecutionEnabled,
  rotateIngestToken,
  enrollRecipient,
  recoverJourney,
  cancelEnrollment,
} from "@/server/services/lifecycle-runtime/service";

const sequenceInput = z.object({ sequenceId: z.string().min(1) });
export const emailSequenceRouter = {
  list: workspaceProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(({ context, input }) =>
      listEmailSequences(context.workspace.orgId, input.brandId),
    ),
  get: workspaceProcedure.input(sequenceInput).handler(({ context, input }) =>
    getEmailSequence({
      organizationId: context.workspace.orgId,
      sequenceId: input.sequenceId,
    }),
  ),
  save: workspaceProcedure
    .input(
      z.object({
        brandId: z.string(),
        sequenceId: z.string().optional(),
        expectedVersion: z.number().int().optional(),
        draft: emailSequenceDraftSchema,
      }),
    )
    .handler(({ context, input }) =>
      saveEmailSequence({ ...input, organizationId: context.workspace.orgId }),
    ),
  archive: workspaceProcedure
    .input(sequenceInput)
    .handler(({ context, input }) =>
      archiveEmailSequence(context.workspace.orgId, input.sequenceId),
    ),
  emails: workspaceProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(({ context, input }) =>
      listSequenceEmails(context.workspace.orgId, input.brandId),
    ),
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
  previewExecution: workspaceProcedure
    .input(sequenceInput.extend({ settings: lifecycleExecutionSettingsSchema }))
    .handler(({ context, input }) =>
      previewJourney(context.workspace.orgId, input.sequenceId, input.settings),
    ),
  prepareExecution: workspaceProcedure
    .input(
      sequenceInput.extend({
        settings: lifecycleExecutionSettingsSchema,
        reviewedHash: z.string(),
      }),
    )
    .handler(({ context, input }) =>
      prepareJourney({
        ...input,
        organizationId: context.workspace.orgId,
        userId: context.session.user.id,
      }),
    ),
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
  cancelEnrollment: workspaceProcedure
    .input(sequenceInput.extend({ enrollmentId: z.string() }))
    .handler(({ context, input }) =>
      cancelEnrollment(
        context.workspace.orgId,
        input.sequenceId,
        input.enrollmentId,
      ),
    ),
};
