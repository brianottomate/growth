import { META_PLACEMENTS, metaPlacementSchema } from "./meta-placement-plan";
import { z } from "zod";
import type {
  AdCreativeContent,
  AdPlacements,
  AdCard,
} from "@/server/db/ads-schema";
import { compositionTemplateIdSchema } from "./compositions";

export const IDEA_SHAPES = ["portrait", "square", "story", "wide"] as const;
export const IDEA_SHAPE_LABELS = {
  portrait: "Portrait · 4:5",
  square: "Square · 1:1",
  story: "Story · 9:16",
  wide: "Landscape · 16:9",
};
export const ideaShapeSchema = z.enum(IDEA_SHAPES);
export const ideaExportShapesSchema = z
  .array(ideaShapeSchema)
  .min(1)
  .max(4)
  .refine(
    (shapes) => new Set(shapes).size === shapes.length,
    "Choose each size once",
  );
export type IdeaShape = z.infer<typeof ideaShapeSchema>;
export const ideaRecipeSchema = z.object({
  templateId: compositionTemplateIdSchema,
  title: z.string().max(120),
  subtitle: z.string().max(220),
  eyebrow: z.string().max(40),
  cta: z.string().max(60),
  showLogo: z.boolean(),
  imagePosition: z.enum(["top", "center", "bottom"]),
});
export type IdeaRecipe = z.infer<typeof ideaRecipeSchema>;
export const ideaCopySchema = z.object({
  headline: z.string().max(300),
  body: z.string().max(5000),
  /** Meta's grey line under the headline; empty lets Meta scrape the page. */
  description: z.string().max(120).optional(),
  linkUrl: z.union([z.string().url(), z.literal("")]),
  callToAction: z.string().max(60),
});
/** One carousel card's own words on Meta; blank falls back to the ad's. */
export const ideaCardCopySchema = z.object({
  headline: z.string().max(300).optional(),
  description: z.string().max(120).optional(),
});
export const ideaSourceSchema = z.object({
  label: z.string().optional(),
  homeId: z.string().optional(),
  assetId: z.string().optional(),
  url: z.string().min(1),
});
// Missing means inherit; null explicitly means awaiting artwork.
export const ideaSourceOverridesSchema = z.partialRecord(
  ideaShapeSchema,
  ideaSourceSchema.nullable(),
);
export const ideaDocumentSchema = z
  .object({
    role: z.enum(["hero_carousel", "hero_static", "home_carousel"]),
    shapes: z.array(ideaShapeSchema).min(1).max(4),
    exportShapes: z.array(ideaShapeSchema).max(4).optional(),
    intendedPlacements: z
      .array(metaPlacementSchema)
      .max(META_PLACEMENTS.length)
      .optional(),
    copy: ideaCopySchema,
    copyOverrides: z.partialRecord(ideaShapeSchema, ideaCopySchema),
    pool: z.array(ideaSourceSchema).optional(),
    cards: z
      .array(
        z.object({
          id: z.string().min(1),
          source: ideaSourceSchema,
          sourceOverrides: ideaSourceOverridesSchema.optional(),
          mode: z.enum(["supplied", "compose"]),
          recipe: ideaRecipeSchema,
          overrides: z.partialRecord(ideaShapeSchema, ideaRecipeSchema),
          copy: ideaCardCopySchema.optional(),
        }),
      )
      .max(10),
  })
  .superRefine((doc, ctx) => {
    if (new Set(doc.shapes).size !== doc.shapes.length)
      ctx.addIssue({ code: "custom", message: "Choose each shape once" });
    if (new Set(doc.cards.map((card) => card.id)).size !== doc.cards.length)
      ctx.addIssue({ code: "custom", message: "Each card needs a unique id" });
    if (doc.role === "hero_static" && doc.cards.length > 1)
      ctx.addIssue({ code: "custom", message: "A static holds one image" });
  });
export type IdeaDocument = z.infer<typeof ideaDocumentSchema>;
export type IdeaImage = IdeaDocument["cards"][number];
export type IdeaStudio = {
  document: IdeaDocument;
  approval?: {
    approvedAt: string;
    approvedBy: string;
    sourceVersion: string;
    renders: Partial<
      Record<IdeaShape, { assetId: string; url: string; reused?: true }[]>
    >;
  };
};
export const ideaSaveSchema = z.object({
  adId: z.string().min(1),
  expectedUpdatedAt: z.string().datetime(),
  name: z.string().trim().min(1).max(300),
  reviewImportedCreative: z.boolean().optional(),
  document: ideaDocumentSchema,
});
// Starting recipes remain editable per slide.
export const IDEA_DEFAULT_TEMPLATES = {
  hero_carousel: "hero-overlay",
  hero_static: "hero-overlay",
  home_carousel: "image-hero",
} as const;
export function defaultIdeaRecipe(role: IdeaDocument["role"]): IdeaRecipe {
  return {
    templateId: IDEA_DEFAULT_TEMPLATES[role],
    title: "",
    subtitle: "",
    eyebrow: "",
    cta: "",
    showLogo: true,
    imagePosition: "center",
  };
}
export function ideaDocumentFromAd(ad: {
  name: string;
  content: AdCreativeContent;
}): IdeaDocument {
  if (ad.content.ideaStudio)
    return withIdeaPool(ad.content.ideaStudio.document);
  const c = ad.content;
  const role =
    c.format === "static" || (!c.format && c.media.length <= 1)
      ? "hero_static"
      : /hero carousel/i.test(ad.name)
        ? "hero_carousel"
        : "home_carousel";
  return withIdeaPool({
    role,
    shapes: ["portrait"],
    copy: {
      headline: c.headline ?? "",
      body: c.body ?? "",
      ...(c.description ? { description: c.description } : {}),
      linkUrl: c.linkUrl ?? "",
      callToAction: c.callToAction ?? "BOOK_NOW",
    },
    copyOverrides: {},
    cards: c.media.map((media, index) => {
      const recipe = defaultIdeaRecipe(role);
      let source = { url: media.url, assetId: media.assetId };
      let mode: IdeaImage["mode"] = "supplied";
      const url = new URL(media.url, "http://local");
      if (url.pathname === "/api/compositions/preview") {
        const p = url.searchParams;
        const template = compositionTemplateIdSchema.safeParse(
          p.get("templateId"),
        );
        if (template.success) recipe.templateId = template.data;
        for (const key of ["title", "subtitle", "eyebrow", "cta"] as const)
          recipe[key] = p.get(key) ?? "";
        recipe.showLogo = p.get("mark") !== "none";
        const position = p.get("imagePosition");
        if (position === "top" || position === "bottom")
          recipe.imagePosition = position;
        source = {
          url: p.get("sourceUrl") ?? media.url,
          assetId: p.get("sourceMediaAssetId") ?? undefined,
        };
        mode = c.photoOnly ? "supplied" : "compose";
      }
      const copy =
        media.headline || media.description
          ? { headline: media.headline, description: media.description }
          : undefined;
      return {
        id: `card-${index}`,
        source,
        recipe,
        mode,
        overrides: {},
        ...(copy ? { copy } : {}),
      };
    }),
  });
}
export type IdeaSource = z.infer<typeof ideaSourceSchema>;
export function sameIdeaSource(a: IdeaSource, b: IdeaSource) {
  return a.url === b.url || Boolean(a.assetId && a.assetId === b.assetId);
}
/** Preserve candidates independently of selection, including size-specific artwork. */
export function withIdeaPool(
  document: IdeaDocument,
  additions: IdeaSource[] = [],
): IdeaDocument {
  const pool: IdeaSource[] = [];
  const sources = [
    ...(document.pool ?? []),
    ...document.cards.flatMap((card) => [
      card.source,
      ...Object.values(card.sourceOverrides ?? {}).filter(
        (source) => source != null,
      ),
    ]),
    ...additions,
  ];
  for (const source of sources) {
    const existing = pool.findIndex((item) => sameIdeaSource(item, source));
    if (existing < 0) pool.push(source);
    else pool[existing] = { ...pool[existing], ...source };
  }
  return { ...document, pool };
}
export function ideaRecipe(card: IdeaImage, shape: IdeaShape) {
  return card.overrides[shape] ?? card.recipe;
}
export function ideaSource(card: IdeaImage, shape: IdeaShape) {
  const override = card.sourceOverrides?.[shape];
  return override === undefined ? card.source : override;
}
/** An approved idea whose every size has its saved images. */
export function ideaImagesSaved(studio: IdeaStudio) {
  const { document, approval } = studio;
  return Boolean(
    approval &&
    document.shapes.every(
      (shape) => approval.renders[shape]?.length === document.cards.length,
    ),
  );
}
export function ideaAwaitingArtwork(document: IdeaDocument) {
  return document.cards.some((card) =>
    document.shapes.some((shape) => ideaSource(card, shape) === null),
  );
}
export function ideaPreviewUrl(
  brandId: string,
  card: IdeaImage,
  shape: IdeaShape,
) {
  const source = ideaSource(card, shape);
  if (!source) return null;
  const r = ideaRecipe(card, shape);
  const params = new URLSearchParams({
    brandId,
    formatId: shape,
    templateId: card.mode === "supplied" ? "photo-only" : r.templateId,
    title: r.title,
    subtitle: r.subtitle,
    eyebrow: r.eyebrow,
    cta: r.cta,
    mark: r.showLogo ? "auto" : "none",
    imagePosition: r.imagePosition,
  });
  if (source.assetId) params.set("sourceMediaAssetId", source.assetId);
  else params.set("sourceUrl", source.url);
  return `/api/compositions/preview?${params}`;
}
/** In the editor, an unfinished composition still shows its source photo. */
export function ideaEditorPreviewUrl(
  brandId: string,
  card: IdeaImage,
  shape: IdeaShape,
) {
  const recipe = ideaRecipe(card, shape);
  const unfinished =
    card.mode === "compose" &&
    recipe.templateId !== "photo-only" &&
    !recipe.title.trim();
  return ideaPreviewUrl(
    brandId,
    unfinished ? { ...card, mode: "supplied" } : card,
    shape,
  );
}
export const IDEA_PLACEMENT_KEYS: Record<IdeaShape, string[]> = {
  portrait: ["meta_ads:facebook_feed", "meta_ads:instagram_feed"],
  square: [],
  story: ["meta_ads:story"],
  wide: ["meta_ads:landscape"],
};
/** A card's own Meta copy, trimmed; blank fields are left for the ad's. */
function cardCopy(card: IdeaImage): Pick<AdCard, "headline" | "description"> {
  const headline = card.copy?.headline?.trim();
  const description = card.copy?.description?.trim();
  return {
    ...(headline ? { headline } : {}),
    ...(description ? { description } : {}),
  };
}
/** Project the rich idea into existing ad content and placement fields; never discard the recipe. */
export function projectIdea(
  brandId: string,
  content: AdCreativeContent,
  studio: IdeaStudio,
  placements: AdPlacements | null,
) {
  const doc = studio.document;
  const result = { ...placements };
  for (const key of Object.values(IDEA_PLACEMENT_KEYS).flat())
    delete result[key];
  const cardsFor = (shape: IdeaShape): (AdCard | null)[] =>
    doc.cards.map((card) => {
      const frozen = studio.approval?.renders[shape]?.[doc.cards.indexOf(card)];
      const url =
        frozen?.url ??
        (studio.approval ? null : ideaPreviewUrl(brandId, card, shape));
      return url
        ? { type: "image", url, ...(frozen ? { assetId: frozen.assetId } : {}) }
        : null;
    });
  for (const shape of doc.shapes) {
    for (const key of IDEA_PLACEMENT_KEYS[shape])
      result[key] = {
        copy: doc.copyOverrides[shape] ?? doc.copy,
        cards: cardsFor(shape).map((card) =>
          card ? { ...card, via: "render" as const } : null,
        ),
      };
  }
  const baseShape = doc.shapes.includes("portrait")
    ? "portrait"
    : doc.shapes[0]!;
  const baseCopy = doc.copyOverrides[baseShape] ?? doc.copy;
  const stories = doc.shapes.includes("story") ? cardsFor("story") : [];
  const baseCards = cardsFor(baseShape);
  const next: AdCreativeContent = {
    ...content,
    ...baseCopy,
    // Cleared in the idea means cleared on the ad, not the old value kept.
    description: baseCopy.description?.trim() || undefined,
    photoOnly: false,
    format: doc.role === "hero_static" ? "static" : "carousel",
    ideaStudio: studio,
    media: baseCards.some((card) => card === null)
      ? []
      : baseCards.map((card, index) => ({
          ...card!,
          ...cardCopy(doc.cards[index]!),
          ...(stories[index]
            ? { story: { ...stories[index], via: "render" as const } }
            : {}),
        })),
  };
  return { content: next, placements: result };
}
