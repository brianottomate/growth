import { z } from "zod";
import { lifecycleConditionSchema } from "./lifecycle-runtime";

export const emailSequenceDraftSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  triggerEvent: z.string().trim().min(1).max(100),
  exitCondition: lifecycleConditionSchema.nullable().default(null),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        platformPostId: z.string().min(1).nullable(),
        name: z.string().trim().min(1).max(160),
        waitMinutes: z.number().int().min(0).max(525600),
      }),
    )
    .max(50)
    .refine(
      (steps) => new Set(steps.map((s) => s.id)).size === steps.length,
      "Step IDs must be unique",
    )
    .refine(
      (steps) => steps.reduce((sum, s) => sum + s.waitMinutes, 0) <= 525600,
      "Sequence duration must be at most one year",
    ),
});
export type EmailSequenceDraft = z.infer<typeof emailSequenceDraftSchema>;
