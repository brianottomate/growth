import { z } from "zod";
import {
  IDEA_SHAPES,
  ideaDocumentSchema,
  type IdeaDocument,
} from "./ad-idea-studio";
import { META_PLACEMENTS, metaPlacementSchema } from "./meta-placement-plan";
import type { StarterHome } from "./starter-ad-ideas";

export const starterGenerationSchema = z.object({
  campaignId: z.string().min(1),
  source: z.enum(["featured", "brand"]).default("featured"),
  homeIds: z.array(z.string().min(1)).max(10),
  intendedPlacements: z
    .array(metaPlacementSchema)
    .min(1)
    .max(META_PLACEMENTS.length),
});
export const generatedCopySchema = z.object({
  headline: z.string().min(1).max(70),
  body: z.string().min(1).max(1200),
  /** Meta's grey line under the headline. */
  description: z.string().max(60),
});
const layoutSchema = z.object({
  title: z.string().min(1).max(65),
  subtitle: z.string().max(100),
  imagePosition: z.enum(["top", "center", "bottom"]),
});
export const generatedHomeSchema = z.object({
  copy: generatedCopySchema,
  cards: z
    .array(
      z.object({
        photoIndex: z.number().int().min(1),
        layout: layoutSchema,
        storyLayout: layoutSchema,
      }),
    )
    .min(1)
    .max(10),
});
export type GeneratedHome = z.infer<typeof generatedHomeSchema>;

/** Only selected, real photos can become editable ad cards. */
export function generatedDocument(
  home: StarterHome,
  generated: GeneratedHome,
  placements: z.infer<typeof metaPlacementSchema>[],
  format: "static" | "carousel",
): IdeaDocument {
  const selected =
    format === "static" ? generated.cards.slice(0, 1) : generated.cards;
  const hasVertical = placements.some((p) => !p.endsWith("feed"));
  const hasFeed = placements.some((p) => p.endsWith("feed"));
  const recipe = (
    layout: GeneratedHome["cards"][number]["layout"],
    hero: boolean,
    story = false,
  ) => ({
    ...layout,
    templateId: hero
      ? story
        ? ("tall-statement" as const)
        : ("hero-overlay" as const)
      : ("image-hero" as const),
    eyebrow: "",
    cta: hero ? "Explore your next escape" : "",
    showLogo: true,
  });
  const cards = selected.map((card, i) => {
    const source = home.photos[card.photoIndex - 1];
    if (!source)
      throw new Error(
        `Photo ${card.photoIndex} is not in ${home.name}'s contact sheet`,
      );
    return {
      id: `card-${i + 1}`,
      source,
      mode: "compose" as const,
      recipe: recipe(card.layout, i === 0 || i === selected.length - 1),
      overrides: hasVertical
        ? {
            story: recipe(
              card.storyLayout,
              i === 0 || i === selected.length - 1,
              true,
            ),
          }
        : {},
    };
  });
  return ideaDocumentSchema.parse({
    role: format === "static" ? "hero_static" : "home_carousel",
    exportShapes: [...IDEA_SHAPES],
    shapes: [
      ...(hasFeed ? ["portrait"] : []),
      ...(hasVertical ? ["story"] : []),
    ],
    intendedPlacements: placements,
    copy: { ...generated.copy, linkUrl: home.url, callToAction: "BOOK_NOW" },
    copyOverrides: {},
    pool: home.photos,
    cards,
  });
}

export const brandStarterCopySchema = z.object({
  ideas: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        format: z.enum(["static", "carousel"]),
        headline: z.string().min(1).max(70),
        body: z.string().min(1).max(1200),
        description: z.string().max(60),
      }),
    )
    .length(3),
});
