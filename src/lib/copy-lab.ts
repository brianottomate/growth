import { z } from "zod";

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
  appendix: z.string(),
});
export type CopyLabVariant = z.infer<typeof copyLabVariantSchema>;

export const copyLabRunSchema = z.object({
  surface: z.enum(["meta-set", "catalog-card", "brand-concepts"]),
  brandId: z.string(),
  homeIds: z.array(z.string()).max(8),
  variant: copyLabVariantSchema,
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
