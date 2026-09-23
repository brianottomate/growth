import { campaignStatusEnum } from "@/server/db/ads-schema";
import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const diagnoseAlignmentOutputSchema = z.strictObject({
  diagnosis: z.strictObject({
    findings: z.array(
      z.strictObject({
        area: z.enum([
          "budget",
          "audience",
          "channel-coverage",
          "dates",
          "linkage",
        ]),
        entity: z.string(),
        finding: z.string(),
        severity: z.enum(["high", "medium", "low"]),
        suggestedUpdate: z.string(),
      }),
    ),
    summary: z.string(),
  }),
  grounding: z.strictObject({
    campaigns: z.array(
      z.strictObject({
        budgetUtilization: z.number().optional(),
        campaignId: z.string(),
        inactiveChannels: z.array(z.string()),
        missingChannels: z.array(z.string()),
        name: z.string(),
        overIntended: z.boolean(),
        status: z.enum(campaignStatusEnum.enumValues),
        suggestionCount: z.number(),
      }),
    ),
  }),
});
