import type { CompositionFormatId } from "@/lib/compositions";

// On-demand ad previews from one home. Client-safe: the brand page builds the
// grid in the browser and each tile is the Studio's own preview route with a
// spec in the URL, so nothing is saved until someone chooses a card.

/** The canvases the grid shows, in reading order. */
export const HOME_PREVIEW_FORMATS: CompositionFormatId[] = [
  "portrait",
  "square",
  "story",
  "wide",
];

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
};

const BUTTON = "Find your next escape";

function place(home: HomeForPreview) {
  return [home.city, home.state].filter(Boolean).join(", ");
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
      title: where ? `Your private ${town} escape awaits` : `${home.name} awaits`,
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

/**
 * The Studio's preview route for one tile. The photo is a library asset when
 * the home's hero has been imported, or the hero's own URL on their site when
 * it has not; the route vouches for WanderOS hosts, so nothing is saved to
 * draw a preview.
 */
export function homePreviewUrl(input: {
  brandId: string;
  source: { assetId: string } | { url: string };
  formatId: CompositionFormatId;
  recipe: HomePreviewRecipe;
}) {
  const params = new URLSearchParams({
    brandId: input.brandId,
    templateId: "hero-overlay",
    formatId: input.formatId,
    title: input.recipe.title,
    cta: input.recipe.cta,
    mark: "none",
  });
  if ("assetId" in input.source) params.set("sourceMediaAssetId", input.source.assetId);
  else params.set("sourceUrl", input.source.url);
  return `/api/compositions/preview?${params.toString()}`;
}
