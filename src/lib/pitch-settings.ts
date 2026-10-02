import { z } from "zod";

const hostedUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((value) => /^https:\/\//i.test(value), "Use a hosted HTTPS URL");
const optionalUrl = hostedUrl.or(z.literal(""));
/** Deliberately public presentation only: no CRM contacts, private notes or billing. */
export const pitchFieldsSchema = z.object({
  brandName: z.string().trim().max(160).default(""),
  pageHeadline: z.string().trim().max(240).default(""),
  pageSubtitle: z.string().trim().max(600).default(""),
  headline: z.string().trim().max(240).default(""),
  caption: z.string().trim().max(1500).default(""),
  location: z.string().trim().max(160).default(""),
  managementFeeDollars: z
    .number()
    .int()
    .min(0)
    .max(100000)
    .nullable()
    .default(null),
  logoUrl: optionalUrl.default(""),
  iconUrl: optionalUrl.default(""),
  imageUrls: z.array(hostedUrl).max(3).default([]),
  selectedHomeUrls: z.array(hostedUrl).max(30).default([]),
  heroMedia: z
    .object({ url: hostedUrl, kind: z.enum(["image", "video"]) })
    .nullable()
    .default(null),
});
export const pitchSettingsSchema = pitchFieldsSchema.extend({
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});
export type PitchFields = z.infer<typeof pitchFieldsSchema>;
export type PitchSettings = z.infer<typeof pitchSettingsSchema>;
export const EMPTY_PITCH: PitchFields = pitchFieldsSchema.parse({});

/** Only these fields may cross the gateway to the guessable prospect URL. */
export function publicPitchSettings(settings: PitchSettings | null) {
  return settings
    ? { ...pitchFieldsSchema.parse(settings), revision: settings.revision }
    : null;
}

/** Match canonical home URLs, tolerating a site's trailing slash. */
export function selectPitchHomes<T extends { url: string }>(
  homes: T[],
  selected: string[],
) {
  if (!selected.length) return homes;
  const normalize = (url: string) => url.replace(/\/+$/, "");
  const urls = new Set(selected.map(normalize));
  return homes.filter((home) => urls.has(normalize(home.url)));
}

/** Live standard defaults are code configuration, not per-brand JSONB overrides. */
export const STANDARD_PITCH_DEFAULTS = {
  pageHeadline: "Our marketing machine, now yours",
  pageSubtitle:
    "More bookings, zero work. The engine behind $100M+ in Wander bookings, now pointed at your direct booking site.",
  headline: "A stay worth talking about",
  caption:
    "Now featured on Wander. Inspected, verified, and bookable by 680,000+ travelers.",
  managementFeeDollars: 2500,
};

/** Sparse storage: an absent key inherits current brand/standard defaults. */
export const pitchOverridesSchema = z.object({
  brandName: pitchFieldsSchema.shape.brandName.removeDefault().optional(),
  pageHeadline: pitchFieldsSchema.shape.pageHeadline.removeDefault().optional(),
  pageSubtitle: pitchFieldsSchema.shape.pageSubtitle.removeDefault().optional(),
  headline: pitchFieldsSchema.shape.headline.removeDefault().optional(),
  caption: pitchFieldsSchema.shape.caption.removeDefault().optional(),
  location: pitchFieldsSchema.shape.location.removeDefault().optional(),
  managementFeeDollars: pitchFieldsSchema.shape.managementFeeDollars
    .removeDefault()
    .optional(),
  logoUrl: pitchFieldsSchema.shape.logoUrl.removeDefault().optional(),
  iconUrl: pitchFieldsSchema.shape.iconUrl.removeDefault().optional(),
  imageUrls: pitchFieldsSchema.shape.imageUrls.removeDefault().optional(),
  selectedHomeUrls: pitchFieldsSchema.shape.selectedHomeUrls
    .removeDefault()
    .optional(),
  heroMedia: pitchFieldsSchema.shape.heroMedia.removeDefault().optional(),
});
export type PitchOverrides = z.infer<typeof pitchOverridesSchema>;
export function pitchOverrides(fields: PitchFields): PitchOverrides {
  return pitchOverridesSchema.parse(
    Object.fromEntries(
      Object.entries(fields).filter(
        ([, value]) =>
          value !== "" &&
          value !== null &&
          (!Array.isArray(value) || value.length > 0),
      ),
    ),
  );
}

/** Resolve presentation in Growth, once, for the workspace and public renderer. */
export function resolvePitchFields(
  fields: PitchFields,
  brand: { name: string; logo: string | null; icon?: string | null },
  location = "",
): PitchFields {
  return {
    ...fields,
    brandName: fields.brandName || brand.name,
    pageHeadline: fields.pageHeadline || STANDARD_PITCH_DEFAULTS.pageHeadline,
    pageSubtitle: fields.pageSubtitle || STANDARD_PITCH_DEFAULTS.pageSubtitle,
    headline: fields.headline || STANDARD_PITCH_DEFAULTS.headline,
    caption: fields.caption || STANDARD_PITCH_DEFAULTS.caption,
    logoUrl: fields.logoUrl || brand.logo || "",
    iconUrl: fields.iconUrl || brand.icon || fields.logoUrl || brand.logo || "",
    location: fields.location || location,
    managementFeeDollars:
      fields.managementFeeDollars ??
      STANDARD_PITCH_DEFAULTS.managementFeeDollars,
  };
}
