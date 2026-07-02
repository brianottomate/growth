import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { contentPostTable } from "./content-schema";
import { createId } from "./utils";

// ---- ENUMS ---------------------------------------------------------

// Lifecycle of one pasted workbook.
export const planImportStatusEnum = pgEnum("plan_import_status", [
  "parsing", // createFromPaste is running parse + cluster + match
  "ready", // items written, awaiting review
  "applied", // apply has run (items may individually have failed — see applyError)
  "failed", // parse/cluster threw; `error` holds the message, rawText preserved
]);
export type PlanImportStatus = (typeof planImportStatusEnum.enumValues)[number];

export const planImportItemKindEnum = pgEnum("plan_import_item_kind", [
  "fill_slots", // matched >= 1 open calendar slot
  "new_idea", // no acceptable slot; apply creates a fresh idea
]);
export type PlanImportItemKind =
  (typeof planImportItemKindEnum.enumValues)[number];

// Review state — same grammar as content/channel suggestions, plus the
// "approve but mark for refinement" middle path (applies as draft + comment).
export const planImportItemStatusEnum = pgEnum("plan_import_item_status", [
  "pending",
  "accepted",
  "accepted_refine",
  "rejected",
]);
export type PlanImportItemStatus =
  (typeof planImportItemStatusEnum.enumValues)[number];

// ---- JSONB SHAPES --------------------------------------------------

/** One per-platform rendering of a clustered idea (captions verbatim from the sheet). */
export type PlanImportSpot = {
  platform: string; // channel_platform slug
  format: string; // registry id, e.g. "instagram.carousel"
  archetype: string; // registry archetype for that format
  template?: string | null; // e.g. "pov", "talking_head"
  caption?: string | null; // the sheet's per-platform caption → platform_post.text
  date?: string | null; // YYYY-MM-DD when this platform ships on its own day
  sourceRowIndexes: number[]; // parsed TSV rows backing this spot
};

/** The normalized, clustered idea — the item's full editorial payload. */
export type PlanImportIdea = {
  title: string; // Content Concept, canonicalized
  date: string | null; // YYYY-MM-DD, earliest across the cluster
  pillar: string | null; // pillar SLUG (lib/pillars)
  seriesName: string | null; // sheet series display name (find-or-create at apply)
  hook: string | null;
  captionDirection: string | null;
  visualDirection: string | null;
  ctaText: string | null;
  ctaKeyword: string | null; // ManyChat trigger keyword (when ManyChat = YES)
  kpi: string | null;
  ownerName: string | null; // sheet text, always kept
  ownerId: string | null; // resolved org member; null = unresolved (never guessed)
  sheetStatus: string | null; // informational only
  assetLinks: string[]; // URLs pulled from Visuals / Final Assets / Links
  utm: string | null;
  duplicateOfContentPostId?: string | null; // possible-duplicate hint vs non-slot posts
  spots: PlanImportSpot[];
  sourceRowIndexes: number[]; // every raw row collapsed into this idea
};

/** One matched open slot for one platform of an idea. */
export type SlotMatch = {
  platform: string;
  contentPostId: string; // the slot shell this platform consumes
  platformPostId: string; // its owned spot
  slotDate: string; // YYYY-MM-DD
  dayDelta: number; // ideaDate - slotDate in days (signed)
  score: number; // 0..1
};

// ---- TABLES --------------------------------------------------------

/**
 * plan_import — one pasted month workbook (the girls' Claude export). Raw text
 * is kept verbatim for audit / future re-import diffing. The compound of
 * /plan's ephemeral generate→commit grammar and the suggestion tables'
 * persisted review pattern: proposals live in plan_import_item until a single
 * batch apply materializes the accepted ones onto the calendar.
 */
export const planImportTable = pgTable(
  "plan_import",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("imp")),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    rawText: t.text().notNull(), // the paste, verbatim
    source: t.text(), // "claude-export" | "paste" | …
    month: t.text().notNull(), // "YYYY-MM" — the slot window matched against
    status: planImportStatusEnum().default("parsing").notNull(),
    error: t.text(), // failure message when status=failed
    createdById: t.text().references(() => userTable.id),
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
    index("plan_import_brand_idx").on(table.brandId),
    index("plan_import_status_idx").on(table.status),
  ],
);
export type PlanImport = typeof planImportTable.$inferSelect;

/**
 * plan_import_item — one CLUSTERED IDEA from the workbook (not one sheet row:
 * the same concept posted to several platforms, even on adjacent days, is one
 * item with several spots). Holds the full normalized payload + the slot
 * matches, and the review decision. `appliedContentPostId` is the
 * traceability/undo pointer, stamped last by apply (checked first on re-apply
 * so the batch converges without transactions).
 */
export const planImportItemTable = pgTable(
  "plan_import_item",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("impi")),
    importId: t
      .text()
      .references(() => planImportTable.id, { onDelete: "cascade" })
      .notNull(),
    // Denormalized for org-auth joins (mirrors content_suggestion.brandId).
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    payload: t.jsonb().$type<PlanImportIdea>().notNull(),
    kind: planImportItemKindEnum().notNull(),
    // jsonb, not id[]: apply needs per-platform slot routing + scores, and the
    // review UI renders the per-platform match chips straight from this.
    matchedSlots: t.jsonb().$type<SlotMatch[]>(),
    unmatchedPlatforms: t.jsonb().$type<string[]>(), // platforms with no slot
    confidence: t.real(), // 0..1 — drives bulk accept + chips
    reasoning: t.text(), // matcher explanation
    status: planImportItemStatusEnum().default("pending").notNull(),
    appliedContentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "set null" }),
    applyError: t.text(), // per-item apply failure (batch continues)
    reviewedById: t.text().references(() => userTable.id),
    reviewedAt: t.timestamp({ withTimezone: true }),
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
    index("plan_import_item_import_idx").on(table.importId),
    index("plan_import_item_brand_idx").on(table.brandId),
    index("plan_import_item_status_idx").on(table.status),
  ],
);
export type PlanImportItem = typeof planImportItemTable.$inferSelect;

// ---- RELATIONS -----------------------------------------------------

export const planImportRelations = relations(
  planImportTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [planImportTable.brandId],
      references: [brandTable.id],
    }),
    createdBy: one(userTable, {
      fields: [planImportTable.createdById],
      references: [userTable.id],
    }),
    items: many(planImportItemTable),
  }),
);

export const planImportItemRelations = relations(
  planImportItemTable,
  ({ one }) => ({
    import: one(planImportTable, {
      fields: [planImportItemTable.importId],
      references: [planImportTable.id],
    }),
    appliedContentPost: one(contentPostTable, {
      fields: [planImportItemTable.appliedContentPostId],
      references: [contentPostTable.id],
    }),
  }),
);
