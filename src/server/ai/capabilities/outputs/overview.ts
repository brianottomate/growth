import { contentStatusEnum } from "@/server/db/content-schema";
import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const workspaceOverviewOutputSchema = z.strictObject({
  action: z.literal("overview"),
  data: z.strictObject({
    brands: z.number(),
    content: z.strictObject({
      byStatus: z.union([
        z.array(z.never()),
        z.array(
          z.strictObject({
            count: z.number(),
            status: z.enum(contentStatusEnum.enumValues),
          }),
        ),
      ]),
      needsAttention: z.number(),
      total: z.number(),
    }),
    engageWorthyMentions: z.number(),
    leads: z.strictObject({
      contacts: z.number(),
      domains: z.number().optional(),
      inInstantly: z.number().optional(),
      netNew: z.number(),
    }),
  }),
  ok: z.literal(true),
});
