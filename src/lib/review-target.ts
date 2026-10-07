import { z } from "zod";

export const reviewTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ad"), id: z.string().min(1) }),
  z.strictObject({ type: z.literal("content"), id: z.string().min(1) }),
  z.strictObject({
    type: z.literal("catalog"),
    id: z.string().min(1),
    brandId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required for a WanderOS listing ID. Omit only for an internal Growth home ID.",
      ),
  }),
]);
export type ReviewTarget = z.infer<typeof reviewTargetSchema>;
