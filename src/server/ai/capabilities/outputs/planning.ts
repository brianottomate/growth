import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const mixItemSchema = z.strictObject({
  isOverride: z.boolean(),
  pillars: z.array(z.strictObject({ pct: z.number(), pillar: z.string() })),
  platform: z.string(),
});

export const previewTwoWeekSlotsOutputSchema = z.strictObject({
  created: z.number(),
  interpretation: z.string(),
  mix: z.array(mixItemSchema),
  next: z.string(),
  slots: z.array(
    z.strictObject({
      archetype: z.string(),
      authoredCadence: z.string(),
      existingInWindow: z.number(),
      missingInWindow: z.number(),
      platform: z.string(),
      targetInWindow: z.number(),
    }),
  ),
  unconfiguredChannels: z.array(
    z.strictObject({
      channelId: z.string(),
      handle: z.string().nullable(),
      platform: z.string(),
    }),
  ),
  unconfiguredMixChannels: z.array(
    z.strictObject({
      channelId: z.string(),
      handle: z.string().nullable(),
      platform: z.string(),
    }),
  ),
  window: z.strictObject({ end: z.string(), start: z.string() }),
});

export const generateTwoWeekSlotsOutputSchema = z.strictObject({
  action: z.literal("saved"),
  created: z.number(),
  mix: z.array(mixItemSchema),
  scheduleUrl: z.string(),
  slots: z.array(
    z.strictObject({
      archetype: z.string(),
      authoredCadence: z.string(),
      createdInWindow: z.number(),
      existingInWindow: z.number(),
      platform: z.string(),
      targetInWindow: z.number(),
    }),
  ),
  unconfiguredChannels: z.array(
    z.strictObject({
      channelId: z.string(),
      handle: z.string().nullable(),
      platform: z.string(),
    }),
  ),
  unconfiguredMixChannels: z.array(
    z.strictObject({
      channelId: z.string(),
      handle: z.string().nullable(),
      platform: z.string(),
    }),
  ),
  window: z.strictObject({ end: z.string(), start: z.string() }),
});
