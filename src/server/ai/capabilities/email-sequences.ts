import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import { brandEmailSenderSchema } from "./outputs/shared";
import { emailSequenceDraftSchema } from "@/lib/validators/email-sequence";
import {
  lifecycleConditionSchema,
  lifecycleExecutionSettingsSchema,
  lifecycleEnrollmentSchema,
} from "@/lib/validators/lifecycle-runtime";
import {
  getEmailSequence,
  listEmailSequences,
  saveEmailSequence,
  archiveEmailSequence,
  listSequenceEmails,
} from "@/server/services/email-sequence.service";
import {
  previewJourney,
  prepareJourney,
  executionOverview,
  setExecutionEnabled,
  enrollRecipient,
  recoverJourney,
  cancelEnrollment,
} from "@/server/services/lifecycle-runtime/service";

const sequenceInput = z.object({ sequenceId: z.string().min(1) });
const settingsInput = sequenceInput.extend({
  settings: lifecycleExecutionSettingsSchema,
});
const sequence = emailSequenceDraftSchema.extend({
  id: z.string(),
  brandId: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  steps: z.array(
    emailSequenceDraftSchema.shape.steps.element.extend({
      sequenceId: z.string(),
      position: z.number(),
    }),
  ),
});
const listing = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  triggerEvent: z.string(),
  updatedAt: z.string(),
  enabled: z.boolean().nullable(),
  revisionId: z.string().nullable(),
});
const snapshot = z.object({
  settings: lifecycleExecutionSettingsSchema,
  delivery: z
    .object({
      provider: z.literal("postmark"),
      serverId: z.number(),
      messageStream: z.string(),
    })
    .nullable(),
  postalAddress: z.string().nullable(),
  steps: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      subject: z.string(),
      body: z.string(),
      renderedHtml: z.string(),
      renderedText: z.string(),
      platformPostId: z.string().nullable(),
      delayMinutes: z.number(),
      parentStepId: z.string().nullable(),
      condition: lifecycleConditionSchema.nullable(),
    }),
  ),
});
export const listSequences = growthAction({
  description:
    "List a brand's executable Performance Email sequences and draft/active/paused state. Separate from lifecycle strategy programs.",
  inputSchema: z.object({ brandId: z.string() }),
  outputSchema: z.array(listing),
  nativeOutputSchema: z.array(listing.extend({ updatedAt: z.date() })),
  execute: (input, ctx) => listEmailSequences(ctx.orgId, input.brandId),
});
export const getSequence = growthAction({
  description:
    "Read a sequence before editing: ordered steps, email platformPostIds, entry event, exit rule and current version. waitMinutes is the wait AFTER the preceding step (first step waits from enrollment); total duration is at most one year. Draft changes never modify frozen delivery revisions.",
  inputSchema: sequenceInput,
  outputSchema: sequence,
  nativeOutputSchema: sequence.extend({
    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z.date().nullable(),
  }),
  execute: (input, ctx) =>
    getEmailSequence({ ...input, organizationId: ctx.orgId }),
});
export const sequenceEmails = growthAction({
  description:
    "List this brand's existing email content that can be linked into sequence steps and its configured sender. Use emailRead.get to inspect content; emailWrite.createSlot/updateDraft/generateDraft to create or edit an individual email. Do not generate every email merely to plan a sequence.",
  inputSchema: z.object({ brandId: z.string() }),
  outputSchema: z.object({
    emails: z.array(
      z.object({ id: z.string(), title: z.string(), status: z.string() }),
    ),
    sender: brandEmailSenderSchema,
  }),
  execute: (input, ctx) => listSequenceEmails(ctx.orgId, input.brandId),
});
export const saveSequence = growthAction({
  description:
    "Create or replace a sequence draft without sending. For edits first read the sequence and pass expectedVersion; preserve unrelated fields and step IDs. Supply unique step IDs for new steps. Steps may have null platformPostId while planning. A sequence is a separate plan linking existing email content, not a lifecycle strategy program.",
  inputSchema: z.object({
    brandId: z.string(),
    sequenceId: z.string().optional(),
    expectedVersion: z.number().int().optional(),
    draft: emailSequenceDraftSchema,
  }),
  outputSchema: z.object({ id: z.string(), version: z.number() }),
  execute: (input, ctx) =>
    saveEmailSequence({ ...input, organizationId: ctx.orgId }),
});
export const archiveSequence = growthAction({
  description:
    "Archive one requested sequence, disable execution and cancel unfinished enrollments. Cannot undo already sent emails. No restoration action exists.",
  inputSchema: sequenceInput,
  outputSchema: z.object({ archived: z.boolean() }),
  execute: (input, ctx) => archiveEmailSequence(ctx.orgId, input.sequenceId),
});
export const previewSequence = growthAction({
  description:
    "Preview the exact sequence emails, cumulative timing, sender and Postmark destination and get blocking errors plus contentHash. Does not send. The saved plan owns triggerEvent and exitCondition; per-step conditions are currently unsupported. Review this result before prepareSequence; never invent a reviewedHash.",
  inputSchema: settingsInput,
  outputSchema: z.object({
    snapshot,
    contentHash: z.string(),
    errors: z.array(z.string()),
    variables: z.array(z.string()),
  }),
  execute: (input, ctx) =>
    previewJourney(ctx.orgId, input.sequenceId, input.settings),
});
export const prepareSequence = growthAction({
  description:
    "Freeze the just-previewed sequence as a delivery revision using its exact contentHash as reviewedHash. Requires execution paused. Does not activate or send; existing enrollments keep their own frozen revision. Read status and obtain separate activation approval afterward.",
  inputSchema: settingsInput.extend({ reviewedHash: z.string().min(1) }),
  outputSchema: z.object({ revisionId: z.string() }),
  execute: (input, ctx) =>
    prepareJourney({ ...input, organizationId: ctx.orgId, userId: ctx.userId }),
});
export const sequenceStatus = growthAction({
  description:
    "Inspect sequence delivery readiness, frozen revision, latest 50 enrollments and their deliveries. Recipient emails and ingest credentials are omitted from retained tool results. Runs are recent, not lifetime totals. needs_review/uncertain deliveries require operator investigation, never automatic resend.",
  inputSchema: sequenceInput,
  outputSchema: z.object({
    enabled: z.boolean(),
    hasIngestToken: z.boolean(),
    readiness: z.object({ ready: z.boolean(), missing: z.array(z.string()) }),
    revision: z
      .object({
        id: z.string(),
        contentHash: z.string(),
        createdAt: z.string(),
        snapshot,
      })
      .nullable(),
    runs: z.array(
      z.object({
        id: z.string(),
        status: z.string(),
        reason: z.string().nullable(),
        createdAt: z.string(),
        revisionId: z.string(),
      }),
    ),
    deliveries: z.array(
      z.object({
        id: z.string(),
        enrollmentId: z.string(),
        stepId: z.string(),
        stepName: z.string(),
        status: z.string(),
        dueAt: z.string(),
        sentAt: z.string().nullable(),
        providerStatus: z.string().nullable(),
        lastError: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const data = await executionOverview(ctx.orgId, input.sequenceId);
    return {
      enabled: data.enabled,
      hasIngestToken: data.hasIngestToken,
      readiness: data.readiness,
      revision: data.revision
        ? {
            id: data.revision.id,
            contentHash: data.revision.contentHash,
            createdAt: data.revision.createdAt.toISOString(),
            snapshot: data.revision.snapshot,
          }
        : null,
      runs: data.runs.map(({ id, status, reason, createdAt, revisionId }) => ({
        id,
        status,
        reason,
        createdAt: createdAt.toISOString(),
        revisionId,
      })),
      deliveries: data.deliveries.map((d) => ({
        ...d,
        dueAt: d.dueAt.toISOString(),
        sentAt: d.sentAt?.toISOString() ?? null,
      })),
    };
  },
});
export const activateSequence = growthAction({
  description:
    "Activate the exact reviewed revision of this sequence. Can cause real Postmark emails from existing queued work and new events. Read sequenceStatus first, explain the revision/recipient impact, and obtain the in-app approval card. Resume does not itself recover paused queue work; recovery has a separate approval.",
  inputSchema: sequenceInput.extend({ expectedRevisionId: z.string().min(1) }),
  outputSchema: z.object({ enabled: z.boolean() }),
  execute: (input, ctx) =>
    setExecutionEnabled(
      ctx.orgId,
      input.sequenceId,
      true,
      input.expectedRevisionId,
    ),
});
export const pauseSequence = growthAction({
  description:
    "Pause sequence delivery. In-flight provider sends may finish. Resuming and recovering queued work require separate approval; pausing preserves enrollment state.",
  inputSchema: sequenceInput,
  outputSchema: z.object({ enabled: z.boolean() }),
  execute: (input, ctx) =>
    setExecutionEnabled(ctx.orgId, input.sequenceId, false),
});
export const enrollSequence = growthAction({
  description:
    "Enroll ONE explicitly supplied consenting recipient in an active sequence; may send immediately. Use a stable eventId for retries and the configured eventName. Never infer marketing permission, invent consent evidence or bulk-enroll an audience. Requires in-app send approval. queued:false means enrollment exists but dispatch needs recovery, not a new eventId.",
  inputSchema: sequenceInput.extend({ enrollment: lifecycleEnrollmentSchema }),
  outputSchema: z.object({ enrollmentId: z.string(), queued: z.boolean() }),
  execute: (input, ctx) =>
    enrollRecipient(ctx.orgId, input.sequenceId, input.enrollment),
});
export const recoverSequence = growthAction({
  description:
    "Recover queued work for up to 50 active enrollments; may send real emails. Requires in-app send approval. Pass nextCursor as afterId for another separately approved batch. Does not blindly resend uncertain provider attempts.",
  inputSchema: sequenceInput.extend({ afterId: z.string().optional() }),
  outputSchema: z.object({
    queued: z.number(),
    failed: z.number(),
    nextCursor: z.string().nullable(),
  }),
  execute: (input, ctx) =>
    recoverJourney(ctx.orgId, input.sequenceId, input.afterId),
});
export const cancelSequenceEnrollment = growthAction({
  description:
    "Cancel one requested enrollment belonging to this sequence. Cannot unsend email or restore the cancelled enrollment.",
  inputSchema: sequenceInput.extend({ enrollmentId: z.string().min(1) }),
  outputSchema: z.object({ cancelled: z.boolean() }),
  execute: (input, ctx) =>
    cancelEnrollment(ctx.orgId, input.sequenceId, input.enrollmentId),
});
