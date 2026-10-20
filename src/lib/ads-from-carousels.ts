import { z } from "zod";
import {
  ideaCopySchema,
  ideaDocumentSchema,
  ideaExportShapesSchema,
  ideaSource,
  type IdeaDocument,
  type IdeaStudio,
} from "./ad-idea-studio";

export const adsFromCarouselsSchema = z.object({
  brandId: z.string().min(1),
  batchId: z.string().uuid(),
  adIds: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Choose each carousel once",
    ),
  shapes: ideaExportShapesSchema,
  heroCopy: ideaCopySchema.omit({ bookingTargetId: true }).optional(),
});

export type ApprovedCarousel = {
  homeId: string;
  homeName: string;
  studio: IdeaStudio;
};

/** A one-time copy of the opener. The new ads have no ongoing source link. */
export function adsFromCarousels(
  sources: ApprovedCarousel[],
  shapes: IdeaDocument["shapes"],
  heroCopy?: IdeaDocument["copy"],
) {
  if (!sources.length || sources.length > 10)
    throw new Error("Choose 1–10 approved home carousels.");
  if (new Set(sources.map((source) => source.homeId)).size !== sources.length)
    throw new Error("Choose one carousel per home.");
  if (heroCopy && sources.length < 2)
    throw new Error("Choose at least two homes for a Hero carousel.");
  const statics = sources.map(({ homeId, homeName, studio }) => {
    const first = studio.document.cards[0];
    if (!studio.approval || studio.document.role !== "home_carousel" || !first)
      throw new Error(`${homeName} needs an approved home carousel.`);
    if (shapes.some((shape) => ideaSource(first, shape) === null))
      throw new Error(`${homeName} is missing artwork for a selected size.`);
    const reuse = shapes.every((shape) => studio.approval?.renders[shape]?.[0]);
    const card = reuse
      ? {
          ...first,
          mode: "supplied" as const,
          source: {
            ...first.source,
            ...studio.approval.renders[shapes[0]!]![0]!,
          },
          sourceOverrides: {
            ...first.sourceOverrides,
            ...Object.fromEntries(
              shapes.map((shape) => [
                shape,
                {
                  ...first.source,
                  ...studio.approval!.renders[shape]![0]!,
                },
              ]),
            ),
          },
        }
      : structuredClone(first);
    const document = ideaDocumentSchema.parse({
      ...studio.document,
      role: "hero_static",
      shapes,
      exportShapes: shapes,
      cards: [card],
      pool: [card.source],
    });
    return { homeId, name: `${homeName} · Static`, document };
  });
  const hero = heroCopy
    ? ideaDocumentSchema.parse({
        role: "hero_carousel",
        shapes,
        exportShapes: shapes,
        copy: heroCopy,
        copyOverrides: {},
        cards: statics.map(({ document, homeId }, index) => ({
          ...document.cards[0]!,
          id: `home-${homeId}`,
          copy: {
            ...document.cards[0]!.copy,
            headline: sources[index]!.homeName.slice(0, 60),
            description:
              document.cards[0]!.copy?.description ?? document.copy.description,
            landingUrl:
              document.cards[0]!.copy?.landingUrl ||
              document.copy.linkUrl ||
              undefined,
            bookingTargetId:
              document.cards[0]!.copy?.bookingTargetId ||
              document.copy.bookingTargetId ||
              undefined,
          },
        })),
      })
    : undefined;
  return { statics, hero };
}
