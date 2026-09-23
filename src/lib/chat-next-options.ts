import { z } from "zod";
export const chatNextOptionsSchema = z.object({
  action: z.literal("present").default("present"),
  options: z
    .array(
      z.object({
        kind: z.enum(["answer", "request", "detail"]),
        label: z.string().trim().min(1).max(48),
        text: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(3),
});
export type ChatNextOption = z.infer<
  typeof chatNextOptionsSchema
>["options"][number];
export const chatNextOptionsOutputSchema = z.object({
  ok: z.literal(true),
  action: z.literal("present"),
  data: z.object({ options: chatNextOptionsSchema.shape.options }),
});
