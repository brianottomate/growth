import { z } from "zod";
import { ideaDocumentSchema, type IdeaDocument } from "./ad-idea-studio";
import { metaPlacementSchema } from "./meta-placement-plan";
import type { StarterHome } from "./starter-ad-ideas";

export const starterGenerationSchema = z.object({
  campaignId: z.string().min(1),
  homeIds: z.array(z.string().min(1)).min(1).max(10),
  intendedPlacements: z.array(metaPlacementSchema).min(1).max(6),
});
export const generatedCopySchema = z.object({
  headline: z.string().min(1).max(70),
  body: z.string().min(1).max(1200),
});
const layoutSchema = z.object({
  templateId: z.enum(["image-hero", "hero-overlay", "editorial-overlay"]),
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
    .max(5),
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
  const recipe = (layout: GeneratedHome["cards"][number]["layout"]) => ({
    ...layout,
    eyebrow: "",
    cta: "",
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
      recipe: recipe(card.layout),
      overrides: hasVertical ? { story: recipe(card.storyLayout) } : {},
    };
  });
  return ideaDocumentSchema.parse({
    role: format === "static" ? "hero_static" : "home_carousel",
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
