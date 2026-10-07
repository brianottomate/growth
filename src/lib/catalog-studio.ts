import { catalogAiReviewSchema } from "./ai-notes";
import { z } from "zod";
import {
  COMPOSITION_FORMATS,
  compositionFormatIdSchema,
  compositionImagePositionSchema,
  compositionTemplateIdSchema,
  type CompositionFormatId,
} from "./compositions";
import { homeCatalogCopy, place, ratingOutOfFive } from "./home-ad-previews";
import { rankAmenities } from "./home-amenities";
import { marketOf, type BrandMarkets } from "./markets";
import { hotelFeedRows, type HotelFeedHome } from "./meta-hotel-feed";

/** Copy fields accepted by the catalog editor and selectable copy suggestions. */
export const catalogCopyPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  subtitle: z.string().max(220).optional(),
  pills: z.array(z.string().trim().min(1).max(24)).max(4).optional(),
  adHeadline: z.string().trim().min(1).max(255).optional(),
  adDescription: z.string().trim().max(255).optional(),
});

export const catalogCardSchema = z.object({
  homeId: z.string().min(1),
  aiReview: catalogAiReviewSchema.optional(),
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
  /** What Meta shows under the card in the catalog ad: the home's name, as a guest would say it. */
  adHeadline: z.string().trim().min(1).max(255),
  /** The line under that headline: what the home is and what it costs. */
  adDescription: z.string().trim().min(1).max(255),
  /** Signed off as it stands now; derived on read, never saved from a client. */
  approved: z.boolean().optional(),
  ready: z.boolean().optional(),
});
export type CatalogCard = z.infer<typeof catalogCardSchema>;
/** The canvas a catalog runs in. Meta shows catalog tiles square, so 4:5 is retired. */
export const CATALOG_FORMATS = ["square"] as const;
export type CatalogFormatId = (typeof CATALOG_FORMATS)[number];

/**
 * The ad a catalog runs in, set once per catalog: the primary text above every
 * card. Each card's own headline and description sit on the card.
 */
export const catalogAdCopySchema = z.object({
  primaryText: z.string().trim().max(2200),
});
export type CatalogAdCopy = z.infer<typeof catalogAdCopySchema>;
export const defaultCatalogAdCopy = (brandName: string): CatalogAdCopy => ({
  // Kept apart from "escape" and "stay": brands are named Oasis Escapes and
  // Zion Stays, and "your next Oasis Escapes escape" shipped as a default.
  primaryText: `Find your next stay. Private homes from ${brandName}, booked direct.`,
});

/**
 * A listing title made into the name a guest would say: the part before a
 * "|" or the first sentence, no emoji, and not shouted. "DerbyCity Plush Loft.
 * Gather in Style by Hollyhock" becomes "DerbyCity Plush Loft".
 */
export function catalogAdHeadline(name: string, brandName?: string) {
  if (/^\d+$/.test(name.trim()) && brandName)
    return `${brandName} · ${name.trim()}`;
  let head = name.split(" | ")[0]!.split(/(?<=[a-z0-9]{3})\. |: /i)[0]!;
  head = head
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[\s!]+$/, "")
    .trim();
  // Shouted: letters, none of them lower case.
  if (/[A-Z]/.test(head) && !/[a-z]/.test(head))
    head = head
      .toLowerCase()
      .replace(
        /(^|[\s-])(\p{L})/gu,
        (_, gap: string, c: string) => gap + c.toUpperCase(),
      );
  if (head.length > 60) head = `${head.slice(0, 60).replace(/\s+\S*$/, "")}…`;
  return head || name.trim();
}

/**
 * The line under the ad headline, front-loaded because Meta cuts it after a
 * few words: where, how many it sleeps, and the amenity that sells it.
 */
export function catalogAdDescription(home: HotelFeedHome) {
  const where = [home.city, home.state].filter(Boolean).join(", ");
  const hook = rankAmenities(home.amenities)[0]?.hook;
  return (
    [where, home.guests ? `Sleeps ${home.guests}` : null, hook]
      .filter(Boolean)
      .join(" · ") || home.name
  );
}

export type CatalogDraft = {
  cards: CatalogCard[];
  formats: CompositionFormatId[];
  primaryFormat: CompositionFormatId;
  /** Absent on exports frozen before ad copy was saved. */
  ad?: CatalogAdCopy;
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
  adHeadline?: string | null;
  adDescription?: string | null;
};
export type CatalogHome = HotelFeedHome & {
  rating?: number;
  thumbUrl?: string;
  gallery?: { url: string; thumbUrl: string; room?: string | null }[];
};
export const catalogExportSchema = z.strictObject({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  error: z.string().nullable(),
  primaryFormat: compositionFormatIdSchema.optional(),
  folderId: z.string().optional(),
  completed: z.number().optional(),
  total: z.number().optional(),
  assets: z
    .array(
      z.strictObject({
        homeId: z.string(),
        name: z.string(),
        assetId: z.string(),
        url: z.string(),
        format: z.string(),
        renderKey: z.string().optional(),
        reused: z.boolean().optional(),
      }),
    )
    .optional(),
  rows: z
    .array(
      z.strictObject({
        streetAddress: z.string().nullable().optional(),
        streetAddress2: z.string().nullable().optional(),
        streetAddress3: z.string().nullable().optional(),
        postalCode: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        id: z.string(),
        brand: z.string(),
        description: z.string(),
        title: z.string(),
        link: z.string(),
        imageUrl: z.string(),
        city: z.string(),
        region: z.string(),
        country: z.string(),
        price: z.string(),
        bedrooms: z.number().nullable(),
        guests: z.number().nullable(),
        market: z.string().nullable().optional(),
        group: z.string().nullable().optional(),
      }),
    )
    .optional(),
  label: z.string().optional(),
  /** The ad copy the export froze with its cards. */
  ad: catalogAdCopySchema.optional(),
});

export type CatalogExport = z.output<typeof catalogExportSchema>;
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

/** What an AI review examined, used only to hide stale AI notes. */
export function catalogCardReviewKey(card: CatalogCard) {
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
  approvals: ReadonlyMap<
    string,
    { approved: boolean; ready: boolean }
  > = new Map(),
  /** The brand's default card, for every home without its own. */
  defaultTemplate: CatalogTemplateId = DEFAULT_CATALOG_TEMPLATE,
  /** The brand's markets: a card's location is its market's label. */
  markets?: BrandMarkets | null,
  /** The canvas every card is drawn and exported at. */
  format: CatalogFormatId = DEFAULT_CATALOG_FORMAT,
  /** The brand's default for the mark on a card that has not chosen. */
  showLogo = true,
  /** The ad the catalog runs in. */
  ad?: CatalogAdCopy,
  brandName?: string,
): CatalogDraft {
  return {
    formats: [format],
    primaryFormat: format,
    ...(ad ? { ad } : {}),
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
          showLogo: o.showLogo ?? showLogo,
          rating: ratingOutOfFive(home.rating),
          pills: o.pills ?? defaultCatalogPills(home),
          location: catalogLocation(home, markets) || undefined,
          adHeadline: o.adHeadline ?? catalogAdHeadline(home.name, brandName),
          adDescription: o.adDescription ?? catalogAdDescription(home),
        };
        return {
          ...card,
          approved: approvals.get(home.id)?.approved ?? false,
          ready: approvals.get(home.id)?.ready ?? false,
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
  /** Product-set labels per home: its market and its lead home group. */
  labels: ReadonlyMap<
    string,
    { market?: string | null; group?: string | null }
  > = new Map(),
) {
  const included = draft.cards.filter((c) => c.included);
  const rows = hotelFeedRows(
    included.map((card) => {
      const home = homes.find((h) => h.id === card.homeId);
      const asset = assets.find(
        (a) => a.homeId === card.homeId && a.format === draft.primaryFormat,
      );
      if (!home || !asset)
        throw new Error("A catalog home is missing its frozen primary image");
      return { ...home, imageUrl: asset.url, ...labels.get(home.id) };
    }),
    brandName,
  );
  // Meta shows the feed's title and description under each card: the card's
  // own ad headline and description.
  const byHome = new Map(included.map((card) => [card.homeId, card]));
  return rows.map((row) => ({
    ...row,
    title: byHome.get(row.id)!.adHeadline,
    description: byHome.get(row.id)!.adDescription,
  }));
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
    ...(missing ? [`${cards(missing)} need artwork`] : []),
    ...(wrongSize
      ? [
          `${cards(wrongSize)} have artwork in another size than this ${draft.formats.join(" + ")} catalog: upload it in that size or switch to Composed`,
        ]
      : []),
  ];
}
