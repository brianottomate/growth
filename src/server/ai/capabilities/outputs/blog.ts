import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const blogAgentOutputSchema = z.strictObject({
  action: z.literal("run"),
  data: z.strictObject({
    report: z.string(),
    steps: z.number(),
    trail: z.array(z.strictObject({ summary: z.string(), tool: z.string() })),
  }),
  ok: z.boolean(),
});
