import { z } from "zod";

import { metaPlacementSchema, type MetaPlacement } from "./meta-placement-plan";
import { CATALOG_TEMPLATES } from "./catalog-studio";
import { ideaDocumentSchema, type IdeaDocument } from "./ad-idea-studio";

import type { Market } from "@/lib/markets";

// The copy lab (/lab/copy): real brands and homes frozen as fixtures, run
// through the production copy calls with a tune, side by side. Shapes here
// are shared by the snapshot script, the run route and the page.

export type CopyLabBrand = {
  id: string;
  name: string;
  website: string | null;
  story: string | null;
  fingerprint: string | null;
  personality: { tone: string; energy: string; targetAudience: string } | null;
  /** The catalog's place suffix: "Hocking Hills, Ohio". */
  place: string | null;
  brandWide: string[];
  /** Headlines the team approved on this brand's catalog: the human reference. */
  approved: { homeId: string; headline: string }[];
};

export type CopyLabHome = {
  id: string;
  brandId: string;
  name: string;
  place: string;
  city: string | null;
  market: Market | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  nightlyFrom: number | null;
  amenities: string[];
  description: string | null;
  locationDescription: string | null;
  petsAllowed: boolean | null;
  heroUrl: string | null;
  photos: { url: string; thumbUrl: string | null }[];
  /** The live catalog card, when it has one. */
  catalog: {
    title: string | null;
    pills: string[] | null;
    templateId: string | null;
    approved: boolean;
  };
};

export type CopyLabFixtures = {
  snapshotAt: string;
  brands: CopyLabBrand[];
  homes: CopyLabHome[];
};

export const COPY_LAB_SURFACES = [
  {
    id: "home-suite",
    label: "Whole home",
    note: "One home: catalog, static and home carousel, composed for each placement",
    homes: "one",
  },
  {
    id: "meta-set",
    label: "Meta ad set",
    note: "Per-home caption, headline, description, card title + portfolio caption",
    homes: "many",
  },
  {
    id: "catalog-card",
    label: "Catalog card",
    note: "One home's catalog headline and pills, written fresh",
    homes: "one",
  },
  {
    id: "brand-concepts",
    label: "Brand concepts",
    note: "Three brand ads with no homes chosen",
    homes: "none",
  },
] as const;
export type CopyLabSurface = (typeof COPY_LAB_SURFACES)[number]["id"];

export const COPY_LAB_MODELS = [
  "claude-sonnet-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-haiku-4-5",
] as const;

export const copyLabVariantSchema = z.object({
  label: z.string().max(40),
  model: z.string().nullable(),
  effort: z.enum(["low", "medium", "high"]).nullable(),
  /** Keep the generator's own effort instead of `effort`. */
  defaultEffort: z.boolean(),
  images: z.boolean(),
  story: z.boolean(),
  /** Replaces the production system prompt; null keeps it. */
  system: z.string().nullable(),
  homeSystem: z.string().nullable().optional(),
  appendix: z.string(),
});
export type CopyLabVariant = z.infer<typeof copyLabVariantSchema>;

export const copyLabRunSchema = z.object({
  surface: z.enum(["home-suite", "meta-set", "catalog-card", "brand-concepts"]),
  brandId: z.string(),
  homeIds: z.array(z.string()).max(8),
  variant: copyLabVariantSchema,
  placements: z.array(metaPlacementSchema).min(1).optional(),
  catalogTemplates: z.array(z.enum(CATALOG_TEMPLATES)).min(1).max(4).optional(),
  photoUrl: z.string().url().optional(),
  catalogHomeIds: z.array(z.string()).max(8).optional(),
});
export type CopyLabRunInput = z.infer<typeof copyLabRunSchema>;

export type CopyLabRunResult = {
  output: unknown;
  /** Code checks the generator retried on, then any left on the final answer. */
  problems: string[];
  flags: string[];
  system: string;
  /** The generator's own system prompt, before any tune. */
  baseSystem: string;
  homeBaseSystem?: string;
  model: string;
  ms: number;
  usage: { inputTokens: number; outputTokens: number };
};

/** Shapes and words every surface's copy should avoid, checked in code. */
const AI_ISMS = [
  "delve",
  "tapestry",
  "elevate",
  "unparalleled",
  "nestled",
  "boasts",
  "oasis",
  "haven",
  "unforgettable",
  "seamless",
  "curated",
  "breathtaking",
  "stunning",
  "luxurious",
];

/** Cheap flags on any written string: what a reviewer would circle first. */
export function copyFlags(text: string): string[] {
  const flags: string[] = [];
  if (/[—–]/.test(text)) flags.push("em dash");
  if (text.includes("!")) flags.push("exclamation");
  if (/\bnot (just|only)\b.*\bbut\b/i.test(text)) flags.push("not X but Y");
  if (/\bfrom\b[^.]{1,40}\bto\b/i.test(text)) flags.push("from X to Y");
  const lower = text.toLowerCase();
  for (const word of AI_ISMS)
    if (new RegExp(`\\b${word}`).test(lower)) flags.push(word);
  return flags;
}

/** Initial review set, kept separate from the campaign's delivery settings. */
export const COPY_LAB_PLACEMENTS: MetaPlacement[] = [
  "facebook-feed",
  "instagram-feed",
  "facebook-story",
  "instagram-story",
  "facebook-reel",
  "instagram-reel",
];
export type CopyLabCatalog = {
  headline: string;
  pills: string[];
  reason: string;
  showPhoto: { number: number; url: string } | null;
};
export type CopyLabHomeSuite = {
  catalog: CopyLabCatalog | null;
  catalogHomes?: {
    homeId: string;
    templateId: (typeof CATALOG_TEMPLATES)[number];
    copy: CopyLabCatalog | null;
    problems: string[];
  }[];
  catalogVariants?: {
    templateId: (typeof CATALOG_TEMPLATES)[number];
    copy: CopyLabCatalog | null;
    problems?: string[];
    system: string;
  }[];
  static: IdeaDocument | null;
  carousel: IdeaDocument | null;
};

const catalogOutputSchema = z.object({
  headline: z.string(),
  pills: z.array(z.string()),
  reason: z.string(),
  showPhoto: z.object({ number: z.number(), url: z.string() }).nullable(),
});
const copyLabResultSchema = z.object({
  output: z.union([
    z.null(),
    catalogOutputSchema,
    z.object({
      catalog: catalogOutputSchema.nullable(),
      catalogHomes: z
        .array(
          z.object({
            homeId: z.string(),
            templateId: z.enum(CATALOG_TEMPLATES),
            copy: catalogOutputSchema.nullable(),
            problems: z.array(z.string()),
          }),
        )
        .optional(),
      catalogVariants: z
        .array(
          z.object({
            templateId: z.enum(CATALOG_TEMPLATES),
            copy: catalogOutputSchema.nullable(),
            problems: z.array(z.string()).optional(),
            system: z.string(),
          }),
        )
        .optional(),
      static: ideaDocumentSchema.nullable(),
      carousel: ideaDocumentSchema.nullable(),
    }),
    z.object({
      homes: z.array(
        z.object({
          primaryText: z.string(),
          headline: z.string(),
          description: z.string(),
          cardTitle: z.string(),
        }),
      ),
      portfolioPrimaryText: z.string(),
      portfolioHeadline: z.string(),
      portfolioDescription: z.string(),
    }),
    z.object({
      ideas: z.array(
        z.object({
          name: z.string(),
          format: z.string(),
          headline: z.string(),
          body: z.string(),
          description: z.string(),
        }),
      ),
    }),
  ]),
  problems: z.array(z.string()),
  flags: z.array(z.string()),
  system: z.string(),
  baseSystem: z.string(),
  homeBaseSystem: z.string().optional(),
  model: z.string(),
  ms: z.number(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
});
export const copyLabInspirationSchema = z
  .array(
    z.object({
      title: z.string().max(200),
      url: z.string().max(2000),
      notes: z.string().max(5000),
    }),
  )
  .max(30);
export type CopyLabInspiration = z.infer<typeof copyLabInspirationSchema>;

export const copyLabExperimentSchema = z.object({
  inspiration: copyLabInspirationSchema.optional(),
  variants: z
    .array(copyLabVariantSchema.extend({ id: z.string() }))
    .min(1)
    .max(20),
  cells: z.record(
    z.string(),
    z.object({
      status: z.literal("done"),
      result: copyLabResultSchema,
      at: z.string(),
      ran: z.string(),
    }),
  ),
  picks: z.record(z.string(), z.string()),
  context: z.object({
    activeSet: z.string().optional(),
    surface: z.enum([
      "home-suite",
      "meta-set",
      "catalog-card",
      "brand-concepts",
    ]),
    brandId: z.string(),
    homeIds: z.array(z.string()),
    catalogTemplates: z.array(z.enum(CATALOG_TEMPLATES)).min(1).max(4),
    photo: z.string().nullable(),
    placements: z.array(metaPlacementSchema).min(1),
    placement: metaPlacementSchema,
  }),
});

/** A lab render may only fetch a photo from the selected frozen home. */
export function copyLabPreviewHome(
  fixtures: CopyLabFixtures,
  input: {
    brandId: string | null;
    homeId: string | null;
    sourceUrl: string | null;
    sourceMediaAssetId?: string;
  },
) {
  if (!input.sourceUrl || input.sourceMediaAssetId) return null;
  const home = fixtures.homes.find(
    (h) => h.id === input.homeId && h.brandId === input.brandId,
  );
  return home &&
    [home.heroUrl, ...home.photos.flatMap((p) => [p.url, p.thumbUrl])].includes(
      input.sourceUrl,
    )
    ? home
    : null;
}
