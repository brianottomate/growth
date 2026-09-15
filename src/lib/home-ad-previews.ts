import type { CompositionFormatId } from "@/lib/compositions";
import { usStateCode } from "@/lib/us-states";

// On-demand ad previews from one home. Client-safe: the brand page builds the
// grid in the browser and each tile is the Studio's own preview route with a
// spec in the URL, so nothing is saved until someone chooses a card.

export type HomePreviewRecipeId = "hero" | "amenities" | "cta";

export type HomePreviewRecipe = {
  id: HomePreviewRecipeId;
  label: string;
  title: string;
  cta: string;
};

export type HomeForPreview = {
  name: string;
  city?: string | null;
  state?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  guests?: number | null;
  /**
   * The guest rating as the feed reports it. WanderOS feeds score out of 10;
   * the listing card shows it out of 5, so anything above 5 is halved.
   */
  rating?: number | null;
};

/** A feed rating on the card's five-point scale, or null when there is none. */
export function ratingOutOfFive(
  rating: number | null | undefined,
): number | null {
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0)
    return null;
  const scaled = rating > 5 ? rating / 2 : rating;
  const rounded = Math.round(Math.min(5, scaled) * 10) / 10;
  return rounded >= 1 ? rounded : null;
}

const BUTTON = "Find your next escape";

function place(home: HomeForPreview) {
  // "Winter Park, CO": the feed says "Colorado", the cards say the code.
  const state = usStateCode(home.state) ?? home.state;
  return [home.city, state].filter(Boolean).join(", ");
}

function count(n: number | null | undefined, one: string, many: string) {
  if (!n) return null;
  return `${n} ${n === 1 ? one : many}.`;
}

/**
 * Three lines of copy for one home, the way the awareness template reads:
 * a promise, an amenity triplet and an imperative. Written from the listing
 * facts, so the grid needs no model call; the Studio's writer refines any of
 * them when a card is opened.
 */
export function homePreviewRecipes(home: HomeForPreview): HomePreviewRecipe[] {
  const where = place(home);
  const town = home.city?.trim() || "mountain";
  const facts = [
    count(home.bedrooms, "bedroom", "bedrooms"),
    count(home.bathrooms, "bath", "baths"),
    home.guests ? `Sleeps ${home.guests}.` : null,
  ].filter((line): line is string => Boolean(line));
  return [
    {
      id: "hero",
      label: "Hero",
      title: where
        ? `Your private ${town} escape awaits`
        : `${home.name} awaits`,
      cta: BUTTON,
    },
    {
      id: "amenities",
      label: "Amenities",
      title: facts.length > 0 ? facts.join(" ") : home.name,
      cta: BUTTON,
    },
    {
      id: "cta",
      label: "Call to action",
      title: `Book your next ${town} getaway`,
      cta: BUTTON,
    },
  ];
}

/** Everything a preview tile needs to draw itself, and to be frozen as is. */
export type PreviewSpec = {
  brandId: string;
  templateId: "hero-overlay" | "catalog-place";
  formatId: CompositionFormatId;
  source: { assetId: string } | { url: string };
  title: string;
  subtitle?: string | null;
  eyebrow?: string | null;
  cta?: string | null;
  rating?: number | null;
  focal?: { x: number; y: number } | null;
  scrim?: string | null;
};

/** The Studio's preview route for any spec; the art director's fields ride along. */
export function compositionPreviewUrl(spec: PreviewSpec) {
  const params = new URLSearchParams({
    brandId: spec.brandId,
    templateId: spec.templateId,
    formatId: spec.formatId,
    title: spec.title,
    mark: "none",
  });
  if (spec.subtitle) params.set("subtitle", spec.subtitle);
  if (spec.eyebrow) params.set("eyebrow", spec.eyebrow);
  if (spec.cta) params.set("cta", spec.cta);
  if (spec.rating != null) params.set("rating", String(spec.rating));
  if (spec.focal) {
    params.set("focalX", String(spec.focal.x));
    params.set("focalY", String(spec.focal.y));
  }
  if (spec.scrim) params.set("scrim", spec.scrim);
  if ("assetId" in spec.source)
    params.set("sourceMediaAssetId", spec.source.assetId);
  else params.set("sourceUrl", spec.source.url);
  return `/api/compositions/preview?${params.toString()}`;
}

/** The listing card's fields for one home, written from the feed facts. */
export type HomeCatalogCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  rating: number | null;
};

export function homeCatalogCopy(home: HomeForPreview): HomeCatalogCopy {
  const where = place(home);
  const facts = [
    home.bedrooms
      ? `${home.bedrooms} ${home.bedrooms === 1 ? "bedroom" : "bedrooms"}`
      : null,
    home.bathrooms
      ? `${home.bathrooms} ${home.bathrooms === 1 ? "bath" : "baths"}`
      : null,
    home.guests ? `${home.guests} guests` : null,
  ].filter((part): part is string => Boolean(part));
  const rating = ratingOutOfFive(home.rating);
  return {
    eyebrow: where ? `${home.name} in` : home.name,
    title: where || home.name,
    subtitle: facts.join(" · "),
    rating,
  };
}

/** The Studio's preview route for the listing card of one home. */
export function homeCatalogPreviewUrl(input: {
  brandId: string;
  source: { assetId: string } | { url: string };
  formatId: CompositionFormatId;
  copy: HomeCatalogCopy;
}) {
  return compositionPreviewUrl({
    brandId: input.brandId,
    templateId: "catalog-place",
    formatId: input.formatId,
    source: input.source,
    eyebrow: input.copy.eyebrow,
    title: input.copy.title,
    subtitle: input.copy.subtitle,
    rating: input.copy.rating,
  });
}
