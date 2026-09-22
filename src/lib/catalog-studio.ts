import { z } from "zod";
import {
  compositionFormatIdSchema,
  compositionTemplateIdSchema,
} from "./compositions";
import { homeCatalogCopy } from "./home-ad-previews";
import {
  hotelFeedRows,
  type HotelFeedHome,
  type HotelFeedRow,
} from "./meta-hotel-feed";

export const catalogCardSchema = z.object({
  homeId: z.string().min(1),
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
  return {
    formats: saved?.formats ?? ["portrait"],
    primaryFormat: saved?.primaryFormat ?? "portrait",
    cards: homes
      .filter((h) => h.imageUrl)
      .map((home) => {
        const existing = saved?.cards.find((c) => c.homeId === home.id);
        if (existing) return existing;
        const copy = homeCatalogCopy(home);
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
    "",
    row.city,
    row.region,
    row.country,
    "",
    "",
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
