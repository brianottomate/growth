import { z } from "zod";
import {
  COMPOSITION_FORMATS,
  compositionFormatIdSchema,
  compositionImagePositionSchema,
  compositionTemplateIdSchema,
  type CompositionFormatId,
} from "./compositions";
import { homeCatalogCopy, place, ratingOutOfFive } from "./home-ad-previews";
import { marketOf, type BrandMarkets } from "./markets";
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
  imagePosition: compositionImagePositionSchema,
  showLogo: z.boolean(),
  /** The home's guest rating out of 5, for the catalog-place pill. */
  rating: z.number().nullable().optional(),
  /** Amenity pills, drawn by the amenities cards. */
  pills: z.array(z.string()).optional(),
  /** "Louisville, KY": the place tag on the amenities-and-place card. */
  location: z.string().optional(),
  /** Signed off as it stands now; derived on read, never saved from a client. */
  approved: z.boolean().optional(),
});
export type CatalogCard = z.infer<typeof catalogCardSchema>;
/** The canvas a catalog runs in. Meta shows catalog tiles square, so 4:5 is retired. */
export const CATALOG_FORMATS = ["square"] as const;
export type CatalogFormatId = (typeof CATALOG_FORMATS)[number];

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
  finished?: {
    assetId: string;
    url: string;
    /** The canvas the image is, read off its pixels; unknown when unmeasured. */
    format?: CompositionFormatId | null;
  } | null;
  excluded?: boolean;
  /** Amenity pills chosen for the amenities cards. */
  pills?: string[] | null;
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
    /** What the image was drawn from; an unchanged card reuses it. */
    renderKey?: string;
    /** Copied from the previous export rather than drawn again. */
    reused?: boolean;
  }[];
  rows?: HotelFeedRow[];
  /** What the export's cards are: "Supplied artwork", "Catalog · destination". */
  label?: string;
};
/**
 * The headline a card carries until someone writes a better one. Plain and
 * never wrong on purpose: a real headline comes from the listing, written by
 * the chat, and nothing exports until a person approves the card.
 */
/** The catalog templates a brand can default to. */
export const CATALOG_TEMPLATES = [
  "catalog-place-plain",
  "catalog-place",
  "catalog-copy",
  "catalog-amenities",
  "catalog-amenities-place",
  "catalog-destination",
  "catalog-headline",
] as const;

/** The card a brand's catalog uses until someone picks another. */
export const DEFAULT_CATALOG_TEMPLATE = "catalog-place-plain" as const;
/**
 * The composition canvas an image's pixels match, within a percent. Supplied
 * artwork is labelled by what it is, so a 4:5 file on a square catalog is
 * caught before export rather than shipped as a square.
 */
export function artworkFormat(
  width: number | null | undefined,
  height: number | null | undefined,
): CompositionFormatId | null {
  if (!width || !height) return null;
  const ratio = width / height;
  return (
    COMPOSITION_FORMATS.find(
      (f) => Math.abs(f.width / f.height - ratio) / ratio < 0.01,
    )?.id ?? null
  );
}

/** The canvas every catalog is drawn and exported at. */
export const DEFAULT_CATALOG_FORMAT = "square" as const;

/** The place cards: "{lead} in {place}", with or without the rating pill. */
export const isPlaceCard = (templateId: string) =>
  templateId === "catalog-place" || templateId === "catalog-place-plain";

/** Catalog cards that draw amenity pills. */
export const drawsPills = (templateId: string) =>
  templateId.startsWith("catalog-amenities") ||
  templateId === "catalog-destination";
/** Catalog cards that print the location themselves. */
export const drawsLocation = (templateId: string) =>
  templateId === "catalog-amenities-place" ||
  templateId === "catalog-destination" ||
  templateId === "catalog-headline";
export type CatalogTemplateId = (typeof CATALOG_TEMPLATES)[number];

/** The Studio's batch passes: Rewrite copy, and Fix photos + copy. */
export const CATALOG_WRITE_PASSES = ["copy", "photosAndCopy"] as const;
export type CatalogWritePass = (typeof CATALOG_WRITE_PASSES)[number];

/** Where a card says the home is: its market's label, else its own town. */
export function catalogLocation(
  home: CatalogHome,
  markets?: BrandMarkets | null,
) {
  return marketOf(markets, home.city)?.label ?? place(home);
}

export function catalogBaselineTitle(
  home: CatalogHome,
  templateId: CatalogCard["templateId"] = DEFAULT_CATALOG_TEMPLATE,
  markets?: BrandMarkets | null,
) {
  const where = isPlaceCard(templateId) ? catalogLocation(home, markets) : null;
  const lead = home.guests ? `Sleeps ${home.guests}` : "Vacation home";
  return where ? `${lead} in ${where}` : lead;
}

/**
 * Amenities a guest picks a home for, most pulling first: the pills a card
 * shows until New copy chooses its own.
 */
const PILL_PULL = [
  /sauna/i,
  /hot tub/i,
  /pool/i,
  /soaking tub/i,
  /lake|river|ocean|mountain|city view|view/i,
  /fireplace|fire pit/i,
  /game room|arcade|billiard|pool table/i,
  /pet/i,
  /elevator/i,
  /parking/i,
];

export function defaultCatalogPills(home: CatalogHome) {
  const amenities = home.amenities ?? [];
  const picked: string[] = [];
  for (const pull of PILL_PULL) {
    const hit = amenities.find((a) => pull.test(a) && !picked.includes(a));
    if (hit && hit.length <= 24) picked.push(hit);
    if (picked.length === 3) break;
  }
  return picked;
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
    // Only cards that draw them: earlier fingerprints stay valid.
    ...(drawsPills(card.templateId)
      ? [card.pills ?? [], card.location ?? null]
      : []),
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
  defaultTemplate: CatalogTemplateId = DEFAULT_CATALOG_TEMPLATE,
  /** The brand's markets: a card's location is its market's label. */
  markets?: BrandMarkets | null,
  /** The canvas every card is drawn and exported at. */
  format: CatalogFormatId = DEFAULT_CATALOG_FORMAT,
): CatalogDraft {
  return {
    formats: [format],
    primaryFormat: format,
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
                  format: o.finished.format ?? format,
                },
              }
            : {}),
          imageUrl: o.image?.url ?? home.imageUrl!,
          ...(o.image ? { assetId: o.image.assetId } : {}),
          templateId,
          title: o.title ?? catalogBaselineTitle(home, templateId, markets),
          subtitle: o.subtitle ?? copy.subtitle,
          imagePosition: o.imagePosition ?? "center",
          showLogo: o.showLogo ?? true,
          rating: ratingOutOfFive(home.rating),
          pills: o.pills ?? defaultCatalogPills(home),
          location: catalogLocation(home, markets) || undefined,
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
  pills?: string[];
  location?: string;
} {
  // The amenities cards draw pills (and a location) instead of the rating.
  const amenities = drawsPills(card.templateId);
  const base = {
    subtitle: card.subtitle,
    ...(card.rating && !amenities ? { rating: card.rating } : {}),
    ...(amenities && card.pills?.length ? { pills: card.pills } : {}),
    ...(drawsLocation(card.templateId) && card.location
      ? { location: card.location }
      : {}),
  };
  if (!isPlaceCard(card.templateId)) return { ...base, title: card.title };
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
  if (!isPlaceCard(templateId)) return null;
  const at = title.lastIndexOf(" in ");
  if (at <= 0 || at + 3 <= CATALOG_PLACE_LEAD_MAX) return null;
  return `"${title.slice(0, at)}" is too long for this card: keep the part before " in" to ${CATALOG_PLACE_LEAD_MAX - 3} characters, ideally 28 so it stays on two lines`;
}

/**
 * The URL a card draws at: its finished artwork, or its composition on the
 * canvas the catalog runs in. Shared by the Catalog tab and the server-side
 * portfolio review, so both see the same card.
 */
export function catalogCardPreviewUrl(
  brandId: string,
  card: CatalogCard,
  formatId: CatalogFormatId = DEFAULT_CATALOG_FORMAT,
) {
  if (card.mode === "finished") return card.finishedArtwork?.url;
  const copy = catalogCardCopy(card);
  const params = new URLSearchParams({
    brandId,
    templateId: card.templateId,
    formatId,
    title: copy.title,
    subtitle: copy.subtitle,
    imagePosition: card.imagePosition,
    mark: card.showLogo ? "auto" : "none",
  });
  if (copy.eyebrow) params.set("eyebrow", copy.eyebrow);
  if (
    copy.rating &&
    !drawsPills(card.templateId) &&
    card.templateId !== "catalog-place-plain"
  )
    params.set("rating", String(copy.rating));
  if (drawsPills(card.templateId))
    for (const pill of card.pills ?? []) params.append("pill", pill);
  if (drawsLocation(card.templateId) && card.location)
    params.set("location", card.location);
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

/** Never synthesize another size or apply a composition to supplied artwork. */
export function catalogArtworkIssues(draft: CatalogDraft): string[] {
  const finished = draft.cards.filter(
    (c) => c.included && c.mode === "finished",
  );
  const missing = finished.filter((c) => !c.finishedArtwork).length;
  const wrongSize = finished.filter(
    (c) =>
      c.finishedArtwork &&
      draft.formats.some((f) => f !== c.finishedArtwork!.format),
  ).length;
  const cards = (n: number) => `${n} card${n === 1 ? "" : "s"}`;
  return [
    ...(missing ? [`${cards(missing)} need finished artwork`] : []),
    ...(wrongSize
      ? [
          `${cards(wrongSize)} have finished artwork in another size than this ${draft.formats.join(" + ")} catalog: upload it in that size or switch to Compose`,
        ]
      : []),
  ];
}
