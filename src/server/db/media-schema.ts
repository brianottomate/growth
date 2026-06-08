import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";

// ---- MEDIA DOMAIN --------------------------------------------------
//
// The brand media library. The reusable source-of-truth for creative that
// Studio composes into content_post / platform_post / ad_spot.
//
// Storage is split by kind:
//   - images / gifs / static files → Cloudflare R2  (provider = "r2")
//   - video                        → Cloudflare Stream (provider = "stream")
//   - heavy working masters        → external link  (provider = "external")
//
// Uploads go DIRECT from the browser (presigned R2 PUT, or a Stream one-time
// upload URL) — bytes never pass through our Vercel functions. A row is created
// `uploading`, then flipped to `ready` (R2: on client finalize; Stream: on the
// transcode-complete webhook).
//
// `external` assets are just a LINK (Google Drive / Dropbox / Frame.io) — we
// reference the file, never host its bytes. Ideal for 800MB+ working masters
// that get `derivedFrom` cut-downs hosted on Stream/R2. Born `ready`.

// ---- ENUMS ---------------------------------------------------------

export const mediaProviderEnum = pgEnum("media_provider", [
  "r2",
  "stream",
  "external",
]);
export type MediaProvider = (typeof mediaProviderEnum.enumValues)[number];

export const mediaKindEnum = pgEnum("media_kind", [
  "image",
  "video",
  "gif",
  "audio",
  "file",
  "folder",
]);
export type MediaKind = (typeof mediaKindEnum.enumValues)[number];

// Lifecycle of the underlying bytes (not of the creative idea).
export const mediaStatusEnum = pgEnum("media_status", [
  "uploading", // row created, awaiting bytes / transcode
  "processing", // Stream is transcoding
  "ready", // playable / servable
  "error", // upload or transcode failed
]);
export type MediaStatus = (typeof mediaStatusEnum.enumValues)[number];

// ---- MEDIA ASSET TABLE ---------------------------------------------

export const mediaAssetTable = pgTable(
  "media_asset",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("media")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    uploadedBy: t.text().references(() => userTable.id),

    provider: mediaProviderEnum().notNull(),
    kind: mediaKindEnum().notNull(),
    status: mediaStatusEnum().default("uploading").notNull(),

    // Human-facing
    title: t.text(),
    alt: t.text(),
    tags: t.jsonb().$type<string[]>(),

    // File identity
    filename: t.text(),
    mimeType: t.text(),
    size: t.integer(), // bytes (null until known)

    // R2 — `r2Key` is the object key under the bucket; `url` is the public URL
    // (R2_PUBLIC_BASE_URL + "/" + r2Key).
    r2Key: t.text(),
    url: t.text(),

    // Stream — `streamUid` is the Cloudflare Stream video id. Playback / HLS /
    // thumbnail URLs are derived from it + the customer subdomain at read time.
    streamUid: t.text(),

    // External — a link to a file we DON'T host (Google Drive / Dropbox /
    // Frame.io / raw URL). `sourceProvider` drives the icon + open behavior.
    externalUrl: t.text(),
    sourceProvider: t.text(), // "google_drive" | "dropbox" | "frameio" | "other"

    // Shared media metadata
    thumbnailUrl: t.text(),
    width: t.integer(),
    height: t.integer(),
    duration: t.integer(), // seconds, video/audio only

    metadata: t.jsonb(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("media_asset_brand_idx").on(table.brandId),
    index("media_asset_kind_idx").on(table.kind),
    index("media_asset_status_idx").on(table.status),
    index("media_asset_uploaded_by_idx").on(table.uploadedBy),
    // Stream webhooks look assets up by uid.
    uniqueIndex("media_asset_stream_uid_idx").on(table.streamUid),
  ],
);

export type MediaAsset = typeof mediaAssetTable.$inferSelect;
export type MediaAssetInsert = typeof mediaAssetTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const mediaAssetRelations = relations(mediaAssetTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [mediaAssetTable.brandId],
    references: [brandTable.id],
  }),
  uploader: one(userTable, {
    fields: [mediaAssetTable.uploadedBy],
    references: [userTable.id],
  }),
}));
