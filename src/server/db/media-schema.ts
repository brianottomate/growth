import type { z } from "zod";
import type {
  libraryMediaAnalysisSchema,
  timelineVideoAnalysisSchema,
} from "@/server/ai/capabilities/outputs/media-analysis";
import { relations, sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organizationTable, userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { platformPostTable } from "./content-schema";
import { createId } from "./utils";

// ---- MEDIA DOMAIN --------------------------------------------------
//
// The brand media library. The reusable source-of-truth for creative that
// Studio composes into content_post / platform_post / ad_spot.
//
// Storage is split by provider:
//   - uploaded assets              → Cloudflare R2 (provider = "r2")
//   - legacy video                 → Cloudflare Stream (provider = "stream")
//   - heavy working masters        → external link (provider = "external")
//
// Uploads go directly from the browser to R2 via a presigned PUT. A row is
// created in `uploading` state first, then finalized after the PUT succeeds.
//
// `external` assets are just a LINK (Google Drive / Dropbox / Frame.io) — we
// reference the file, never host its bytes. Ideal for 800MB+ working masters
// that get `derivedFrom` cut-downs hosted on R2. Born `ready`.

// ---- ENUMS ---------------------------------------------------------

export const mediaProviderEnum = pgEnum("media_provider", [
  "r2",
  "stream", // legacy Cloudflare Stream videos; new video uploads go to R2
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
  "processing", // reserved for future media processing
  "ready", // playable / servable
  "error", // upload or transcode failed
]);
export type MediaStatus = (typeof mediaStatusEnum.enumValues)[number];

export const mediaReviewStatusEnum = pgEnum("media_review_status", [
  "suggested",
  "approved",
  "rejected",
]);

export const mediaTagSourceEnum = pgEnum("media_tag_source", ["human", "ai"]);
export type MediaTagSource = (typeof mediaTagSourceEnum.enumValues)[number];

export const mediaVideoAnalysisStatusEnum = pgEnum(
  "media_video_analysis_status",
  ["processing", "ready", "error"],
);
export type MediaVideoAnalysisStatus =
  (typeof mediaVideoAnalysisStatusEnum.enumValues)[number];

export type VideoAnalysisBoard = {
  index: number;
  url: string;
  pathname: string;
  width: number;
  height: number;
  firstFrame: number;
  lastFrame: number;
};

export type VideoAnalysisFrame = {
  index: number;
  timestampMs: number;
  boardIndex: number;
  row: number;
  column: number;
};

export type VideoTranscriptWord = {
  text: string;
  startMs: number;
  endMs: number;
};

/**
 * Sampled frames of a library video, laid out on numbered storyboard boards.
 *
 * Only a browser can decode video, and the one moment a browser reliably holds
 * the file is upload. So the boards are cut then and stored beside the clip,
 * which lets analysis run later from anywhere — the library, chat, MCP — with
 * no browser in the loop. Board images live at keys derived from the video's
 * own key (`R2.buildStoryboardKey`), so the server never trusts a client URL.
 */
export type MediaStoryboard = {
  durationMs: number;
  sampleIntervalMs: number;
  gridSize: number;
  boards: VideoAnalysisBoard[];
  frames: VideoAnalysisFrame[];
};

// ---- FOLDERS + MANAGED TAGS --------------------------------------

export const mediaFolderTable = pgTable(
  "media_folder",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("mfolder")),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    name: t.text().notNull(),
    description: t.text(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("media_folder_brand_idx").on(table.brandId),
    uniqueIndex("media_folder_brand_name_idx").on(table.brandId, table.name),
  ],
);

export const mediaTagTable = pgTable(
  "media_tag",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("mtag")),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    name: t.text().notNull(),
    description: t.text(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("media_tag_brand_idx").on(table.brandId),
    uniqueIndex("media_tag_brand_name_idx").on(table.brandId, table.name),
  ],
);

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

    folderId: t.text().references(() => mediaFolderTable.id, {
      onDelete: "set null",
    }),

    uploadedBy: t.text().references(() => userTable.id),

    // Optional provenance for an explicit "save from timeline" capture. One
    // source post can be saved into several owned brand libraries; uniqueness
    // is therefore scoped to the destination brand.
    sourcePlatformPostId: t.text().references(() => platformPostTable.id, {
      onDelete: "set null",
    }),
    sourceMediaIndex: t.integer(),

    provider: mediaProviderEnum().notNull(),
    kind: mediaKindEnum().notNull(),
    status: mediaStatusEnum().default("uploading").notNull(),
    reviewStatus: mediaReviewStatusEnum().default("approved").notNull(),
    // Durable scrape identity: rejection survives rediscovery of the same URL.
    // Canonical provenance; retain the physical name for deployed-app compatibility.
    sourceUrl: t.text("discovered_source_url"),

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

    // Stream — legacy Cloudflare Stream video id (no new writes; kept so
    // existing rows stay addressable/deletable).
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
    storyboard: t.jsonb().$type<MediaStoryboard>(), // video only

    metadata: t.jsonb().$type<
      Record<string, unknown> & {
        aiAnalysis?: z.output<typeof libraryMediaAnalysisSchema>;
      }
    >(),

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
    index("media_asset_folder_idx").on(table.folderId),
    index("media_asset_source_url_idx").on(table.brandId, table.sourceUrl),
    index("media_asset_kind_idx").on(table.kind),
    index("media_asset_status_idx").on(table.status),
    uniqueIndex("media_asset_discovered_source_idx")
      .on(table.brandId, table.sourceUrl)
      .where(sql`${table.sourceProvider} = 'website'`),
    index("media_asset_uploaded_by_idx").on(table.uploadedBy),
    // Non-unique: a chat image promoted into several brand libraries shares
    // one underlying object key.
    index("media_asset_r2_key_idx").on(table.r2Key),
    // Stream webhooks historically looked assets up by uid.
    uniqueIndex("media_asset_stream_uid_idx").on(table.streamUid),
    uniqueIndex("media_asset_source_post_item_idx").on(
      table.brandId,
      table.sourcePlatformPostId,
      table.sourceMediaIndex,
    ),
  ],
);

export type MediaAsset = typeof mediaAssetTable.$inferSelect;
export type MediaAssetInsert = typeof mediaAssetTable.$inferInsert;

export const mediaAssetTagTable = pgTable(
  "media_asset_tag",
  (t) => ({
    mediaAssetId: t
      .text()
      .references(() => mediaAssetTable.id, { onDelete: "cascade" })
      .notNull(),
    tagId: t
      .text()
      .references(() => mediaTagTable.id, { onDelete: "cascade" })
      .notNull(),
    source: mediaTagSourceEnum().notNull(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    primaryKey({ columns: [table.mediaAssetId, table.tagId, table.source] }),
    index("media_asset_tag_asset_idx").on(table.mediaAssetId),
    index("media_asset_tag_tag_idx").on(table.tagId),
  ],
);

// ---- VIDEO ANALYSIS ------------------------------------------------
//
// A durable analysis of one video item on a canonical timeline post. The
// browser performs frame extraction on the operator's device; hosted Whisper
// handles codec-robust transcription. Only derived storyboard boards,
// transcript, and analysis metadata are persisted. Boards deliberately do not
// enter the general media library.

export const mediaVideoAnalysisTable = pgTable(
  "media_video_analysis",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("vanalysis")),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    platformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "cascade" })
      .notNull(),
    sourceMediaIndex: t.integer().notNull(),
    sourceUrl: t.text().notNull(),
    status: mediaVideoAnalysisStatusEnum().default("processing").notNull(),
    rendererVersion: t.integer().default(1).notNull(),
    durationMs: t.integer(),
    sampleIntervalMs: t.integer(),
    gridSize: t.integer(),
    frameCount: t.integer(),
    boards: t.jsonb().$type<VideoAnalysisBoard[]>(),
    frames: t.jsonb().$type<VideoAnalysisFrame[]>(),
    transcriptLanguage: t.text(),
    transcriptText: t.text(),
    transcriptWords: t.jsonb().$type<VideoTranscriptWord[]>(),
    transcriptError: t.text(),
    analysis: t.jsonb().$type<z.output<typeof timelineVideoAnalysisSchema>>(),
    error: t.text(),
    createdBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    artifactsSavedAt: t.timestamp(),
    completedAt: t.timestamp(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (table) => [
    uniqueIndex("media_video_analysis_post_item_idx").on(
      table.organizationId,
      table.platformPostId,
      table.sourceMediaIndex,
    ),
    index("media_video_analysis_org_idx").on(table.organizationId),
    index("media_video_analysis_post_idx").on(table.platformPostId),
    index("media_video_analysis_status_idx").on(table.status),
  ],
);

export type MediaVideoAnalysis = typeof mediaVideoAnalysisTable.$inferSelect;
export type MediaVideoAnalysisInsert =
  typeof mediaVideoAnalysisTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const mediaAssetRelations = relations(
  mediaAssetTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [mediaAssetTable.brandId],
      references: [brandTable.id],
    }),
    uploader: one(userTable, {
      fields: [mediaAssetTable.uploadedBy],
      references: [userTable.id],
    }),
    folder: one(mediaFolderTable, {
      fields: [mediaAssetTable.folderId],
      references: [mediaFolderTable.id],
    }),
    tagAssignments: many(mediaAssetTagTable),
  }),
);

export const mediaFolderRelations = relations(
  mediaFolderTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [mediaFolderTable.brandId],
      references: [brandTable.id],
    }),
    assets: many(mediaAssetTable),
  }),
);

export const mediaTagRelations = relations(mediaTagTable, ({ one, many }) => ({
  brand: one(brandTable, {
    fields: [mediaTagTable.brandId],
    references: [brandTable.id],
  }),
  assignments: many(mediaAssetTagTable),
}));

export const mediaAssetTagRelations = relations(
  mediaAssetTagTable,
  ({ one }) => ({
    asset: one(mediaAssetTable, {
      fields: [mediaAssetTagTable.mediaAssetId],
      references: [mediaAssetTable.id],
    }),
    tag: one(mediaTagTable, {
      fields: [mediaAssetTagTable.tagId],
      references: [mediaTagTable.id],
    }),
  }),
);

export const mediaVideoAnalysisRelations = relations(
  mediaVideoAnalysisTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [mediaVideoAnalysisTable.organizationId],
      references: [organizationTable.id],
    }),
    brand: one(brandTable, {
      fields: [mediaVideoAnalysisTable.brandId],
      references: [brandTable.id],
    }),
    platformPost: one(platformPostTable, {
      fields: [mediaVideoAnalysisTable.platformPostId],
      references: [platformPostTable.id],
    }),
    creator: one(userTable, {
      fields: [mediaVideoAnalysisTable.createdBy],
      references: [userTable.id],
    }),
  }),
);

export type MediaFolder = typeof mediaFolderTable.$inferSelect;
export type MediaTag = typeof mediaTagTable.$inferSelect;
