import { z } from "zod";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { contentStatusEnum } from "@/server/db/content-schema";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const listAmplifiersOutputSchema = z.strictObject({
  brands: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  amplifiers: z.array(
    z.strictObject({
      handles: z.array(
        z.strictObject({ handle: z.string(), platform: z.string() }),
      ),
      history: z.strictObject({
        asked: z.number(),
        confirmed: z.number(),
        fulfilled: z.number(),
        planned: z.number(),
      }),
      id: z.string(),
      linkedBrandId: z.string().nullable(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      notes: z.string().nullable(),
      slackUserId: z.string().nullable(),
      handoffPreference: z.enum(["manual", "slack"]),
      type: z.string().nullable(),
    }),
  ),
});

export const savedAmplifierOutputSchema = z.strictObject({ id: z.string() });
export const requestAmplificationOutputSchema = z.strictObject({
  ok: z.literal(true),
  targetId: z.string(),
  outputPlatformPostId: z.string().nullable(),
});
export const amplificationTargetsOutputSchema = z.strictObject({
  posts: z.array(
    z.strictObject({
      id: z.string(),
      contentPostId: z.string().nullable(),
      platform: z.enum(channelPlatformEnum.enumValues),
      title: z.string().nullable(),
      scheduledAt: z.string().nullable(),
    }),
  ),
  targets: z.array(
    z.strictObject({
      id: z.string(),
      platformPostId: z.string(),
      amplifierId: z.string(),
      destinationPlatform: z.string(),
      actionKind: z.string(),
      ask: z.string(),
      draftText: z.string().nullable(),
      notes: z.string().nullable(),
      plannedAt: z.string().nullable(),
      outputPlatformPostId: z.string().nullable(),
      outputStatus: z.enum(contentStatusEnum.enumValues).nullable(),
      fulfilledByPostId: z.string().nullable(),
      slackStatus: z.string().nullable(),
      amplifier: z.strictObject({
        id: z.string(),
        name: z.string(),
        type: z.string().nullable(),
        linkedBrandId: z.string().nullable(),
        handoffPreference: z.enum(["manual", "slack"]),
        slackUserId: z.string().nullable(),
        handles: z.array(
          z.strictObject({ platform: z.string(), handle: z.string() }),
        ),
      }),
    }),
  ),
});

export const notifyAmplificationOutputSchema = z.union([
  z.strictObject({
    channel: z.string().nullable(),
    messageTs: z.string(),
    status: z.literal("already_sent"),
  }),
  z.strictObject({
    channel: z.string(),
    messageTs: z.string(),
    notifiedAt: z.iso.datetime(),
    status: z.literal("sent"),
  }),
]);

/** Native service result; the existing wire contract validates its JSON projection. */
export const notifyAmplificationNativeResultSchema = z.union([
  notifyAmplificationOutputSchema.options[0],
  notifyAmplificationOutputSchema.options[1].extend({ notifiedAt: z.date() }),
]);
