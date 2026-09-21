import { ideaDocumentFromAd, withIdeaPool } from "./ad-idea-studio";
import type { AdCreativeContent } from "@/server/db/ads-schema";

/** Editable placeholders only; the home labels do not claim real inventory. */
export function starterAdIdeas() {
  const ideas: { key: string; name: string; content: AdCreativeContent }[] = [
    {
      key: "hero-carousel",
      name: "Hero carousel",
      content: { format: "carousel", headline: "", body: "", media: [] },
    },
  ];
  for (const format of ["static", "carousel"] as const) {
    for (let home = 1; home <= 4; home++) {
      ideas.push({
        key: `home-${home}-${format}`,
        name: `Home ${home} · ${format === "static" ? "Static" : "Carousel"}`,
        content: {
          format,
          propertyName: `Home ${home}`,
          headline: "",
          body: "",
          media: [],
        },
      });
    }
  }
  return ideas;
}

export type StarterHome = {
  id: string;
  name: string;
  url: string;
  photos: { url: string; assetId?: string }[];
};
/** Known inventory fills the same draft model, without rendering files or inventing copy. */
export function featuredStarterAdIdeas(homes: StarterHome[]) {
  const ideas: {
    key: string;
    name: string;
    homeId?: string;
    content: AdCreativeContent;
  }[] = [
    {
      key: "hero-carousel",
      name: "Hero carousel",
      content: {
        format: "carousel",
        headline: "",
        body: "",
        media: homes.flatMap((h) =>
          h.photos[0] ? [{ ...h.photos[0], type: "image" as const }] : [],
        ),
      },
    },
  ];
  for (const format of ["static", "carousel"] as const)
    for (const home of homes) {
      ideas.push({
        key: `${home.id}-${format}`,
        homeId: home.id,
        name: `${home.name} · ${format === "static" ? "Static" : "Carousel"}`,
        content: {
          format,
          propertyName: home.name,
          headline: "",
          body: "",
          linkUrl: home.url,
          callToAction: "BOOK_NOW",
          media: home.photos
            .slice(0, format === "static" ? 1 : 6)
            .map((p) => ({ ...p, type: "image" as const })),
        },
      });
    }
  for (const idea of ideas) {
    const sources = idea.homeId
      ? homes
          .find((home) => home.id === idea.homeId)!
          .photos.slice(0, idea.content.format === "static" ? 1 : 6)
      : homes.flatMap((home) => home.photos.slice(0, 1));
    idea.content.ideaStudio = {
      document: withIdeaPool(ideaDocumentFromAd(idea), sources),
    };
  }
  return ideas;
}
