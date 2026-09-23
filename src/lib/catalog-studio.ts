import { z } from "zod";
import {
  compositionFormatIdSchema,
  compositionTemplateIdSchema,
} from "./compositions";
import { homeCatalogCopy, place } from "./home-ad-previews";
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
});
export const catalogDraftSchema = z
  .object({
    cards: z.array(catalogCardSchema),
    formats: z.array(compositionFormatIdSchema).min(1),
    primaryFormat: compositionFormatIdSchema,
  })
  .refine(
    (v) => v.formats.includes(v.primaryFormat),
    "Include the primary feed size",
  );
export type CatalogCard = z.infer<typeof catalogCardSchema>;
export type CatalogDraft = z.infer<typeof catalogDraftSchema>;
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
export function catalogDraft(
  homes: CatalogHome[],
  saved?: CatalogDraft | null,
): CatalogDraft {
  const leads = new Set<string>();
  return {
    formats: saved?.formats ?? ["portrait"],
    primaryFormat: saved?.primaryFormat ?? "portrait",
    cards: homes
      .filter((h) => h.imageUrl)
      .map((home) => {
        const copy = homeCatalogCopy(home, leads);
        if (copy.lead) leads.add(copy.lead);
        const existing = saved?.cards.find((c) => c.homeId === home.id);
        if (existing) {
          // Drafts saved before cards led on amenities still say "<name> in
          // <place>"; nobody typed that, so it gives way. An edited headline
          // is kept.
          return copy.lead && isNameHeadline(existing.title, home)
            ? {
                ...existing,
                title: [copy.eyebrow, copy.title].filter(Boolean).join(" "),
              }
            : existing;
        }
        return {
          homeId: home.id,
          included: true,
          imageUrl: home.imageUrl!,
          templateId: "catalog-copy",
          title: [copy.eyebrow, copy.title].filter(Boolean).join(" "),
          subtitle: copy.subtitle,
          imagePosition: "center",
          showLogo: true,
        };
      }),
  };
}
function isNameHeadline(title: string, home: CatalogHome) {
  const where = place(home);
  return (
    title === home.name || (!!where && title === `${home.name} in ${where}`)
  );
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
