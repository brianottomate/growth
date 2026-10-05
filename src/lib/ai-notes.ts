import { z } from "zod";

export const aiFindingSchema = z.object({
  action: z.enum(["check_image", "consider_excluding", "check_details"]),
  reason: z.string().min(1).max(350),
});
export const catalogAiReviewSchema = z.object({
  reviewedAt: z.string(),
  fingerprint: z.string(),
  findings: z.array(aiFindingSchema).max(3),
});
export type AiNotes = { catalog?: z.infer<typeof catalogAiReviewSchema> };
