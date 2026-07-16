import type { UIMessage } from "ai";
import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { organizationTable, userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { contentPostTable } from "./content-schema";
import { mediaAssetTable } from "./media-schema";
import { createId } from "./utils";

export const assistantThreadVisibilityEnum = pgEnum(
  "assistant_thread_visibility",
  ["private", "shared"],
);

export const assistantThreadTable = pgTable(
  "assistant_thread",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ath")),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    createdBy: t
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull(),
    pinnedBrandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "set null" }),
    activeContentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "set null" }),
    visibility: assistantThreadVisibilityEnum().default("private").notNull(),
    title: t.text().default("New session").notNull(),
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
    index("assistant_thread_org_updated_idx").on(
      table.organizationId,
      table.updatedAt,
    ),
    index("assistant_thread_created_by_idx").on(table.createdBy),
    index("assistant_thread_brand_idx").on(table.pinnedBrandId),
  ],
);

/**
 * Full AI SDK messages, including tool parts and approval state. The database
 * row has its own id so a crafted UI message id can never collide globally;
 * the thread-scoped client id is the idempotency key used by the chat route.
 */
export const assistantMessageTable = pgTable(
  "assistant_message",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("amsg")),
    threadId: t
      .text()
      .references(() => assistantThreadTable.id, { onDelete: "cascade" })
      .notNull(),
    clientMessageId: t.text().notNull(),
    role: t.text({ enum: ["user", "assistant", "system"] }).notNull(),
    message: t.jsonb().$type<UIMessage>().notNull(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    uniqueIndex("assistant_message_thread_client_id_idx").on(
      table.threadId,
      table.clientMessageId,
    ),
    index("assistant_message_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
  ],
);

/** One bounded assistant execution; conversation content remains in messages. */
export const assistantRunTable = pgTable(
  "assistant_run",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("arun")),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    userId: t.text().references(() => userTable.id, { onDelete: "set null" }),
    threadId: t
      .text()
      .references(() => assistantThreadTable.id, { onDelete: "set null" }),
    surface: t.text().notNull(),
    status: t
      .text({ enum: ["running", "completed", "failed"] })
      .default("running")
      .notNull(),
    model: t.text(),
    contextManifest: t.jsonb().$type<{
      surface: string;
      characters: number;
      sections: Array<{ id: string; characters: number; cache: string }>;
    }>(),
    summary: t.jsonb().$type<Record<string, unknown>>(),
    error: t.jsonb().$type<Record<string, unknown>>(),
    startedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    finishedAt: t.timestamp(),
  }),
  (table) => [
    index("assistant_run_org_started_idx").on(
      table.organizationId,
      table.startedAt,
    ),
    index("assistant_run_thread_started_idx").on(
      table.threadId,
      table.startedAt,
    ),
  ],
);

export const assistantToolReceiptTable = pgTable(
  "assistant_tool_receipt",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("atrc")),
    runId: t
      .text()
      .references(() => assistantRunTable.id, { onDelete: "cascade" })
      .notNull(),
    threadId: t
      .text()
      .references(() => assistantThreadTable.id, { onDelete: "set null" }),
    toolCallId: t.text().notNull(),
    toolName: t.text().notNull(),
    status: t
      .text({ enum: ["running", "completed", "failed"] })
      .default("running")
      .notNull(),
    policy: t.jsonb().$type<Record<string, unknown>>().notNull(),
    input: t.jsonb().$type<unknown>(),
    output: t.jsonb().$type<unknown>(),
    error: t.jsonb().$type<Record<string, unknown>>(),
    startedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    finishedAt: t.timestamp(),
    durationMs: t.integer(),
  }),
  (table) => [
    uniqueIndex("assistant_tool_receipt_run_call_uidx").on(
      table.runId,
      table.toolCallId,
    ),
    index("assistant_tool_receipt_run_idx").on(table.runId),
  ],
);

export type ProductionPacketReference = {
  mediaAssetId: string;
  role?: "reference" | "source" | "style";
  note?: string;
};

export const productionPacketStatusEnum = pgEnum("production_packet_status", [
  "draft",
  "ready",
  "archived",
]);

/**
 * A provider-neutral creative brief. It can be copied into Claude Design,
 * ChatGPT, a video editor, or consumed by an in-product adapter such as Fal.
 */
export const productionPacketTable = pgTable(
  "production_packet",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pkt")),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "set null" }),
    threadId: t
      .text()
      .references(() => assistantThreadTable.id, { onDelete: "set null" }),
    sourceMessageId: t.text(),
    title: t.text().notNull(),
    purpose: t.text(),
    prompt: t.text().notNull(),
    negativePrompt: t.text(),
    aspectRatio: t.text(),
    outputFormat: t.text(),
    suggestedTool: t.text(),
    instructions: t.text(),
    references: t
      .jsonb()
      .$type<ProductionPacketReference[]>()
      .default([])
      .notNull(),
    metadata: t.jsonb().$type<Record<string, unknown>>(),
    status: productionPacketStatusEnum().default("ready").notNull(),
    createdBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
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
    index("production_packet_brand_idx").on(table.brandId),
    index("production_packet_content_idx").on(table.contentPostId),
    index("production_packet_thread_idx").on(table.threadId),
  ],
);

export type CreativeCandidate = {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
  seed?: number;
};

export const creativeRunStatusEnum = pgEnum("creative_run_status", [
  "queued",
  "processing",
  "ready",
  "error",
  "cancelled",
]);

/**
 * Durable adapter run. Provider-specific state stays here; accepted media is
 * copied into media_asset so the brand library outlives any adapter.
 */
export const creativeRunTable = pgTable(
  "creative_run",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("crun")),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "set null" }),
    threadId: t
      .text()
      .references(() => assistantThreadTable.id, { onDelete: "set null" }),
    packetId: t
      .text()
      .references(() => productionPacketTable.id, { onDelete: "set null" }),
    provider: t.text().notNull(),
    kind: t.text({ enum: ["image", "video"] }).notNull(),
    model: t.text().notNull(),
    prompt: t.text().notNull(),
    input: t.jsonb().$type<Record<string, unknown>>().notNull(),
    providerRequestId: t.text(),
    webhookTokenHash: t.text(),
    status: creativeRunStatusEnum().default("queued").notNull(),
    candidates: t.jsonb().$type<CreativeCandidate[]>().default([]).notNull(),
    providerOutput: t.jsonb().$type<Record<string, unknown>>(),
    acceptedMediaAssetId: t
      .text()
      .references(() => mediaAssetTable.id, { onDelete: "set null" }),
    error: t.text(),
    createdBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    completedAt: t.timestamp(),
  }),
  (table) => [
    index("creative_run_brand_idx").on(table.brandId),
    index("creative_run_packet_idx").on(table.packetId),
    index("creative_run_thread_idx").on(table.threadId),
    uniqueIndex("creative_run_provider_request_idx").on(
      table.provider,
      table.providerRequestId,
    ),
  ],
);

export const assistantThreadRelations = relations(
  assistantThreadTable,
  ({ one, many }) => ({
    organization: one(organizationTable, {
      fields: [assistantThreadTable.organizationId],
      references: [organizationTable.id],
    }),
    creator: one(userTable, {
      fields: [assistantThreadTable.createdBy],
      references: [userTable.id],
    }),
    brand: one(brandTable, {
      fields: [assistantThreadTable.pinnedBrandId],
      references: [brandTable.id],
    }),
    activeContentPost: one(contentPostTable, {
      fields: [assistantThreadTable.activeContentPostId],
      references: [contentPostTable.id],
    }),
    messages: many(assistantMessageTable),
    packets: many(productionPacketTable),
    runs: many(creativeRunTable),
  }),
);

export const assistantMessageRelations = relations(
  assistantMessageTable,
  ({ one }) => ({
    thread: one(assistantThreadTable, {
      fields: [assistantMessageTable.threadId],
      references: [assistantThreadTable.id],
    }),
  }),
);

export const productionPacketRelations = relations(
  productionPacketTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [productionPacketTable.brandId],
      references: [brandTable.id],
    }),
    contentPost: one(contentPostTable, {
      fields: [productionPacketTable.contentPostId],
      references: [contentPostTable.id],
    }),
    thread: one(assistantThreadTable, {
      fields: [productionPacketTable.threadId],
      references: [assistantThreadTable.id],
    }),
    runs: many(creativeRunTable),
  }),
);

export const creativeRunRelations = relations(creativeRunTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [creativeRunTable.brandId],
    references: [brandTable.id],
  }),
  contentPost: one(contentPostTable, {
    fields: [creativeRunTable.contentPostId],
    references: [contentPostTable.id],
  }),
  thread: one(assistantThreadTable, {
    fields: [creativeRunTable.threadId],
    references: [assistantThreadTable.id],
  }),
  packet: one(productionPacketTable, {
    fields: [creativeRunTable.packetId],
    references: [productionPacketTable.id],
  }),
  acceptedMediaAsset: one(mediaAssetTable, {
    fields: [creativeRunTable.acceptedMediaAssetId],
    references: [mediaAssetTable.id],
  }),
}));

export type AssistantThread = typeof assistantThreadTable.$inferSelect;
export type AssistantRun = typeof assistantRunTable.$inferSelect;
export type AssistantToolReceipt =
  typeof assistantToolReceiptTable.$inferSelect;
export type ProductionPacket = typeof productionPacketTable.$inferSelect;
export type CreativeRun = typeof creativeRunTable.$inferSelect;
