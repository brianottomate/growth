import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const prepareProductionPacketOutputSchema = z.strictObject({
  action: z.literal("prepare"),
  data: z.strictObject({
    aspectRatio: z.string().nullable(),
    brandId: z.string(),
    contentPostId: z.string().nullable(),
    copyText: z.string(),
    instructions: z.string().nullable(),
    negativePrompt: z.string().nullable(),
    outputFormat: z.string().nullable(),
    packetId: z.string(),
    prompt: z.string(),
    purpose: z.string().nullable(),
    suggestedTool: z.string().nullable(),
    title: z.string(),
  }),
  ok: z.literal(true),
});
