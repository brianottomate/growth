import {
  defaultIdeaRecipe,
  ideaRecipe,
  type IdeaDocument,
  type IdeaImage,
  type IdeaShape,
} from "@/lib/ad-idea-studio";
import type { CatalogCard } from "@/lib/catalog-studio";

export const BRAND = {
  id: "fixture-coast",
  name: "Coast & Co",
  website: "https://example.com",
};
// Existing public photos used in Growth's property-showcase lab; all inventory and copy here are illustrative.
export const PHOTOS = [
  "https://assets.wander.com/576810187482991684/fullres.webp",
  "https://assets.wander.com/561581225785953806/fullres.webp",
  "https://assets.wander.com/685132288769396463/fullres.webp",
];
export const HOMES = [
  {
    id: "home-ocean",
    name: "Ocean House",
    city: "Topsail Beach",
    nightlyFrom: 340,
    subtitle: "4 bedrooms · 4 baths · 10 guests",
    photo: PHOTOS[0]!,
  },
  {
    id: "home-gather",
    name: "Gathering House",
    city: "Surf City",
    nightlyFrom: 280,
    subtitle: "3 bedrooms · 3 baths · 8 guests",
    photo: PHOTOS[1]!,
  },
  {
    id: "home-pool",
    name: "Pool House",
    city: "Topsail Beach",
    nightlyFrom: 390,
    subtitle: "5 bedrooms · 4 baths · 12 guests",
    photo: PHOTOS[2]!,
  },
];
export type FixtureAd = {
  id: string;
  name: string;
  homeId: string | null;
  approved: boolean;
  assigned: boolean;
  document: IdeaDocument;
};
export type Scenario = "empty" | "drafts" | "mixed" | "approved" | "assigned";

export function catalogCards(scenario: Scenario): CatalogCard[] {
  if (scenario === "empty") return [];
  return HOMES.map((home, index) => ({
    homeId: home.id,
    included: true,
    approved:
      scenario === "approved" ||
      scenario === "assigned" ||
      (scenario === "mixed" && index === 0),
    imageUrl: home.photo,
    title: `Room to reconnect in ${home.city}`,
    subtitle: home.subtitle,
    templateId: "catalog-place-plain",
    imagePosition: "center",
    showLogo: true,
    location: home.city,
    rating: 4.9,
    pills: ["Ocean views", "Book direct"],
  }));
}
export function adDrafts(scenario: Scenario): FixtureAd[] {
  if (scenario === "empty") return [];
  const records = HOMES.flatMap((home) =>
    (["static", "carousel"] as const).map((format) => ({ home, format })),
  );
  return [...records, { home: null, format: "carousel" as const }].map(
    ({ home, format }, index) => {
      const role = !home
        ? "hero_carousel"
        : format === "static"
          ? "hero_static"
          : "home_carousel";
      const photos = !home
        ? PHOTOS
        : format === "static"
          ? [home.photo]
          : [home.photo, ...PHOTOS.filter((p) => p !== home.photo)];
      return {
        id: `ad-${index}`,
        name: `${home?.name ?? "Featured homes"} · ${format === "static" ? "Static" : "Carousel"}`,
        homeId: home?.id ?? null,
        approved:
          scenario === "approved" ||
          scenario === "assigned" ||
          (scenario === "mixed" && index < 3),
        assigned:
          scenario === "assigned"
            ? index < 3
            : scenario === "mixed" && index === 0,
        document: {
          role,
          shapes: ["square", "story"],
          exportShapes: ["square", "story"],
          intendedPlacements: [
            "facebook-feed",
            "instagram-feed",
            "facebook-story",
            "instagram-story",
          ],
          copy: {
            headline: home ? `Make time for ${home.name}` : "Find your coast",
            body: "Long mornings, room for everyone, and the ocean just outside. Find your next stay and book direct.",
            description:
              home?.subtitle ?? "Three coastal homes. One easy getaway.",
            linkUrl: `${BRAND.website}/${home?.id ?? "homes"}`,
            callToAction: "BOOK_NOW",
          },
          copyOverrides: {},
          pool: PHOTOS.map((url) => ({ url })),
          cards: photos.map((url, cardIndex) => ({
            id: `slide-${index}-${cardIndex}`,
            source: { url },
            mode: "compose",
            recipe: {
              ...defaultIdeaRecipe(role),
              title: home ? "Make room for the coast" : HOMES[cardIndex]!.name,
              subtitle: home?.subtitle ?? HOMES[cardIndex]!.subtitle,
              showLogo: false,
            },
            overrides: {},
            copy: { headline: home?.name ?? HOMES[cardIndex]!.name },
          })),
        },
      };
    },
  );
}
export function artworkUrl(card: IdeaImage, shape: IdeaShape) {
  if (card.sourceOverrides?.[shape] === null) return "";
  const url = card.sourceOverrides?.[shape]?.url ?? card.source.url;
  if (url.startsWith("data:image/")) return url;
  const recipe = ideaRecipe(card, shape);
  const params = new URLSearchParams({
    photo: String(
      Math.max(
        0,
        PHOTOS.indexOf(card.sourceOverrides?.[shape]?.url ?? card.source.url),
      ),
    ),
    templateId: card.mode === "supplied" ? "photo-only" : recipe.templateId,
    formatId: shape,
    title: recipe.title,
    subtitle: recipe.subtitle,
    eyebrow: recipe.eyebrow,
    cta: recipe.cta,
    imagePosition: recipe.imagePosition,
    mark: recipe.showLogo ? "auto" : "none",
  });
  return `/lab/performance-board/creative-workspaces/artwork?${params}`;
}
export function catalogArtworkUrl(card: CatalogCard) {
  const params = new URLSearchParams({
    photo: String(Math.max(0, PHOTOS.indexOf(card.imageUrl))),
    templateId: card.mode === "finished" ? "photo-only" : card.templateId,
    formatId: "square",
    title: card.title,
    subtitle: card.subtitle,
    imagePosition: card.imagePosition,
    location: card.location ?? "",
    mark: card.showLogo ? "auto" : "none",
  });
  return `/lab/performance-board/creative-workspaces/artwork?${params}`;
}
