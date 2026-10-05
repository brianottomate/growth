import { z } from "zod";
import { campaignStatusEnum } from "@/server/db/ads-schema";

/** Shared service/tool contracts. Implementations return these schema-derived types. */
const byDestinationItemSchema = z.strictObject({
  ads: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  engagement: z.number(),
  impressions: z.number(),
  key: z.string(),
  spend: z.number(),
});

export const adsScopeOutputSchema = z.strictObject({
  account: z.strictObject({
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  brand: z.strictObject({ id: z.string(), name: z.string(), slug: z.string() }),
  byDestination: z.array(byDestinationItemSchema),
  byMonth: z.array(
    z.strictObject({
      ads: z.number(),
      clicks: z.number(),
      impressions: z.number(),
      month: z.string(),
      spend: z.number(),
    }),
  ),
  byObjective: z.array(byDestinationItemSchema),
  flags: z.strictObject({ hasAuditAds: z.boolean(), hasOsAds: z.boolean() }),
  totals: z.strictObject({
    ads: z.number(),
    allAds: z.number(),
    clicks: z.number(),
    conversions: z.number(),
    ctr: z.number(),
    engagement: z.number(),
    impressions: z.number(),
    spend: z.number(),
  }),
  window: z.strictObject({ fromDate: z.string(), toDate: z.string() }),
});

export const previewAdActionOutputSchema = z.strictObject({
  adId: z.string(),
  adName: z.string(),
  formats: z.array(z.string()),
  previews: z.array(
    z.strictObject({ iframe: z.string(), src: z.string().nullable() }),
  ),
  previewUrls: z.array(z.string()),
});

export const listCampaignsActionOutputSchema = z.array(
  z.strictObject({
    id: z.string(),
    name: z.string(),
    status: z.enum(campaignStatusEnum.enumValues),
  }),
);

export type AdsScopeResult = z.output<typeof adsScopeOutputSchema>;
export type DraftAdPreviewResult = z.output<typeof previewAdActionOutputSchema>;
export type CampaignListResult = z.output<
  typeof listCampaignsActionOutputSchema
>;
