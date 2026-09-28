import { z } from "zod";

export const COMPOSITION_FORMATS = [
  {
    id: "landscape",
    label: "Landscape",
    detail: "Links · 1.91:1",
    width: 1200,
    height: 630,
  },
  {
    id: "square",
    label: "Square",
    detail: "Feeds · 1:1",
    width: 1080,
    height: 1080,
  },
  {
    id: "portrait",
    label: "Portrait",
    detail: "Feeds · 4:5",
    width: 1080,
    height: 1350,
  },
  {
    id: "story",
    label: "Story",
    detail: "Stories · 9:16",
    width: 1080,
    height: 1920,
  },
  {
    id: "wide",
    label: "Wide",
    detail: "Video · 16:9",
    width: 1920,
    height: 1080,
  },
  {
    // The newsletter's home photo: Customer.io issues run 1200×800 images,
    // shown at 536px for a featured home and ~116px in a list.
    id: "email",
    label: "Email",
    detail: "Newsletter · 3:2",
    width: 1200,
    height: 800,
  },
] as const;

export const COMPOSITION_TEMPLATES = [
  {
    id: "photo-only",
    version: 1,
    label: "Photo only",
    description:
      "The source image alone, full-bleed. The baseline every other blueprint adds to.",
  },
  {
    id: "tier-badge",
    version: 1,
    label: "Photo · tier badge",
    description:
      "The photo full-bleed with wander.com's Luxury or Iconic pill top left, as the property card draws it. The newsletter home photo.",
  },
  {
    id: "catalog-copy",
    version: 1,
    label: "Catalog · copy",
    description:
      "Logo top left, the home's name and facts over a dark gradient at the foot. The feed card.",
  },
  {
    id: "catalog-place",
    version: 2,
    label: "Catalog · place",
    description:
      "One bold statement, the hook and the place, then the facts and a guest-rating pill over a dark foot gradient. The mark is optional, top left. The listing card.",
  },
  {
    id: "catalog-amenities",
    version: 1,
    label: "Catalog · amenities",
    description:
      "A headline about the space, the facts, then up to three amenity pills over a dark foot gradient. The mark is optional, top left.",
  },
  {
    id: "catalog-amenities-place",
    version: 1,
    label: "Catalog · amenities & place",
    description:
      "The amenities card with the location as the first pill, in the accent colour.",
  },
  {
    id: "catalog-destination",
    version: 1,
    label: "Catalog · destination",
    description:
      "The place in spaced capitals above one big headline, the facts, and at most one pill. For brands whose guests travel to a region.",
  },
  {
    id: "catalog-headline",
    version: 1,
    label: "Catalog · headline",
    description:
      "The photo, the optional mark, the place in spaced capitals and one big headline. No facts line, no pills: the words do the selling.",
  },
  {
    id: "catalog-review",
    version: 1,
    label: "Catalog · review",
    description:
      "Same photo treatment, a guest quote and their stars at the foot instead of facts.",
  },
  {
    id: "tall-statement",
    version: 3,
    label: "Tall · statement",
    description:
      "Logo and a centred headline high on the photo, a quiet call to action at the base. Stories and Reels.",
  },
  {
    id: "tall-welcome",
    version: 1,
    label: "Tall · welcome",
    description:
      "Left-set headline and supporting line under the logo, a pill button at the base.",
  },
  {
    id: "hero-overlay",
    version: 3,
    label: "Hero · overlay",
    description:
      "The photo full-bleed, a bold headline top left under a soft scrim, a white pill button at the foot. Centred on the story canvas. The awareness card, in every size.",
  },
  {
    id: "image-hero",
    version: 3,
    label: "Image hero",
    description:
      "A full-bleed image with a restrained, readable message block.",
  },
  {
    id: "split-frame",
    version: 2,
    label: "Split frame",
    description:
      "Copy and a framed source image share the canvas. Good for product UI.",
  },
  {
    id: "editorial-overlay",
    version: 2,
    label: "Editorial overlay",
    description:
      "Large type over an atmospheric crop. Good for property and campaign work.",
  },
  {
    id: "product-proof",
    version: 2,
    label: "Product proof",
    description:
      "A restrained copy column with a product card entering from the lower right.",
  },
  {
    id: "brand-statement",
    version: 1,
    label: "Brand statement",
    description:
      "A type-led composition that can stand alone without source media.",
  },
] as const;

export type CompositionFormatId = (typeof COMPOSITION_FORMATS)[number]["id"];
export type CompositionTemplateId =
  (typeof COMPOSITION_TEMPLATES)[number]["id"];

export type CompositionFieldKey =
  | "mark"
  | "eyebrow"
  | "title"
  | "subtitle"
  | "cta"
  | "accent"
  | "rating"
  | "pills"
  | "location"
  | "tier";

export type CompositionField = {
  key: CompositionFieldKey;
  /** What the field is called on this blueprint: "Home name", not "Headline". */
  label: string;
  hint?: string;
};

const mark: CompositionField = { key: "mark", label: "Mark" };
const message: CompositionField[] = [
  { key: "eyebrow", label: "Eyebrow", hint: "Optional" },
  { key: "title", label: "Headline" },
  { key: "subtitle", label: "Supporting copy", hint: "Optional" },
  { key: "cta", label: "CTA", hint: "Optional" },
];
const accent = (hint: string): CompositionField => ({
  key: "accent",
  label: "Accent",
  hint,
});

/**
 * The fields each blueprint draws, and only those. The form is built from
 * this, so a field that exists on screen is a field the render reads, and the
 * label says what it means on that layout.
 */
/**
 * What each catalog card's copy is for. The copy prompt reads it, so a card
 * is written to its layout: the place card sells an amenity and a place, the
 * amenities cards leave the amenities to their pills and describe the space.
 */
export type CatalogCopyIntent = {
  intent: string;
  /** Characters that stay on two lines: the lead on a place card, else the headline. */
  headlineChars: number;
  /** The headline ends " in {place}". */
  placeSuffix: boolean;
  /** How many amenity pills the card draws. */
  pills: number;
};

export const CATALOG_COPY_INTENTS = {
  "catalog-place": {
    intent:
      'An amenity-led card: "{lead} in {place}". The lead names the one or two amenities or features this home is chosen for ("Private sauna & hot tub", "Rooftop deck & skyline views"), and the place says where it is.',
    headlineChars: 28,
    placeSuffix: true,
    pills: 0,
  },
  "catalog-copy": {
    intent:
      "One statement with no place line: what this home is and what it offers, amenity or space, whichever sells it best.",
    headlineChars: 40,
    placeSuffix: false,
    pills: 0,
  },
  "catalog-amenities": {
    intent:
      'A space-led card. The headline is what being there feels like, the line a friend would say showing you the photo, grounded in this listing: "Fall asleep to the waterfall", "Two suites joined for the whole crew", "Your own pond, your own deck", "Log cabin on 12 acres by a stream". Room layouts, bed setups and access details are facts for the listing, not headlines. The pills carry the amenities, so the headline never lists them. Choose one or two pills from the draws a guest picks a home for (a sauna, a pool, a pond, a game room, a view, a fireplace, pets welcome): first the ones this home has and most of the catalog does not; when the catalog shares them all, the strongest one or two. Everyday appliances and supplies (a dishwasher, a microwave, linens) never earn a pill. Write each pill the way a guest reads it ("Outdoor pool", "Fireplace", "Pets welcome"), never a raw listing label ("Pool outdoor", "Fire place").',
    headlineChars: 36,
    placeSuffix: false,
    pills: 2,
  },
  "catalog-amenities-place": {
    intent:
      'A space-led card whose first pill already shows the location, so the headline never names the place. The headline is what being there feels like, the line a friend would say showing you the photo, grounded in this listing: "Fall asleep to the waterfall", "Two suites joined for the whole crew", "Your own pond, your own deck", "Log cabin on 12 acres by a stream". Room layouts, bed setups and access details are facts for the listing, not headlines. The other pills carry the amenities, so the headline never lists them. Choose one or two from the draws a guest picks a home for (a sauna, a pool, a pond, a game room, a view, a fireplace, pets welcome): first the ones this home has and most of the catalog does not; when the catalog shares them all, the strongest one or two. Everyday appliances and supplies (a dishwasher, a microwave, linens) never earn a pill. Write each pill the way a guest reads it ("Outdoor pool", "Fireplace", "Pets welcome"), never a raw listing label ("Pool outdoor", "Fire place").',
    headlineChars: 36,
    placeSuffix: false,
    pills: 2,
  },
  "catalog-destination": {
    intent:
      'A destination-led card: the place is printed in capitals above the headline, so the headline never names it. The headline is the moment you would feel there, in a few words, the line a friend would say showing you the photo, grounded in this listing: "Fall asleep to the waterfall", "Two suites joined for the whole crew", "Your own pond, your own deck", "Log cabin on 12 acres by a stream". Room layouts, bed setups and access details are facts for the listing, not headlines. Up to two pills: the draws this home has that the others in the catalog do not (a private pond, a sauna, a game room), the strongest first, or none. Never an appliance, a supply or an access detail. Write each pill the way a guest reads it ("Outdoor pool", "Fireplace", "Pets welcome"), never a raw listing label ("Pool outdoor", "Fire place").',
    headlineChars: 32,
    placeSuffix: false,
    pills: 2,
  },
  "catalog-headline": {
    intent:
      'A headline-only card: the place is printed in capitals above it and nothing else is on the card, so the one line carries the whole ad. It is the moment you would feel there, in a few words, the line a friend would say showing you the photo, grounded in this listing: "Fall asleep to the waterfall", "Two suites joined for the whole crew", "Your own pond, your own deck". It never names the place, never repeats the bedroom or guest count, and never lists amenities.',
    headlineChars: 32,
    placeSuffix: false,
    pills: 0,
  },
} as const satisfies Partial<Record<CompositionTemplateId, CatalogCopyIntent>>;

export type CatalogCopyTemplateId = keyof typeof CATALOG_COPY_INTENTS;

export const COMPOSITION_FIELDS: Record<
  CompositionTemplateId,
  CompositionField[]
> = {
  // The photo alone: nothing from the form reaches the canvas.
  "photo-only": [],
  "tier-badge": [{ key: "tier", label: "Tier" }],
  "catalog-copy": [
    mark,
    { key: "title", label: "Home name" },
    {
      key: "subtitle",
      label: "Facts",
      hint: "3 bedrooms · 2 baths · 8 guests",
    },
  ],
  "catalog-place": [
    mark,
    { key: "eyebrow", label: "Lead-in", hint: "Arcade games & firepit in" },
    { key: "title", label: "Place", hint: "Winter Park, CO" },
    {
      key: "subtitle",
      label: "Facts",
      hint: "3 bedrooms · 3.5 baths · 14 guests",
    },
    { key: "rating", label: "Guest rating", hint: "4.9" },
    accent("colours the rating pill"),
  ],
  "catalog-amenities": [
    mark,
    { key: "title", label: "Headline", hint: "Two suites joined for groups" },
    {
      key: "subtitle",
      label: "Facts",
      hint: "8 bedrooms · 4 baths · 16 guests",
    },
    { key: "pills", label: "Amenities", hint: "Up to three, e.g. Soaking tub" },
  ],
  "catalog-amenities-place": [
    mark,
    { key: "location", label: "Location", hint: "Louisville, KY" },
    { key: "title", label: "Headline", hint: "Two suites joined for groups" },
    {
      key: "subtitle",
      label: "Facts",
      hint: "8 bedrooms · 4 baths · 16 guests",
    },
    { key: "pills", label: "Amenities", hint: "Up to three, e.g. Soaking tub" },
    accent("colours the location pill"),
  ],
  "catalog-destination": [
    mark,
    { key: "location", label: "Destination", hint: "Hocking Hills, Ohio" },
    { key: "title", label: "Headline", hint: "Fall asleep to the waterfall" },
    { key: "subtitle", label: "Facts", hint: "2 bedrooms · 1 bath · 4 guests" },
    { key: "pills", label: "Signature", hint: "One, e.g. Private pond" },
  ],
  "catalog-headline": [
    mark,
    { key: "location", label: "Eyebrow", hint: "Hocking Hills, Ohio" },
    { key: "title", label: "Headline", hint: "Fall asleep to the waterfall" },
  ],
  "catalog-review": [
    mark,
    { key: "title", label: "Guest quote", hint: "Without the quotation marks" },
    { key: "subtitle", label: "Guest", hint: "Who said it" },
    { key: "rating", label: "Stars" },
  ],
  // Centred, so the layout skips the supporting line.
  "tall-statement": [
    mark,
    { key: "title", label: "Headline" },
    { key: "cta", label: "Call to action", hint: "Optional" },
  ],
  "tall-welcome": [
    mark,
    { key: "title", label: "Headline" },
    { key: "subtitle", label: "Supporting line", hint: "Optional" },
    { key: "cta", label: "Button", hint: "Optional" },
  ],
  "hero-overlay": [
    mark,
    { key: "title", label: "Headline" },
    {
      key: "cta",
      label: "Button",
      hint: "Optional; plain text on the story canvas",
    },
  ],
  "image-hero": [mark, ...message],
  "split-frame": [mark, ...message],
  "editorial-overlay": [mark, ...message, accent("colours the CTA")],
  "product-proof": [mark, ...message, accent("colours the card edge")],
  "brand-statement": [mark, ...message, accent("warms the ground")],
};

export function getCompositionFields(id: CompositionTemplateId) {
  return COMPOSITION_FIELDS[id];
}

export function compositionHasField(
  id: CompositionTemplateId,
  key: CompositionFieldKey,
) {
  return COMPOSITION_FIELDS[id].some((field) => field.key === key);
}

const templateIds = COMPOSITION_TEMPLATES.map((template) => template.id) as [
  CompositionTemplateId,
  ...CompositionTemplateId[],
];
const formatIds = COMPOSITION_FORMATS.map((format) => format.id) as [
  CompositionFormatId,
  ...CompositionFormatId[],
];

export const compositionFormatIdSchema = z.enum(formatIds);
export const compositionTemplateIdSchema = z.enum(templateIds);

const compositionShape = {
  brandId: z.string().min(1),
  templateId: z.enum(templateIds),
  formatId: z.enum(formatIds),
  sourceMediaAssetId: z.string().min(1).optional(),
  title: z.string().trim().max(120),
  subtitle: z.string().trim().max(220).optional(),
  eyebrow: z.string().trim().max(40).optional(),
  cta: z.string().trim().max(60).optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  imagePosition: z.enum(["top", "center", "bottom"]).default("center"),
  /**
   * The point of the photo that must stay in frame, as percentages of its
   * width and height. Set by the art director from what the crop cut off;
   * overrides `imagePosition` when present.
   */
  focal: z
    .object({
      x: z.number().int().min(0).max(100),
      y: z.number().int().min(0).max(100),
    })
    .optional(),
  /**
   * Colour of the darkening on catalog cards. Black by default; a deep tint of
   * the photo's own hue (a navy over sky, a green over forest) where the art
   * director asked for one. Always clamped dark enough to keep the type legible.
   */
  scrim: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  /**
   * Guest rating, 1 to 5 with one decimal: stars on the review card, a
   * "4.9 guest rating" pill on the place card.
   */
  rating: z.number().min(1).max(5).multipleOf(0.1).optional(),
  /** Amenity labels drawn as pills on the amenities cards. */
  pills: z.array(z.string().trim().min(1).max(24)).max(4).optional(),
  /** The location pill leading the amenities-and-place card's pill row. */
  location: z.string().trim().max(40).optional(),
  /**
   * Which version of the brand mark a card draws. `auto` picks white over a
   * photo and colour on a light ground; the rest force it or drop it.
   */
  mark: z.enum(["auto", "color", "white", "dark", "none"]).default("auto"),
  /** The wander.com tier pill: "Luxury" with a sparkle, "Iconic" with a crown. */
  tier: z.enum(["luxury", "iconic"]).optional(),
};

function requireTier(
  value: { templateId: CompositionTemplateId; tier?: string },
  context: z.RefinementCtx,
) {
  if (value.templateId === "tier-badge" && !value.tier) {
    context.addIssue({
      code: "custom",
      path: ["tier"],
      message: "This blueprint needs a tier",
    });
  }
}

function requireSourceImage(
  value: { templateId: CompositionTemplateId; sourceMediaAssetId?: string },
  context: z.RefinementCtx,
) {
  if (value.templateId !== "brand-statement" && !value.sourceMediaAssetId) {
    context.addIssue({
      code: "custom",
      path: ["sourceMediaAssetId"],
      message: "This blueprint needs a source image",
    });
  }
}

/** Blueprints that draw no copy, so a headline is not required for them. */
export const COPYLESS_TEMPLATES: readonly CompositionTemplateId[] = [
  "photo-only",
  "tier-badge",
];

// Every other template puts the title on the canvas.
function requireTitle(
  value: { templateId: CompositionTemplateId; title: string },
  context: z.RefinementCtx,
) {
  if (
    !COPYLESS_TEMPLATES.includes(value.templateId) &&
    value.title.length === 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["title"],
      message: "This blueprint needs a headline",
    });
  }
}

export const compositionSpecSchema = z
  .object(compositionShape)
  .superRefine(requireSourceImage)
  .superRefine(requireTitle)
  .superRefine(requireTier);

/**
 * A spec for an on-demand preview, where the photo may come from a URL the
 * server vouches for (a brand's own listing hero) instead of the library.
 * Everything else is the ordinary spec; only the source requirement moves to
 * the route, which knows whether it was given a URL.
 */
export const compositionPreviewSchema = z
  .object(compositionShape)
  .superRefine(requireTitle)
  .superRefine(requireTier);

export const freezeCompositionSchema = z
  .object({
    ...compositionShape,
    assetTitle: z.string().trim().min(1).max(180),
  })
  .superRefine(requireSourceImage)
  .superRefine(requireTitle)
  .superRefine(requireTier);

export type CompositionSpec = z.infer<typeof compositionSpecSchema>;
export type FreezeCompositionInput = z.infer<typeof freezeCompositionSchema>;

export function getCompositionFormat(id: CompositionFormatId) {
  return COMPOSITION_FORMATS.find((format) => format.id === id)!;
}

export function getCompositionTemplate(id: CompositionTemplateId) {
  return COMPOSITION_TEMPLATES.find((template) => template.id === id)!;
}

/**
 * Everything that makes one render differ from another. Two specs with the
 * same identity produce the same PNG, so a caller can reuse the earlier one.
 * The template version is part of it: bumping a template must miss.
 */
export function getCompositionIdentity(spec: FreezeCompositionInput) {
  const template = getCompositionTemplate(spec.templateId);
  const format = getCompositionFormat(spec.formatId);
  return {
    templateId: template.id,
    templateVersion: template.version,
    formatId: format.id,
    sourceMediaAssetId: spec.sourceMediaAssetId ?? null,
    title: spec.title,
    subtitle: spec.subtitle ?? null,
    eyebrow: spec.eyebrow ?? null,
    cta: spec.cta ?? null,
    accent: spec.accent ?? null,
    imagePosition: spec.imagePosition,
    focal: spec.focal ?? null,
    scrim: spec.scrim ?? null,
    rating: spec.rating ?? null,
    mark: spec.mark,
    // Only blueprints that draw it carry it, so every other card's identity
    // (and every render cached under it) is unchanged.
    ...(spec.tier ? { tier: spec.tier } : {}),
  };
}

export function getCompositionMetadata(
  spec: FreezeCompositionInput,
  renderedAt = new Date().toISOString(),
) {
  return { ...getCompositionIdentity(spec), renderedAt };
}

/**
 * A preview URL's query as a composition: what `/api/compositions/preview`
 * draws, and what a server-side render of the same URL draws. `sourceUrl` is
 * a photo by URL instead of a library asset; the service checks its host.
 */
export function compositionPreviewFromParams(params: URLSearchParams) {
  return {
    sourceUrl: params.get("sourceUrl") || null,
    parsed: compositionPreviewSchema.safeParse({
      brandId: params.get("brandId"),
      templateId: params.get("templateId"),
      formatId: params.get("formatId"),
      sourceMediaAssetId: params.get("sourceMediaAssetId") || undefined,
      title: params.get("title"),
      subtitle: params.get("subtitle") || undefined,
      eyebrow: params.get("eyebrow") || undefined,
      cta: params.get("cta") || undefined,
      accent: params.get("accent") || undefined,
      imagePosition: params.get("imagePosition") || "center",
      focal:
        params.get("focalX") && params.get("focalY")
          ? { x: Number(params.get("focalX")), y: Number(params.get("focalY")) }
          : undefined,
      scrim: params.get("scrim") || undefined,
      rating: params.get("rating") ? Number(params.get("rating")) : undefined,
      pills: params.getAll("pill").length ? params.getAll("pill") : undefined,
      location: params.get("location") || undefined,
      mark: params.get("mark") || "auto",
      tier: params.get("tier") || undefined,
    }),
  };
}
