import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { createId } from "./utils";

// ---- ENUMS ---------------------------------------------------------

/**
 * Lifecycle of a pregen prospect site. `preview_ready` means an artifact
 * exists and the tokened preview URL can be sent; `claimed` is terminal on
 * the growth side — post-claim lifecycle belongs to the product (monolith).
 */
export const pregenNativeProspectStatusEnum = pgEnum("pregen_native_prospect_status", [
  "new",
  "building",
  "preview_ready",
  "claimed",
  "failed",
]);
export type PregenNativeProspectStatus =
  (typeof pregenNativeProspectStatusEnum.enumValues)[number];

export const pregenNativeBuildStatusEnum = pgEnum("pregen_native_build_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);
export type PregenNativeBuildStatus =
  (typeof pregenNativeBuildStatusEnum.enumValues)[number];

// Pipeline steps, in execution order. Mirrors the monolith's site-editor
// onboarding workflow (crawl → plan → sections) plus the growth-specific
// property-grid injection; the runner records progress per step.
export const pregenNativeBuildStepEnum = pgEnum("pregen_native_build_step", [
  "crawl",
  "plan",
  "generate_sections",
  "inject_properties",
  "persist_artifact",
]);
export type PregenNativeBuildStep = (typeof pregenNativeBuildStepEnum.enumValues)[number];

export const pregenNativeCrawlPageKindEnum = pgEnum("pregen_native_crawl_page_kind", [
  "homepage",
  "property",
  "property_index",
  "other",
]);
export type PregenNativeCrawlPageKind =
  (typeof pregenNativeCrawlPageKindEnum.enumValues)[number];

// ---- JSONB SHAPES --------------------------------------------------

/** One entry per executed step; append-only, newest last. */
export type PregenNativeStepLogEntry = {
  step: PregenNativeBuildStep;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  /** Step-specific counters (pages crawled, sections generated, …). */
  stats?: Record<string, number>;
};

/**
 * Property extracted from the prospect's site for the build-time property
 * grid. Deliberately NOT authoritative PMS data — display-grade only.
 */
export type PregenNativeExtractedProperty = {
  name: string;
  url?: string;
  imageUrls: string[];
  bedrooms?: number;
  bathrooms?: number;
  sleeps?: number;
  location?: string;
  priceHint?: string;
};

/**
 * The renderable artifact. Shape mirrors what the sites renderer consumes
 * from the monolith APIs: website-level config plus pages whose `sections`
 * are registry-schema block data, fully inlined. Tens of KB in practice.
 */
export type PregenNativeSiteConfig = {
  title: string;
  description: string;
  heroTitle?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  accentColor?: string | null;
};

export type PregenNativePage = {
  slug: string;
  name: string;
  kind: string; // HOMEPAGE | ABOUT | … (monolith page-kind vocabulary)
  titleTag?: string | null;
  descriptionTag?: string | null;
  sections: unknown[]; // registry section unions; validated at generation time
};

/** Brand kit extracted from the homepage (monolith: SiteEditorEvaluatedBrandKit). */
export type PregenNativeBrandKit = {
  businessName?: string;
  locations?: string[];
  propertyTypes?: string[];
  inventoryMode?: string;
  voiceBrief?: string;
  branding?: Record<string, unknown>;
};

// ---- TABLES --------------------------------------------------------

/**
 * PregenProspect — one PM prospect whose site we pre-generate. Standalone
 * for the sanity build (no FK into leads); `domain` is the natural join key
 * to the leads tables if we wire it later.
 */
export const pregenNativeProspectTable = pgTable(
  "pregen_native_prospect",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pgp")),

    /** Prospect's existing site, normalized to origin (no path/query). */
    sourceUrl: t.text().notNull(),
    domain: t.text().notNull(),
    name: t.text(),

    status: pregenNativeProspectStatusEnum().default("new").notNull(),

    /**
     * Bearer credential for the preview URL (`/p/<token>`). Plaintext by
     * design: it rides in outreach emails and logs anyway; the DB copy is
     * not the weak point. Prefixed nanoid so leaks are recognizable.
     */
    previewToken: t
      .text()
      .notNull()
      .$defaultFn(() => createId("pv")),

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
  (t) => [
    uniqueIndex("pregen_native_prospect_domain_idx").on(t.domain),
    uniqueIndex("pregen_native_prospect_token_idx").on(t.previewToken),
  ],
);

/** PregenBuild — one pipeline run for a prospect. Latest succeeded wins. */
export const pregenNativeBuildTable = pgTable(
  "pregen_native_build",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pgb")),

    prospectId: t
      .text()
      .references(() => pregenNativeProspectTable.id, { onDelete: "cascade" })
      .notNull(),

    status: pregenNativeBuildStatusEnum().default("queued").notNull(),
    currentStep: pregenNativeBuildStepEnum(),
    stepLog: t.jsonb().$type<PregenNativeStepLogEntry[]>().default([]).notNull(),
    error: t.text(),

    /** Properties extracted during crawl, input to inject_properties. */
    extractedProperties: t.jsonb().$type<PregenNativeExtractedProperty[]>(),

    // Step checkpoints: each generation step writes its output here so the
    // runner can resume mid-pipeline and persist_artifact is pure assembly.
    brandKit: t.jsonb().$type<PregenNativeBrandKit>(),
    draftConfig: t.jsonb().$type<PregenNativeSiteConfig>(),
    draftPages: t.jsonb().$type<PregenNativePage[]>(),

    startedAt: t.timestamp(),
    finishedAt: t.timestamp(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index("pregen_native_build_prospect_idx").on(t.prospectId)],
);

/** Raw crawl captures — the LLM context for plan/section generation. */
export const pregenNativeCrawlPageTable = pgTable(
  "pregen_native_crawl_page",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pgc")),

    buildId: t
      .text()
      .references(() => pregenNativeBuildTable.id, { onDelete: "cascade" })
      .notNull(),

    url: t.text().notNull(),
    kind: pregenNativeCrawlPageKindEnum().default("other").notNull(),
    markdown: t.text(),
    metadata: t.jsonb().$type<Record<string, unknown>>(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index("pregen_native_crawl_page_build_idx").on(t.buildId)],
);

/**
 * PregenArtifact — the renderable site. One row per succeeded build; the
 * preview app resolves `/p/<token>` → prospect → latest artifact and renders
 * `pages[].sections` through the registry dispatch. This row IS the contract
 * for any future claim handoff.
 */
export const pregenNativeArtifactTable = pgTable(
  "pregen_native_artifact",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pga")),

    buildId: t
      .text()
      .references(() => pregenNativeBuildTable.id, { onDelete: "cascade" })
      .notNull(),
    prospectId: t
      .text()
      .references(() => pregenNativeProspectTable.id, { onDelete: "cascade" })
      .notNull(),

    version: t.integer().default(1).notNull(),
    config: t.jsonb().$type<PregenNativeSiteConfig>().notNull(),
    pages: t.jsonb().$type<PregenNativePage[]>().notNull(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex("pregen_native_artifact_build_idx").on(t.buildId),
    index("pregen_native_artifact_prospect_idx").on(t.prospectId),
  ],
);

// ---- RELATIONS -----------------------------------------------------

export const pregenNativeProspectRelations = relations(
  pregenNativeProspectTable,
  ({ many }) => ({
    builds: many(pregenNativeBuildTable),
    artifacts: many(pregenNativeArtifactTable),
  }),
);

export const pregenNativeBuildRelations = relations(
  pregenNativeBuildTable,
  ({ one, many }) => ({
    prospect: one(pregenNativeProspectTable, {
      fields: [pregenNativeBuildTable.prospectId],
      references: [pregenNativeProspectTable.id],
    }),
    crawlPages: many(pregenNativeCrawlPageTable),
    artifact: one(pregenNativeArtifactTable),
  }),
);

export const pregenNativeCrawlPageRelations = relations(
  pregenNativeCrawlPageTable,
  ({ one }) => ({
    build: one(pregenNativeBuildTable, {
      fields: [pregenNativeCrawlPageTable.buildId],
      references: [pregenNativeBuildTable.id],
    }),
  }),
);

export const pregenNativeArtifactRelations = relations(
  pregenNativeArtifactTable,
  ({ one }) => ({
    build: one(pregenNativeBuildTable, {
      fields: [pregenNativeArtifactTable.buildId],
      references: [pregenNativeBuildTable.id],
    }),
    prospect: one(pregenNativeProspectTable, {
      fields: [pregenNativeArtifactTable.prospectId],
      references: [pregenNativeProspectTable.id],
    }),
  }),
);
