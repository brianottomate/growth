import { channelPlatformEnum } from "@/server/db/channel-schema";
import { z } from "zod";

const platformSchema = z.enum(channelPlatformEnum.enumValues);

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const inspectConversionRealityOutputSchema = z.strictObject({
  events: z.array(
    z.strictObject({
      brandId: z.string(),
      canonicalEvent: z.string().nullable(),
      createdAt: z.iso.datetime(),
      description: z.string().nullable(),
      funnel: z.enum(["supply", "demand"]),
      id: z.string(),
      isPrimary: z.boolean(),
      name: z.string(),
      sources: z.array(
        z.strictObject({
          conversionEventId: z.string(),
          mappingId: z.string(),
        }),
      ),
      stage: z.number(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  findings: z.array(
    z.strictObject({
      entityIds: z.array(z.string()),
      finding: z.string(),
      kind: z.enum([
        "not_implemented",
        "delete_label",
        "duplicate_external_id",
        "duplicate_name",
        "missing_primary_mapping",
        "unverified",
      ]),
      platform: z.string().optional(),
      recommendedAction: z.string(),
      severity: z.enum(["high", "medium", "low"]),
    }),
  ),
  mappings: z.array(
    z.strictObject({
      brandId: z.string(),
      channelId: z.string().nullable(),
      channel: z
        .strictObject({
          externalId: z.string().nullable(),
          manageUrl: z.string().nullable(),
          platform: platformSchema,
        })
        .nullable(),
      sources: z.array(
        z.strictObject({
          conversionEventId: z.string(),
          mappingId: z.string(),
        }),
      ),
      adAccountId: z.string().nullable(),
      createdAt: z.iso.datetime(),
      externalConversionId: z.string().nullable(),
      externalResourceName: z.string().nullable(),
      id: z.string(),
      lastCheckedAt: z.iso.datetime().nullable(),
      mode: z.enum(["every", "once"]).nullable(),
      notes: z.string().nullable(),
      platform: platformSchema,
      platformEventName: z.string(),
      status: z.enum(["verified", "wanted", "not_implemented"]),
      updatedAt: z.iso.datetime(),
    }),
  ),
});
