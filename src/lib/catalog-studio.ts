import { z } from "zod";
import {
  compositionFormatIdSchema,
  compositionTemplateIdSchema,
  type CompositionFormatId,
} from "./compositions";
import { homeCatalogCopy, place, ratingOutOfFive } from "./home-ad-previews";
import {
  hotelFeedRows,
  type HotelFeedHome,
  type HotelFeedRow,
} from "./meta-hotel-feed";

export const catalogCardSchema = z.object({
  homeId: z.string().min(1),
  mode: z.enum(["compose", "finished"]).optional(),
  finishedArtwork: z
    .object({
      assetId: z.string().min(1),
      url: z.string().url(),
      format: compositionFormatIdSchema,
    })
    .optional(),
  included: z.boolean(),
  imageUrl: z.string().url(),
  assetId: z.string().optional(),
  templateId: compositionTemplateIdSchema,
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().max(220),
  imagePosition: z.enum(["top", "center", "bottom"]),
  showLogo: z.boolean(),
  /** The home's guest rating out of 5, for the catalog-place pill. */
  rating: z.number().nullable().optional(),
  /** Signed off as it stands now; derived on read, never saved from a client. */
  approved: z.boolean().optional(),
});
export type CatalogCard = z.infer<typeof catalogCardSchema>;
export type CatalogDraft = {
  cards: CatalogCard[];
  formats: CompositionFormatId[];
  primaryFormat: CompositionFormatId;
};
/**
 * One home's catalog decisions, as its `home` row stores them. Anything null
 * or absent is the default the card computes: the amenity headline, the
 * bed/bath/guest line, the hero photo, the catalog-place template.
 */
export type CatalogOverrides = {
  title?: string | null;
  subtitle?: string | null;
  templateId?: CatalogCard["templateId"] | null;
  imagePosition?: CatalogCard["imagePosition"] | null;
  showLogo?: boolean | null;
  /** A library image the card draws on instead of the hero. */
  image?: { assetId: string; url: string } | null;
  mode?: "compose" | "finished" | null;
  /** Supplied artwork a finished card uses as-is. */
  finished?: { assetId: string; url: string } | null;
  excluded?: boolean;
};
export type CatalogHome = HotelFeedHome & {
  rating?: number;
  thumbUrl?: string;
  gallery?: { url: string; thumbUrl: string }[];
};
export type CatalogExport = {
  id: string;
  status: string;
  createdAt: string;
  error: string | null;
  folderId?: string;
  completed?: number;
  total?: number;
  assets?: {
    homeId: string;
    name: string;
    assetId: string;
    url: string;
    format: string;
  }[];
  rows?: HotelFeedRow[];
};
/**
 * The headline a card carries until someone writes a better one. Plain and
 * never wrong on purpose: a real headline comes from the listing, written by
 * the chat, and nothing exports until a person approves the card.
 */
/** The catalog templates a brand can default to. */
export const CATALOG_TEMPLATES = ["catalog-place", "catalog-copy"] as const;
export type CatalogTemplateId = (typeof CATALOG_TEMPLATES)[number];

export function catalogBaselineTitle(
  home: CatalogHome,
  templateId: CatalogCard["templateId"] = "catalog-place",
) {
  const where = templateId === "catalog-place" ? place(home) : null;
  const lead = home.guests ? `Sleeps ${home.guests}` : "Vacation home";
  return where ? `${lead} in ${where}` : lead;
}

/** What a card shows, as one string: approval holds while this is unchanged. */
export function catalogCardFingerprint(card: CatalogCard) {
  // Supplied artwork is the whole card; the fields it does not draw can
  // change without touching what was approved.
  if (card.mode === "finished")
    return JSON.stringify(["finished", card.finishedArtwork?.assetId ?? null]);
  return JSON.stringify([
    card.mode ?? "compose",
    card.finishedArtwork?.assetId ?? null,
    card.imageUrl,
    card.assetId ?? null,
    card.templateId,
    card.title,
    card.subtitle,
    card.imagePosition,
    card.showLogo,
  ]);
}

/** The included cards nobody has signed off in their current state. */
export const catalogUnapproved = (draft: CatalogDraft) =>
  draft.cards.filter((card) => card.included && !card.approved);

/**
 * Every home's card: its computed defaults with its overrides on top. The
 * defaults are recomputed on every read, so a better headline rule or a new
 * hero reaches each card nobody changed. Portrait only for now.
 */
export function catalogDraft(
  homes: CatalogHome[],
  overrides: ReadonlyMap<string, CatalogOverrides> = new Map(),
  approvals: ReadonlyMap<string, string> = new Map(),
  /** The brand's default card, for every home without its own. */
  defaultTemplate: CatalogTemplateId = "catalog-place",
): CatalogDraft {
  return {
    formats: ["portrait"],
    primaryFormat: "portrait",
    cards: homes
      .filter((h) => h.imageUrl)
      .map((home): CatalogCard => {
        const copy = homeCatalogCopy(home);
        const o = overrides.get(home.id) ?? {};
        const templateId = o.templateId ?? defaultTemplate;
        const card: CatalogCard = {
          homeId: home.id,
          included: !o.excluded,
          ...(o.mode ? { mode: o.mode } : {}),
          ...(o.finished
            ? {
                finishedArtwork: {
                  assetId: o.finished.assetId,
                  url: o.finished.url,
                  format: "portrait",
                },
              }
            : {}),
          imageUrl: o.image?.url ?? home.imageUrl!,
          ...(o.image ? { assetId: o.image.assetId } : {}),
          templateId,
          title: o.title ?? catalogBaselineTitle(home, templateId),
          subtitle: o.subtitle ?? copy.subtitle,
          imagePosition: o.imagePosition ?? "center",
          showLogo: o.showLogo ?? true,
          rating: ratingOutOfFive(home.rating),
        };
        return {
          ...card,
          approved: approvals.get(home.id) === catalogCardFingerprint(card),
        };
      }),
  };
}

/**
 * The copy fields a card's template draws. The card stores one headline
 * ("Rooftop deck in Louisville, KY") so editing and every template share it.
 * Catalog-place sets the lead-in and the place apart, so there the headline
 * splits on its last " in ": the lead-in keeps the "in", which the renderer
 * hands over to the place line. A headline with no " in " is all place.
 */
export function catalogCardCopy(card: CatalogCard): {
  title: string;
  eyebrow?: string;
  subtitle: string;
  rating?: number;
} {
  const base = {
    subtitle: card.subtitle,
    ...(card.rating ? { rating: card.rating } : {}),
  };
  if (card.templateId !== "catalog-place")
    return { ...base, title: card.title };
  const at = card.title.lastIndexOf(" in ");
  if (at <= 0) return { ...base, title: card.title };
  return {
    ...base,
    eyebrow: card.title.slice(0, at + 3),
    title: card.title.slice(at + 4),
  };
}

/** The longest "{lead} in" the catalog-place template can draw. */
export const CATALOG_PLACE_LEAD_MAX = 40;

/**
 * Why a headline cannot be drawn on this template, or null. catalog-place
 * prints "{lead} in" as its eyebrow, which the composition caps, so a longer
 * lead saves fine and then renders nothing.
 */
export function catalogHeadlineIssue(
  title: string,
  templateId: CatalogCard["templateId"],
) {
  if (templateId !== "catalog-place") return null;
  const at = title.lastIndexOf(" in ");
  if (at <= 0 || at + 3 <= CATALOG_PLACE_LEAD_MAX) return null;
  return `"${title.slice(0, at)}" is too long for this card: keep the part before " in" to ${CATALOG_PLACE_LEAD_MAX - 3} characters, ideally 28 so it stays on two lines`;
}

/**
 * The URL a card draws at: its finished artwork, or its composition on the
 * portrait canvas the catalog runs in. Shared by the Catalog tab and the
 * server-side portfolio review, so both see the same card.
 */
export function catalogCardPreviewUrl(brandId: string, card: CatalogCard) {
  if (card.mode === "finished") return card.finishedArtwork?.url;
  const copy = catalogCardCopy(card);
  const params = new URLSearchParams({
    brandId,
    templateId: card.templateId,
    formatId: "portrait",
    title: copy.title,
    subtitle: copy.subtitle,
    imagePosition: card.imagePosition,
    mark: card.showLogo ? "auto" : "none",
  });
  if (copy.eyebrow) params.set("eyebrow", copy.eyebrow);
  if (copy.rating) params.set("rating", String(copy.rating));
  params.set(
    card.assetId ? "sourceMediaAssetId" : "sourceUrl",
    card.assetId ?? card.imageUrl,
  );
  return `/api/compositions/preview?${params}`;
}

/** One feed row per included home, using only its frozen primary image. */
export function catalogExportRows(
  homes: CatalogHome[],
  draft: CatalogDraft,
  assets: NonNullable<CatalogExport["assets"]>,
  brandName: string,
) {
  return hotelFeedRows(
    draft.cards
      .filter((c) => c.included)
      .map((card) => {
        const home = homes.find((h) => h.id === card.homeId);
        const asset = assets.find(
          (a) => a.homeId === card.homeId && a.format === draft.primaryFormat,
        );
        if (!home || !asset)
          throw new Error("A catalog home is missing its frozen primary image");
        return { ...home, imageUrl: asset.url };
      }),
    brandName,
  );
}

// Meta hotel feed field names (distinct from an ecommerce product feed).
export const CATALOG_FEED_COLUMNS = [
  "hotel_id",
  "name",
  "description",
  "brand",
  "url",
  "image[0].url",
  "address.addr1",
  "address.postal_code",
  "address.city",
  "address.region",
  "address.country",
  "latitude",
  "longitude",
  "base_price",
] as const;
export function catalogFeedCells(row: HotelFeedRow) {
  return [
    row.id,
    row.title,
    row.description,
    row.brand,
    row.link,
    row.imageUrl,
    [row.streetAddress, row.streetAddress2, row.streetAddress3]
      .filter(Boolean)
      .join(", "),
    row.postalCode ?? "",
    row.city,
    row.region,
    row.country,
    row.latitude == null ? "" : String(row.latitude),
    row.longitude == null ? "" : String(row.longitude),
    row.price,
  ];
}
export function catalogFeedCsv(rows: HotelFeedRow[]) {
  const cell = (s: string) => `"${s.replaceAll('"', '""')}"`;
  return (
    [
      CATALOG_FEED_COLUMNS.join(","),
      ...rows.map((row) => catalogFeedCells(row).map(cell).join(",")),
    ].join("\r\n") + "\r\n"
  );
}

/** Never synthesize another size or apply a composition to supplied artwork. */
export function catalogArtworkIssues(draft: CatalogDraft): string[] {
  return draft.cards
    .filter((c) => c.included && c.mode === "finished")
    .flatMap((c) => {
      if (!c.finishedArtwork) return [`${c.title}: choose finished artwork`];
      return draft.formats.some((f) => f !== c.finishedArtwork!.format)
        ? [
            `${c.title}: finished artwork is available only in ${c.finishedArtwork.format}; export that size or switch to Compose`,
          ]
        : [];
    });
}
