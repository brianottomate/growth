import "server-only";

import type { PreviewHome } from "@/components/brand/BrandPreviewStrip";

type HeroRow = {
  name: string;
  url: string;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  rating: number | null;
  heroSourceUrl: string | null;
};

/**
 * The photo the setup Studio draws: the brand's hero, exactly as chosen. A
 * hero home brings its copy and, unless another photo was picked, its own
 * hero photo; a library photo picked alone draws under the brand's name.
 * Null until someone (or the agent) chooses a hero. Nothing is guessed in its
 * place, so an empty Studio means "not chosen yet", never "picked for you".
 */
export function resolvePreviewHome(input: {
  brandName: string;
  featuredListingUrl: string | null;
  previewSourceUrl: string | null;
  homes: HeroRow[];
}): PreviewHome | null {
  const home = input.featuredListingUrl
    ? input.homes.find((row) => row.url === input.featuredListingUrl)
    : undefined;
  const imageUrl = input.previewSourceUrl ?? home?.heroSourceUrl ?? null;
  if (!imageUrl) return null;
  if (!home)
    return {
      name: input.brandName,
      place: null,
      facts: null,
      rating: null,
      imageUrl,
      source: "library",
    };
  return {
    name: home.name,
    place: [home.city, home.state].filter(Boolean).join(", ") || null,
    facts:
      [
        home.bedrooms ? `${home.bedrooms} bedrooms` : null,
        home.bathrooms ? `${home.bathrooms} baths` : null,
        home.guests ? `${home.guests} guests` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    rating: home.rating,
    imageUrl,
    source: "hero",
  };
}
