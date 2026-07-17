import { z } from "zod";

export const audienceProfileScopeSchema = z.enum([
  "core",
  "segment",
  "experimental",
]);
export type AudienceProfileScope = z.infer<typeof audienceProfileScopeSchema>;

export const audienceMarketSideSchema = z.enum([
  "consumer",
  "professional",
  "business",
  "partner",
]);
export type AudienceMarketSide = z.infer<typeof audienceMarketSideSchema>;

export const audienceResearchMaturitySchema = z.enum([
  "hypothesis",
  "researched",
  "validated",
]);
export type AudienceResearchMaturity = z.infer<
  typeof audienceResearchMaturitySchema
>;

export const audienceGeoLocationSchema = z.object({
  name: z.string().min(1).max(200),
  level: z
    .enum([
      "country",
      "region",
      "metro",
      "city",
      "postal_code",
      "radius",
      "market",
    ])
    .default("market"),
  countryCode: z.string().length(2).toUpperCase().optional(),
  regionCode: z.string().max(20).optional(),
  platformKey: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().optional(),
});
export type AudienceGeoLocation = z.infer<typeof audienceGeoLocationSchema>;

/**
 * A global profile is intentionally distinct from an unresearched profile.
 * `null` means geography has not been established; `{ mode: "global" }` means
 * the audience is genuinely global. Specific scopes may include and exclude
 * named places while retaining platform keys for later activation mapping.
 */
export const audienceGeographySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("global"),
    exclude: z.array(audienceGeoLocationSchema).default([]),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    mode: z.literal("specific"),
    include: z.array(audienceGeoLocationSchema).min(1),
    exclude: z.array(audienceGeoLocationSchema).default([]),
    notes: z.string().max(2000).optional(),
  }),
]);
export type AudienceGeography = z.infer<typeof audienceGeographySchema>;

/** Descriptive audience context. This is never automatically ad targeting. */
export const audienceDemographicsSchema = z.object({
  ageRange: z
    .object({
      min: z.number().int().min(0).max(120).optional(),
      max: z.number().int().min(0).max(120).optional(),
    })
    .refine(
      ({ min, max }) => min == null || max == null || min <= max,
      "Minimum age must be less than or equal to maximum age.",
    )
    .optional(),
  genders: z.array(z.string().min(1).max(100)).max(20).optional(),
  languages: z.array(z.string().min(1).max(100)).max(50).optional(),
  lifeStages: z.array(z.string().min(1).max(200)).max(50).optional(),
  occupations: z.array(z.string().min(1).max(200)).max(50).optional(),
  education: z.array(z.string().min(1).max(200)).max(50).optional(),
  household: z.array(z.string().min(1).max(200)).max(50).optional(),
  income: z
    .object({
      min: z.number().nonnegative().optional(),
      max: z.number().nonnegative().optional(),
      currency: z.string().length(3).toUpperCase().default("USD"),
    })
    .refine(
      ({ min, max }) => min == null || max == null || min <= max,
      "Minimum income must be less than or equal to maximum income.",
    )
    .optional(),
  notes: z.string().max(3000).optional(),
});
export type AudienceDemographics = z.infer<typeof audienceDemographicsSchema>;

export const audienceContextSchema = z.object({
  jobsToBeDone: z.array(z.string().min(1).max(500)).max(30).default([]),
  pains: z.array(z.string().min(1).max(500)).max(30).default([]),
  desiredOutcomes: z.array(z.string().min(1).max(500)).max(30).default([]),
  triggers: z.array(z.string().min(1).max(500)).max(30).default([]),
  objections: z.array(z.string().min(1).max(500)).max(30).default([]),
  qualificationSignals: z.array(z.string().min(1).max(500)).max(30).default([]),
  exclusions: z.array(z.string().min(1).max(500)).max(30).default([]),
  messagingAngles: z.array(z.string().min(1).max(500)).max(30).default([]),
  tags: z.array(z.string().min(1).max(100)).max(50).default([]),
});
export type AudienceContext = z.infer<typeof audienceContextSchema>;

/**
 * Where an audience comes from — its provenance. This is what makes retargeting
 * and hyper-segmentation first-class rather than implied by campaign names:
 * - `pixel_event`   — logged-out retargeting: built from pixel/site events
 *                     (e.g. viewed a property, no booking). Rule lives on-platform.
 * - `customer_list` — logged-in retargeting: a hashed user list we upload
 *                     ("targeted user list upload"). First-party.
 * - `amplitude_cohort` — a behavioural/geo/temporal cohort synced from Amplitude
 *                     (the hyper-segmentation path: "NW → CA in summer").
 * - `lookalike_seed`— a lookalike modelled off a seed audience.
 * - `manual`        — hand-authored ICP with no automated source.
 */
export const audienceSourceSchema = z.enum([
  "manual",
  "pixel_event",
  "customer_list",
  "amplitude_cohort",
  "lookalike_seed",
]);
export type AudienceSource = z.infer<typeof audienceSourceSchema>;

/**
 * When an audience is *worth reaching*, for seasonal/temporal intent —
 * "NW travellers book CA around late spring for summer stays". `seasonal`
 * repeats every year (month range); `date_range` is a one-off flight. This is
 * intent (strategy), not the campaign schedule — the alignment diff can flag
 * "declared for summer, no campaign flighted in that window".
 */
export const audienceActiveWindowSchema = z
  .object({
    kind: z.enum(["seasonal", "date_range"]).default("seasonal"),
    // seasonal: 1-12 inclusive, may wrap (e.g. 11 → 2 = Nov–Feb).
    startMonth: z.number().int().min(1).max(12).optional(),
    endMonth: z.number().int().min(1).max(12).optional(),
    // date_range: ISO date strings.
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (w) =>
      w.kind === "seasonal"
        ? w.startMonth != null && w.endMonth != null
        : w.startDate != null && w.endDate != null,
    "Seasonal windows need start/end months; date_range windows need start/end dates.",
  );
export type AudienceActiveWindow = z.infer<typeof audienceActiveWindowSchema>;

export const audienceActivationGeoModeSchema = z.enum([
  "inherit",
  "narrow",
  "replace",
]);
export const audienceActivationDemographicModeSchema = z.enum([
  "none",
  "inherit_descriptive",
  "override",
]);

export const audienceEvidenceInputSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().max(500).optional(),
  claim: z.string().min(1).max(2000),
  sourceType: z
    .enum(["research", "customer", "analytics", "operator", "inference"])
    .default("research"),
});
export type AudienceEvidenceInput = z.infer<typeof audienceEvidenceInputSchema>;

export function audienceSlug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 160) || "audience"
  );
}
