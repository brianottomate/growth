import { z } from "zod";

/** Executable locations. Evidence and city-to-state reasoning belong in prose. */
export const deliveryGeographySchema = z.strictObject({
  countries: z
    .array(z.string().trim().length(2).toUpperCase())
    .max(20)
    .optional(),
  states: z.array(z.string().trim().length(2).toUpperCase()).max(60).optional(),
  regions: z.array(z.string().trim().min(1).max(100)).max(60).optional(),
  cities: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
});
const targetingSchema = z
  .strictObject({
    geography: deliveryGeographySchema.nullable().optional(),
    ageMin: z.number().int().min(13).max(100).nullable().optional(),
    ageMax: z.number().int().min(13).max(100).nullable().optional(),
  })
  .refine(
    (t) => t.ageMin == null || t.ageMax == null || t.ageMin <= t.ageMax,
    "Minimum age exceeds maximum age",
  );
const terms = z.array(z.string().trim().min(1).max(200)).max(200);
export const deliveryGroupConfigurationSchema = z.discriminatedUnion(
  "platform",
  [
    z.strictObject({
      platform: z.literal("meta_ads"),
      targeting: targetingSchema.optional(),
    }),
    z.strictObject({
      platform: z.literal("google_ads"),
      keywords: terms.optional(),
      excludedKeywords: terms.optional(),
    }),
    z.strictObject({
      platform: z.literal("linkedin_ads"),
      targeting: targetingSchema.optional(),
    }),
    // Other platforms retain native snapshots; executable support is added explicitly.
    z.strictObject({ platform: z.literal("reddit_ads") }),
    z.strictObject({ platform: z.literal("openai_ads") }),
    z.strictObject({ platform: z.literal("x_ads") }),
    z.strictObject({ platform: z.literal("tiktok_ads") }),
    z.strictObject({ platform: z.literal("pinterest_ads") }),
  ],
);
export type DeliveryGroupConfiguration = z.infer<
  typeof deliveryGroupConfigurationSchema
>;

export function hasDeliveryLocations(
  geography?: z.infer<typeof deliveryGeographySchema> | null,
) {
  return Boolean(
    geography &&
    [
      geography.countries,
      geography.states,
      geography.regions,
      geography.cities,
    ].some((values) => values?.length),
  );
}
