# Brand-kit evaluation (verbatim port material)

Source: `wander/src/wos-saas/module/src/logic/website/site-editor/evaluate-homepage/` plus schema definitions from `wander/src/wos-saas/schemas/src/defs/`. Read 2026-08-03.

## Orchestrator — `evaluate-homepage/index.ts` (33 lines, verbatim)

```typescript
import { SiteEditorEvaluatedBrandKit } from '@wos/saas-schemas/workflow';
import logger from '../../../../utils/logger';
import { extractBranding } from './extract-branding';
import { extractBusinessContext, type ExtractBusinessContextInput } from './extract-business-context';

export const runEvaluateHomepage = async (input: ExtractBusinessContextInput): Promise<SiteEditorEvaluatedBrandKit> => {
  const [businessContext, legacySiteBranding] = await Promise.all([
    extractBusinessContext(input),
    extractBranding(input.existingSiteUrl),
  ]);
  const locationContext = businessContext.locationContext;

  const evaluation = SiteEditorEvaluatedBrandKit.parse({
    businessName: businessContext.businessName,
    locations: locationContext.guestFacingLocation ? [locationContext.guestFacingLocation] : [],
    locationContext,
    propertyTypes: [businessContext.propertyType],
    inventoryMode: businessContext.inventoryMode,
    voiceBrief: businessContext.voiceBrief,
    legacySiteBranding,
  });

  logger.info('[SiteEditor] Evaluated homepage', {
    existingSiteUrl: input.existingSiteUrl,
    businessName: evaluation.businessName,
    locations: evaluation.locations,
    propertyTypes: evaluation.propertyTypes,
    inventoryMode: evaluation.inventoryMode,
    hasLegacySiteBranding: Boolean(evaluation.legacySiteBranding),
  });

  return evaluation;
};
```

## `evaluate-homepage/extract-business-context.ts` (152 lines, verbatim — the Haiku prompt + Zod schema)

```typescript
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { anthropicClaude45Haiku } from '@wos/ai-systems';
import {
  BrandKitInventoryModeSchema,
  BrandKitLocationContextSchema,
  BrandKitTone,
  BrandKitVoiceBriefSchema,
  SiteEditorExistingSitePage,
} from '@wos/saas-schemas';
import { HOMEPAGE_SOURCE_FILTER } from '../generate-copy/prompt';
import { normalizeLocationContext } from './location-context';

const BusinessContextOutput = z.object({
  businessName: z.string().describe('The name of the business or brand'),
  locationContext: BrandKitLocationContextSchema.describe(
    'The guest-facing location context of the property/properties, including source provenance'
  ),
  locationEvidence: z
    .string()
    .describe('A short source-grounding note supporting guestFacingLocation, or an empty string when unknown'),
  propertyType: z.string().describe('The type of property/properties, e.g. beachhouse, villa, apartment etc'),
  inventoryMode: BrandKitInventoryModeSchema.describe(
    'The inventory mode of the business, e.g. single property, multi-home regional, multi-home global'
  ),
  voiceBrief: BrandKitVoiceBriefSchema.describe(
    'Three sample phrases that define the voice for the entire site. Every page should match this register.'
  ),
});

type BusinessContext = z.infer<typeof BusinessContextOutput>;

export type ExtractBusinessContextInput = {
  existingSiteUrl: string;
  existingSitePage: NonNullable<SiteEditorExistingSitePage>;
  tone: BrandKitTone;
};

const SOURCE_CHAR_LIMIT = 5_000;

export const extractBusinessContext = async (input: ExtractBusinessContextInput): Promise<BusinessContext> => {
  const { output } = await generateText({
    model: anthropicClaude45Haiku(),
    output: Output.object({ schema: BusinessContextOutput }),
    temperature: 0,
    system: buildEvaluateHomepagePrompt(input.tone),
    messages: [
      {
        role: 'user',
        content: buildUserMessage(input),
      },
    ],
  });

  const locationContext = normalizeLocationContext(output.locationContext, input.existingSitePage);

  return {
    ...output,
    locationContext,
    locationEvidence: locationContext.guestFacingLocation ? output.locationEvidence : '',
  };
};

export const buildEvaluateHomepagePrompt = (tone: BrandKitTone) => {
  const voiceBriefSection = tone === 'existing' ? VOICE_BRIEF_EXISTING_SECTION : buildVoiceBriefPrescribedSection(tone);

  return `
We are Wander, a company offering a white-labelled luxury vacation rentals SaaS platform.

Property managers who are interested in our service provide the URL of their site, which we have crawled.

Your task is to take the homepage markdown and determine:

- businessName - The name of the business or brand. This is NOT the H1 tagline — look for the actual brand name, which is often visible in the domain name or logo text.
- locationContext - Determine the guest-facing location context of the property/properties.
  - guestFacingLocation - The safest phrase that generated copy can use for where guests understand the homes to be. Preserve relational qualifiers including "near", "outside", "north of", "minutes from", or "at the entrance of" when the source uses them. Do not add a qualifier that the source did not support. Prefer a concise destination phrase like "near Grand Canyon South Rim" over an exact distance when both are supported, unless the distance itself is the source's primary location identity. Examples: "near Grand Canyon South Rim", "outside Asheville", "north of Williams".
  - destination - Optional unqualified destination, region, city, or landmark explicitly named by the source when useful. Use the most specific explicit source name available; do not broaden "Grand Canyon South Rim" to "Grand Canyon". This is not a license to drop qualifiers from guestFacingLocation.
  - mailingAddressLocation - Optional mailing, office, headquarters, or legal address location exposed by the source.
  - sourceOfTruth - Which evidence source drove guestFacingLocation.
  - confidence - Your confidence in guestFacingLocation.
  - locationEvidence - A short source-grounding note that identifies the wording supporting guestFacingLocation. Prefer an exact excerpt when one is concise. Do not invent support. Return an empty string when guestFacingLocation is empty or unknown.

  Evidence priority, highest to lowest:
  1. Explicit guest-facing property copy.
  2. Explicit proximity or disclaimer copy including "near X", "north of Y", "19 miles from Z", or "our mailing address is A but the homes are near B".
  3. Property-specific addresses or listing locations.
  4. Mailing address, office address, headquarters, contact-page map pin, phone area code, or inferred business location.

  If guest-facing copy contradicts a mailing or office address, trust the guest-facing copy. Vacation-rental managers often operate from one office while hosting homes elsewhere. Never frontload a mailing-address city in guest copy when the source says the properties are near a different destination. Do not infer a location from the domain name, brand name, logo text, URL, world knowledge, or a generic neighborhood label like "Downtown", "Old Town", or "Historic District" unless separate source copy explicitly names the city or region too. A descriptive page title like "Savannah Apartments & Vacation Rentals" may support a market; a brand-only title like "Brand 30A" does not. Do not promote one listing's proximity line into the whole site's market when broader source copy names the brand's market. If no safe guest-facing location can be determined, return an empty guestFacingLocation, sourceOfTruth "unknown", confidence "low", and locationEvidence "" rather than guessing.
- propertyType - The type of property/properties, e.g. beachhouse, villa, apartment etc. If multiple, provide the most common property type, or a general descriptor (e.g. luxury rentals).
- inventoryMode - How many properties the business manages:
  - single_property: exactly one property
  - multi_home_regional: multiple properties in one area
  - multi_home_global: properties across different regions/countries
${voiceBriefSection}

${HOMEPAGE_SOURCE_FILTER}
`;
};

const buildVoiceBriefPrescribedSection = (
  tone: BrandKitTone
) => `- voiceBrief - Three sample phrases that set the voice for the entire site. These phrases will anchor tone and register for every downstream copy model. They must:
  - Match the "${tone}" tone — this is non-negotiable
  - Be specific to THIS brand, location, and property type — not generic hospitality copy
  - Sound like luxury hospitality, not a SaaS product page or travel blog
  - Use concrete details from the homepage (property count, location names, specific amenities)

  The heroTitle should be 3-8 words, the heroSubtitle should be one sentence with a specific claim only this brand can make, and the ctaText should be 2-4 words.

  BAD voice brief (generic, could describe any vacation rental):
    heroTitle: "Experience Luxury Living"
    heroSubtitle: "Discover unforgettable stays in beautiful destinations."
    ctaText: "Learn More"

  GOOD voice brief (specific, grounded in brand facts):
    heroTitle: "Your Mountain Home Awaits"
    heroSubtitle: "Thirty homes across Teton Valley, each one a front-row seat to the range."
    ctaText: "Find Your Stay"`;

const VOICE_BRIEF_EXISTING_SECTION = `- voiceBrief - Three sample phrases that set the voice for the entire site, extracted VERBATIM from the source homepage. The user has chosen to preserve their existing voice, so this brief becomes the north star showing every downstream model the source's exact register and phrasing.

  Apply the homepage content filter below to every candidate phrase BEFORE picking it — any B2B/owner-recruitment language ("Leading Property Management Firm", "Maximize Your Rental Income", "Tenant Screening", "Owner Portal", etc.) is OFF-LIMITS for this brief, even if it's the most prominent text on the page. Skip past it to the most prominent GUEST-FACING line. PMS customers routinely use a B2B eyebrow for their first piece of prose; it is never the right voice anchor for a luxury-rental homepage.

  Extraction rules:
  - heroTitle: preserve the source's visual homepage hero, not merely the first traveler-facing marketing sentence. A standalone heading or prominent line near the top that matches the business name or logo text is a valid hero and takes precedence over later supporting headlines. Return a brand-name-only hero using the canonical businessName capitalization. Do not skip it merely because it does not address travelers. Otherwise, use the most prominent GUEST-FACING headline. If it exceeds 8 words, use the first natural clause; do not paraphrase.
  - Direct-booking benefit headings ("Book direct...", "Why book direct...", "Booking directly...") are supporting section headings, not homepage hero candidates, when a brand-name or other visual hero appears earlier.
  - heroSubtitle: use the guest-facing supporting line associated with the selected hero. For a brand-name-only hero, this may be the nearest descriptive line immediately before or after it. Do not pair it with copy from a later supporting section. Use it verbatim, trimmed only at sentence boundaries.
  - ctaText: the most prominent guest-facing call-to-action button label on the source. Use the exact words (e.g. "Book Your Stay", "Browse Homes", "Plan a Visit"). Owner-recruitment CTAs ("List Your Property", "Become a Partner", "Get a Proposal") do not count.

  If the source has no clear guest-facing hero/subheadline/CTA — every prominent line is B2B — return an empty string for that field rather than picking an owner-facing line. Downstream copy generation will fall back to brand framing when a field is empty; that is correct behavior.
  Do NOT rewrite or "improve" the source's wording — even if it's awkward, it's what the customer chose to preserve.`;

/**
 * Assembles the user message with title and meta description above the markdown body.
 */
const buildUserMessage = (input: ExtractBusinessContextInput): string => {
  const { existingSiteUrl, existingSitePage } = input;

  const title = existingSitePage.title?.trim();
  const description = existingSitePage.description?.trim();

  const header = [
    `Here is the homepage of ${existingSiteUrl}. The URL is useful for businessName only; never derive location from it.`,
    title ? `Page title: ${title}` : undefined,
    description ? `Meta description: ${description}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}\n\nMarkdown:\n\n${existingSitePage.markdown.slice(0, SOURCE_CHAR_LIMIT)}`;
};
```

Notes: model is `anthropicClaude45Haiku()` at `temperature: 0`; homepage markdown sliced to 5,000 chars; `HOMEPAGE_SOURCE_FILTER` is imported from `generate-copy/prompt.ts` (reproduced in `generate-copy-prompt.md`).

## `evaluate-homepage/extract-branding.ts` — what it extracts (summary + key code)

Firecrawl `scrape(url, { formats: ['branding'], timeout: 15_000 })` wrapped in a 15s `withTimeout`. Skipped entirely when `FIRECRAWL_API_KEY` is unset; any error logs a warning and returns `undefined` (branding is optional). The result's `branding` profile is normalized:

```typescript
const normalizeBranding = ({
  colors = {},
  components: { buttonPrimary = {}, buttonSecondary = {} } = {},
  typography,
  fonts,
}: BrandingProfile): LegacySiteBranding | undefined => {
  const legacySiteBranding = LegacySiteBrandingSchema.parse({
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
    background: colors.background,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    link: colors.link,
    buttonPrimary: buttonPrimary.background,
    buttonSecondary: buttonSecondary.background,
    ...normalizeTypography({ typography, fonts }),
  });

  return Object.values(legacySiteBranding).some(Boolean) ? legacySiteBranding : undefined;
};
```

CSS parts summary: it pulls Firecrawl's detected brand **colors** (primary, secondary, accent, background, textPrimary, textSecondary, link) plus the **primary/secondary button background colors**, and **typography** via `normalizeTypography` (`normalize-typography.ts`): first usable font family for heading (declared heading family, then heading font stack), body (body → paragraph → body stack → paragraph stack → primary), and primary; plus a deduped `fontFamilies` list across all declared families, stacks, and detected fonts. Font values `inherit`/`initial`/`unset` and surrounding quotes are stripped. Returns `undefined` when every field is empty.

## `evaluate-homepage/location-context.ts` (185 lines, verbatim — includes `formatLocationPhrase` used by the copy prompt)

```typescript
import { z } from 'zod';
import { BrandKitLocationContextSchema, SiteEditorExistingSitePage } from '@wos/saas-schemas';

/**
 * We try to infer the location of the property/properties from the site.
 *
 * Originally this was a simple string (e.g. "Malibu, California"), but it turns out it's more
 * complex than that.
 *
 * Often, a site will cover properties in multiple locations. Often, they don't disclose the
 * exact location/address of the property, but do include a business or mailing address (which can
 * be quite far from the actual property, and confuses the model).
 *
 * So, we collect a bunch of extra information about the location context, including the mailing
 * address, confidence etc. That lets downstream models understand the nuance and make better
 * decisions about what to do with the location information.
 */
export const normalizeLocationContext = (
  locationContext: z.infer<typeof BrandKitLocationContextSchema>,
  existingSitePage: NonNullable<SiteEditorExistingSitePage>
) => {
  const normalized = BrandKitLocationContextSchema.parse({
    ...locationContext,
    guestFacingLocation: locationContext.guestFacingLocation.trim(),
    destination: normalizeOptionalLocation(locationContext.destination),
    mailingAddressLocation: normalizeOptionalLocation(locationContext.mailingAddressLocation),
  });

  if (!normalized.guestFacingLocation) {
    return normalized;
  }

  const sourceText = [existingSitePage.title, existingSitePage.description, existingSitePage.markdown]
    .filter(Boolean)
    .join('\n');

  if (!hasSupportedLocationTokens(normalized.guestFacingLocation, sourceText)) {
    return clearUnsupportedGuestFacingLocation(normalized);
  }

  return {
    ...normalized,
    destination:
      normalized.destination && hasSupportedLocationTokens(normalized.destination, sourceText)
        ? normalized.destination
        : undefined,
    mailingAddressLocation:
      normalized.mailingAddressLocation && hasSupportedLocationTokens(normalized.mailingAddressLocation, sourceText)
        ? normalized.mailingAddressLocation
        : undefined,
  };
};

/**
 * `guestFacingLocation` can be a plain destination ("Sun Valley") or a relational phrase
 * ("near Grand Teton", "20 minutes from Jackson Hole"). Generated copy needs a grammatical
 * sentence fragment for both without turning the latter into "in near Grand Teton".
 */
export const formatLocationPhrase = (location: string): string => {
  const normalized = location.trim();

  if (!normalized || startsWithLocationQualifier(normalized)) {
    return normalized;
  }

  return `in ${normalized}`;
};

const normalizeOptionalLocation = (location: string | undefined) => {
  const normalized = location?.trim();
  return normalized || undefined;
};

const clearUnsupportedGuestFacingLocation = (locationContext: z.infer<typeof BrandKitLocationContextSchema>) =>
  BrandKitLocationContextSchema.parse({
    ...locationContext,
    guestFacingLocation: '',
    destination: undefined,
    sourceOfTruth: 'unknown',
    confidence: 'low',
  });

const hasSupportedLocationTokens = (location: string, sourceText: string) => {
  const sourceTokens = new Set(normalizeComparableText(sourceText).split(/\s+/));
  const tokens = normalizeComparableText(location)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !LOCATION_TOKEN_STOP_WORDS.has(token));

  return tokens.length > 0 && tokens.every((token) => sourceTokens.has(token));
};

const normalizeComparableText = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const startsWithLocationQualifier = (location: string): boolean => {
  const normalized = location.toLowerCase();

  if (LOCATION_QUALIFIER_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `))) {
    return true;
  }

  return startsWithDistanceQualifier(normalized);
};

const startsWithDistanceQualifier = (location: string): boolean => {
  const tokens = location.split(/\s+/);
  let index = 0;

  if (isNumericToken(tokens[index])) {
    index += 1;
  }

  if (!LOCATION_DISTANCE_UNITS.has(tokens[index] ?? '')) {
    return false;
  }

  index += 1;
  if (tokens[index] === 'away') {
    index += 1;
  }

  return tokens[index] === 'from';
};

const isNumericToken = (token: string | undefined): boolean => token !== undefined && /^\d+(?:\.\d+)?$/.test(token);

const LOCATION_QUALIFIER_PREFIXES = [
  'near',
  'outside',
  'north of',
  'south of',
  'east of',
  'west of',
  'at the entrance of',
  'around',
  'along',
  'within',
  'on',
  'at',
  'by',
  'across',
  'between',
  'in',
];

const LOCATION_DISTANCE_UNITS = new Set(['mile', 'miles', 'km', 'kilometer', 'kilometers', 'minute', 'minutes']);

const LOCATION_TOKEN_STOP_WORDS = new Set([
  'near',
  'outside',
  'north',
  'south',
  'east',
  'west',
  'from',
  'away',
  'minutes',
  'minute',
  'miles',
  'mile',
  'kilometers',
  'kilometer',
  'entrance',
  'around',
  'along',
  'within',
  'with',
  'the',
  'and',
  'for',
  'into',
  'onto',
  'area',
  'areas',
  'region',
  'regions',
  'city',
  'county',
  'state',
]);
```

## Output shape — schemas package (verbatim)

From `schemas/src/defs/workflow/site-editor.ts`:

```typescript
export const SiteEditorEvaluatedBrandKit = z.object({
  businessName: z.string(),
  locations: z.string().array(),
  locationContext: BrandKitLocationContextSchema.optional(),
  propertyTypes: z.string().array().min(1),
  inventoryMode: BrandKitInventoryModeSchema,
  voiceBrief: BrandKitVoiceBriefSchema,
  legacySiteBranding: LegacySiteBrandingSchema.optional(),
});
export type SiteEditorEvaluatedBrandKit = z.infer<typeof SiteEditorEvaluatedBrandKit>;
```

From `schemas/src/defs/website/brand-kit.ts` (the referenced sub-schemas, verbatim):

```typescript
export const BrandKitToneSchema = z.enum(['warm', 'refined', 'poetic', 'modern', 'existing']);
export type BrandKitTone = z.infer<typeof BrandKitToneSchema>;

export const BrandKitVoiceBriefSchema = z.object({
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  ctaText: z.string(),
});
export type BrandKitVoiceBrief = z.infer<typeof BrandKitVoiceBriefSchema>;

export const BrandKitInventoryModeSchema = z.enum(['single_property', 'multi_home_regional', 'multi_home_global']);
export type BrandKitInventoryMode = z.infer<typeof BrandKitInventoryModeSchema>;

export const BrandKitLocationSourceOfTruthSchema = z.enum([
  'guest_facing_copy',
  'property_location',
  'mailing_address',
  'inferred',
  'unknown',
]);

export const BrandKitLocationConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const BrandKitLocationContextSchema = z.object({
  /**
   * Safe guest-facing phrase to use in generated copy. This intentionally preserves qualifiers
   * such as "near", "outside", or "north of" when the source does not support a direct city claim.
   */
  guestFacingLocation: z.string(),
  /**
   * Optional unqualified destination or landmark named by the source, when useful for search or
   * destination-aware prompts. This is distinct from the safe copy phrase above.
   */
  destination: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  /**
   * The business or mailing address location when the source exposes one. This is retained for
   * provenance, not as the preferred copy location.
   */
  mailingAddressLocation: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  sourceOfTruth: BrandKitLocationSourceOfTruthSchema,
  confidence: BrandKitLocationConfidenceSchema,
});
export type BrandKitLocationContext = z.infer<typeof BrandKitLocationContextSchema>;

export const LegacySiteBrandingSchema = z.object({
  primary: z.string().optional(),
  secondary: z.string().optional(),
  accent: z.string().optional(),
  background: z.string().optional(),
  textPrimary: z.string().optional(),
  textSecondary: z.string().optional(),
  link: z.string().optional(),
  buttonPrimary: z.string().optional(),
  buttonSecondary: z.string().optional(),
  fontPrimary: z.string().optional(),
  fontHeading: z.string().optional(),
  fontBody: z.string().optional(),
  fontFamilies: z.string().array().optional(),
});
export type LegacySiteBranding = z.infer<typeof LegacySiteBrandingSchema>;
```
