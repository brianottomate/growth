import {
  IDEA_SHAPES,
  ideaDocumentFromAd,
  withIdeaPool,
  type IdeaShape,
} from "./ad-idea-studio";
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
  for (const idea of ideas) {
    const document = ideaDocumentFromAd(idea);
    document.exportShapes = [...IDEA_SHAPES];
    idea.content.ideaStudio = { document };
  }
  return ideas;
}

export type StarterHome = {
  id: string;
  curated?: boolean;
  name: string;
  url: string;
  photos: { url: string; assetId?: string; label?: string; homeId?: string }[];
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
        // One card per home, so each card's Meta headline names its home.
        media: homes.flatMap((h) =>
          h.photos[0]
            ? [{ ...h.photos[0], type: "image" as const, headline: h.name }]
            : [],
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
            .slice(0, format === "static" ? 1 : home.curated ? 10 : 6)
            .map((p) => ({ ...p, type: "image" as const })),
        },
      });
    }
  for (const idea of ideas) {
    const sources = idea.homeId
      ? homes
          .find((home) => home.id === idea.homeId)!
          .photos.slice(0, idea.content.media.length)
      : homes.flatMap((home) => home.photos.slice(0, 1));
    idea.content.ideaStudio = {
      document: withIdeaPool(ideaDocumentFromAd(idea), sources),
    };
  }
  for (const idea of ideas) {
    const document = ideaDocumentFromAd(idea);
    document.exportShapes = [...IDEA_SHAPES];
    idea.content.ideaStudio = { document };
  }
  return ideas;
}

/**
 * The sizes each format needs to run on Meta through Zernio with nothing to
 * fix after the push. Zernio's docs give no ratio advice, so this follows
 * the shape of its API (checked 2026-09-30, docs.zernio.com/platforms/
 * meta-ads/creatives) and Meta's specs; revisit both when Zernio changes:
 *
 * - A static goes out as one ad with `placementAssets`: a default image plus
 *   rules that pin other images to placements. 4:5 is the default (feeds),
 *   1:1 is pinned to Facebook's feed placements (marketplace, the right
 *   column and the desktop feed show a single image square), 9:16 to
 *   stories and reels.
 * - A carousel goes out as `carouselCards`: one set of cards, which Zernio
 *   will not combine with `placementAssets`. Meta crops carousel cards to
 *   square in many placements, so square cards are the only set that shows
 *   whole everywhere. A carousel given 4:5 and 9:16 sizes is still pushed,
 *   but then Growth swaps its cards per placement on the Graph API after the
 *   push (`setMetaCarouselPlacementCards`), which costs extra Meta calls.
 */
export const ZERNIO_NATIVE_SHAPES = {
  static: ["portrait", "square", "story"],
  carousel: ["square"],
} as const satisfies Record<"static" | "carousel", readonly IdeaShape[]>;

/**
 * Empty, Zernio-native shells for the featured homes: a static and a
 * carousel per home plus a hero carousel, each bound to its home and sized
 * by `ZERNIO_NATIVE_SHAPES`, with no images yet. For a client who sends
 * finished artwork: the shells say which sizes to supply.
 */
export function shellStarterAdIdeas(homes: StarterHome[]) {
  const ideas: {
    key: string;
    name: string;
    homeId?: string;
    content: AdCreativeContent;
  }[] = [
    {
      key: "hero-carousel",
      name: "Hero carousel",
      content: { format: "carousel", headline: "", body: "", media: [] },
    },
  ];
  for (const format of ["static", "carousel"] as const)
    for (const home of homes)
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
          media: [],
        },
      });
  for (const idea of ideas) {
    const document = ideaDocumentFromAd(idea);
    const shapes =
      ZERNIO_NATIVE_SHAPES[
        idea.content.format === "static" ? "static" : "carousel"
      ];
    document.shapes = [...shapes];
    document.exportShapes = [...shapes];
    idea.content.ideaStudio = { document };
  }
  return ideas;
}
