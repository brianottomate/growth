import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const listAmplifiersOutputSchema = z.union([
  z.strictObject({ amplifiers: z.array(z.never()), note: z.string() }),
  z.strictObject({
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
        notes: z.string().nullable(),
        slackUserId: z.string().nullable(),
        type: z.string().nullable(),
      }),
    ),
  }),
]);

export const requestAmplificationOutputSchema = z.strictObject({
  ok: z.literal(true),
  platformPostId: z.string(),
  results: z.array(
    z.strictObject({
      amplifier: z.string(),
      mintedRepostId: z.string().nullable(),
      mode: z.enum(["owned", "ask"]),
      target: z.string(),
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
