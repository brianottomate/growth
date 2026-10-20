import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import { broadcastScheduleInput } from "@/lib/broadcast-schedule";
import {
  previewBroadcastSchedule,
  scheduleBroadcasts,
  pauseBroadcast,
  recoverBroadcast,
  broadcastScheduleStatus,
} from "@/server/services/broadcast-schedule.service";
import {
  prepareBrandSend,
  sendPreparedBrandTestEmail,
} from "@/server/services/brand-email-send.service";
import { getEmailDraftOutputSchema } from "./outputs/email";
import { emailSchema } from "@/lib/validators";
import { BROADCAST_SEED_RECIPIENTS } from "@/lib/email-seed-recipient";
const actor = (ctx: { orgId: string; userId: string }) => ({
  organizationId: ctx.orgId,
  userId: ctx.userId,
});
const sendInput = z.object({ messageSendId: z.string().min(1) });
export const prepareBroadcast = growthAction({
  description:
    "Prepare an existing approved email with a compiled same-brand audience. Freezes the rendered creative, sender, booking links and audience. Does not send or schedule. Existing posts and series remain the content owners.",
  inputSchema: z.object({ platformPostId: z.string(), snapshotId: z.string() }),
  outputSchema: getEmailDraftOutputSchema.shape.messageSends.element,
  nativeOutputSchema:
    getEmailDraftOutputSchema.shape.messageSends.element.extend({
      approvedAt: z.date().nullable(),
      sentAt: z.date().nullable(),
      createdAt: z.date(),
    }),
  execute: (input, ctx) => prepareBrandSend({ ...input, ...actor(ctx) }),
});
export const sendBroadcastTest = growthAction({
  description:
    "Send exactly one frozen prepared Postmark broadcast to an explicitly supplied server-approved seed inbox. Uses the same prepared sender, personalization, markup, links, stream and unsubscribe handling as live bulk, but never reads or claims the guest audience, changes delivery state or schedules guests. Requires explicit user approval.",
  inputSchema: z.object({
    messageSendId: z.string().min(1),
    recipientEmail: z.enum(BROADCAST_SEED_RECIPIENTS),
  }),
  outputSchema: z.object({
    to: emailSchema,
    messageId: z.string().nullable(),
    messageSendId: z.string(),
    contentHash: z.string(),
  }),
  execute: (input, ctx) =>
    sendPreparedBrandTestEmail({ ...input, ...actor(ctx) }),
});
const previewSend = z.object({
  messageSendId: z.string(),
  platformPostId: z.string(),
  contentHash: z.string(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  sender: z
    .object({
      fromName: z.string(),
      fromEmail: z.string(),
      replyTo: z.string().nullable(),
    })
    .nullable(),
  audience: z.object({
    kind: z.enum(["wanderos_operators", "guests", "subscribers"]),
    provider: z.enum(["postmark", "customerio"]),
    label: z.string(),
    snapshotId: z.string().optional(),
    serverId: z.number().optional(),
    messageStream: z.string().optional(),
    segmentId: z.number().optional(),
  }),
  recipientCount: z.number(),
  scheduledAt: z.string(),
  localTime: z.string(),
});
export const previewBroadcasts = growthAction({
  description:
    "Review a brand's existing prepared emails and proposed fixed send dates together, with exact creative, sender, audience, counts and local times. Returns reviewedHash for scheduleBroadcasts. Calendar dates alone never authorize delivery.",
  inputSchema: broadcastScheduleInput,
  outputSchema: z.object({
    sends: z.array(previewSend),
    reviewedHash: z.string(),
    readiness: z.object({ ready: z.boolean(), missing: z.array(z.string()) }),
  }),
  execute: (input, ctx) => previewBroadcastSchedule(input, actor(ctx)),
});
export const scheduleBroadcastsAction = growthAction({
  description:
    "Approve and queue exactly the reviewed prepared broadcasts at fixed calendar times using the shared sequence delivery queue. Requires explicit user approval and confirmation that conflicting Customer.io sends have stopped. One approval covers the supplied set. queued=false means saved but recovery is needed. Never substitute a guessed reviewedHash.",
  inputSchema: broadcastScheduleInput.extend({
    reviewedHash: z.string(),
    customerIoStopped: z.literal(true),
  }),
  outputSchema: z.object({
    sends: z.array(
      z.object({ messageSendId: z.string(), queued: z.boolean() }),
    ),
  }),
  execute: (input, ctx) => scheduleBroadcasts(input, actor(ctx)),
});
export const pauseBroadcastAction = growthAction({
  description:
    "Pause an existing scheduled broadcast before the next recipient page. Already accepted provider requests cannot be recalled. Reapprove a future date to resume unstarted work; investigate attempted work separately.",
  inputSchema: sendInput,
  outputSchema: z.object({ paused: z.boolean() }),
  execute: (input, ctx) => pauseBroadcast(input.messageSendId, actor(ctx)),
});
export const recoverBroadcastAction = growthAction({
  description:
    "Republish the durable wakeup for an approved, unstarted scheduled broadcast after a queue failure. Does not retry failed or uncertain provider attempts. An overdue approved send may dispatch immediately. Requires user approval.",
  inputSchema: sendInput,
  outputSchema: z.object({ queued: z.boolean() }),
  execute: (input, ctx) => recoverBroadcast(input.messageSendId, actor(ctx)),
});
export const broadcastStatus = growthAction({
  description:
    "Read a prepared broadcast's saved delivery schedule, send status and error without sending or changing anything.",
  inputSchema: sendInput,
  outputSchema: z.object({
    messageSendId: z.string(),
    status: z.string(),
    error: z.string().nullable(),
    schedule: z
      .object({
        dueAt: z.string(),
        timeZone: z.string(),
        runtimeId: z.string(),
        state: z.enum(["approved", "scheduled", "paused"]),
        queueMessageId: z.string().optional(),
        customerIoStopped: z.literal(true),
      })
      .nullable(),
  }),
  execute: (input, ctx) =>
    broadcastScheduleStatus(input.messageSendId, actor(ctx)),
});
