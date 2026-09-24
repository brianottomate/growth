import "server-only";
import { brandStorySection } from "@/server/ai/prompts";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  compositionFormatIdSchema,
  compositionTemplateIdSchema,
  getCompositionFields,
  getCompositionTemplate,
  type CompositionFieldKey,
} from "@/lib/compositions";
import { usStateName } from "@/lib/us-states";
import type { WanderOsListing } from "@/server/clients/wanderos-site.client";
import { db } from "@/server/db";
import { brandTable, mediaAssetTable, memberTable } from "@/server/db/schema";
import { CompositionAccessError } from "@/server/services/composition.service";
import { homeFacts } from "@/server/services/property-ads.service";
import { brandListings } from "@/server/services/wanderos-listings.service";

const MODEL = "claude-sonnet-5";

// ---- COPY FOR A CARD, IN THE BRAND'S VOICE ---------------------------------
//
// The art director judges a card that already has words on it: it shortens,
// it never writes. This is the step before that one. Given the blueprint, the
// photo and the brand, it fills the blueprint's fields from what we know: the
// brand's own tone as enrichment read it off their site, and the home behind
// the photo when the photo came from their listing feed. Facts only; nothing
// is saved. The Studio button and the chat action are the same call.

export const writeCompositionCopySchema = z.object({
  brandId: z.string().min(1),
  templateId: compositionTemplateIdSchema,
  formatId: compositionFormatIdSchema,
  sourceMediaAssetId: z.string().min(1),
});

export type WriteCompositionCopyInput = z.infer<
  typeof writeCompositionCopySchema
>;

export type CompositionCopy = {
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  cta: string | null;
  rating: number | null;
  /** What the copy was written from, in one line, for the operator. */
  note: string;
  /** The listing the photo was matched to, when it was. */
  homeUrl: string | null;
};

const CopySchema = z.object({
  eyebrow: z.string().max(40).nullable(),
  title: z.string().min(1).max(60),
  subtitle: z.string().max(90).nullable(),
  cta: z.string().max(30).nullable(),
  note: z.string().max(240),
});

export async function writeCompositionCopy(input: {
  userId: string;
  spec: WriteCompositionCopyInput;
}): Promise<CompositionCopy> {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.spec.brandId),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      website: true,
      tagline: true,
      description: true,
      story: true,
      organizationId: true,
      brandIdentity: true,
      brandFingerprint: true,
    },
  });
  if (!brand?.organizationId) {
    throw new CompositionAccessError("Brand not found", 404);
  }
  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, input.userId),
      eq(memberTable.organizationId, brand.organizationId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new CompositionAccessError("No access to this brand", 403);
  }

  const source = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, input.spec.sourceMediaAssetId),
      eq(mediaAssetTable.brandId, brand.id),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, title: true, alt: true, metadata: true },
  });
  if (!source) {
    throw new CompositionAccessError(
      "Choose an image from this brand's library",
      422,
    );
  }

  const home = await homeBehind(brand, source);
  const fields = getCompositionFields(input.spec.templateId).map(
    (field) => field.key,
  );
  const has = (key: CompositionFieldKey) => fields.includes(key);
  const place = home
    ? [home.city, usStateName(home.state ?? null) ?? home.state]
        .filter(Boolean)
        .join(", ")
    : "";
  const facts = home ? homeFacts(home) : "";
  const fallback = fallbackCopy({
    brandName: brand.name,
    home,
    place,
    facts,
    has,
  });
  const rating = has("rating") ? cardRating(home?.rating) : null;

  const voice = [
    brand.brandIdentity?.personality
      ? `Tone: ${brand.brandIdentity.personality.tone}. Energy: ${brand.brandIdentity.personality.energy}. Audience: ${brand.brandIdentity.personality.targetAudience}.`
      : null,
    brand.brandFingerprint?.fingerprintText
      ? `Voice notes: ${brand.brandFingerprint.fingerprintText.slice(0, 1200)}`
      : null,
  ].filter(Boolean);

  try {
    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({ schema: CopySchema }),
      system: [
        "You write the words printed on a paid-social ad card for a vacation-rental brand. Use only the facts given. Never invent amenities, ratings, distances, prices or availability. No exclamation marks, no all-caps, no emoji, no hashtags.",
        "Write in the brand's own voice when you are told what it is; otherwise plain, warm and specific.",
        "Return null for any field the layout does not use.",
        brandStorySection({ brandName: brand.name, story: brand.story }),
      ].join("\n"),
      prompt: [
        `Brand: ${brand.name}${brand.tagline ? ` — ${brand.tagline}` : ""}.`,
        brand.description
          ? `About the brand: ${brand.description.slice(0, 600)}`
          : null,
        ...voice,
        home
          ? `The photo is of ${home.name}${place ? ` in ${place}` : ""}${facts ? ` (${facts})` : ""}${home.nightlyFrom ? `, from $${home.nightlyFrom}/night` : ""}.`
          : `The photo is titled “${source.title ?? source.alt ?? "untitled"}”; nothing else is known about it.`,
        `Layout: ${getCompositionTemplate(input.spec.templateId).label}. ${getCompositionTemplate(input.spec.templateId).description}`,
        "Fields the layout uses, and what goes in each:",
        has("eyebrow")
          ? "- eyebrow: the hook that opens the headline, ending in a preposition so it runs straight into the title as one sentence (for example “A ski-in, ski-out condo in”, “Sleeps 14 with a hot tub in”). The card sets the hook on its own line and the preposition goes down with the place, so keep the hook to 28 characters before the preposition; 30 in total. Same bold type as the place. Build it from the facts given, never from guesses."
          : "- eyebrow: null.",
        input.spec.templateId === "catalog-place"
          ? "- title: the place only, as “Town, ST” (for example “Winter Park, CO”). If the place is unknown, use the home's name."
          : input.spec.templateId === "catalog-copy"
            ? "- title: the home's name, whole, with a suffix that repeats the location or the brand dropped. The card breaks a title after about 22 characters, so it either fits one line or breaks into two balanced lines."
            : "- title: a headline of at most 60 characters about staying with this brand, grounded in the home if one is known.",
        has("subtitle")
          ? input.spec.templateId.startsWith("catalog")
            ? "- subtitle: the home's facts as given, in the order given, separated by “ · ”; null if there are none."
            : "- subtitle: one supporting line of at most 90 characters, or null."
          : "- subtitle: null.",
        has("cta")
          ? "- cta: a short button label of at most 30 characters, such as “See the home” or “Book direct”."
          : "- cta: null.",
        "- note: one sentence saying what you wrote the copy from.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.7,
    });
    return {
      eyebrow: has("eyebrow") ? output.eyebrow?.trim() || null : null,
      title: output.title.trim() || fallback.title,
      subtitle: has("subtitle") ? output.subtitle?.trim() || null : null,
      cta: has("cta") ? output.cta?.trim() || null : null,
      rating,
      note: output.note.trim(),
      homeUrl: home?.url ?? null,
    };
  } catch (error) {
    console.error("composition copy failed, using the facts as written", error);
    return { ...fallback, rating, homeUrl: home?.url ?? null };
  }
}

/**
 * The card's rating pill is out of five with one decimal. Some WanderOS feeds
 * report guest ratings out of ten (a 9.3), so anything above five is halved
 * before it is clamped; a home with no reviews yet gets no pill.
 */
export function cardRating(raw: number | undefined): number | null {
  if (!raw || !Number.isFinite(raw) || raw <= 0) return null;
  const outOfFive = raw > 5 ? raw / 2 : raw;
  return Math.min(5, Math.max(1, Math.round(outOfFive * 10) / 10));
}

/** Copy built from the facts alone, for when the model cannot be asked. */
function fallbackCopy(input: {
  brandName: string;
  home: WanderOsListing | null;
  place: string;
  facts: string;
  has: (key: CompositionFieldKey) => boolean;
}): CompositionCopy {
  const { home, place, facts, has } = input;
  return {
    eyebrow: has("eyebrow")
      ? home
        ? "A home from " + input.brandName + " in"
        : null
      : null,
    title: place || home?.name || input.brandName,
    subtitle: has("subtitle") ? facts || null : null,
    cta: has("cta") ? "See the home" : null,
    rating: null,
    note: "Written from the listing facts as given; the copywriter could not be reached.",
    homeUrl: home?.url ?? null,
  };
}

/**
 * The listing a library photo came from. Listing imports record the photo's
 * origin URL, which matches the feed's `imageUrl`; a photo imported by hand
 * from their site may still match a home by its title. Anything else has no
 * home behind it, and the copy says only what the photo's title says.
 */
async function homeBehind(
  brand: { id: string; website: string | null },
  source: { title: string | null; metadata: unknown },
): Promise<WanderOsListing | null> {
  const listings = await brandListings(brand).catch(
    () => [] as WanderOsListing[],
  );
  if (listings.length === 0) return null;
  const meta = source.metadata as {
    sourceUrl?: string;
    listingUrl?: string;
  } | null;
  const origin = meta?.sourceUrl ?? null;
  const byUrl = listings.find(
    (row) =>
      (meta?.listingUrl && row.url === meta.listingUrl) ||
      (origin && (row.imageUrl === origin || row.thumbUrl === origin)),
  );
  if (byUrl) return byUrl;
  const title = source.title?.trim().toLowerCase();
  if (!title) return null;
  return (
    listings.find((row) => row.name.trim().toLowerCase() === title) ??
    listings.find((row) => title.startsWith(row.name.trim().toLowerCase())) ??
    null
  );
}
