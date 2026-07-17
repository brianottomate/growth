import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { channelPlatformEnum, channelTable } from "./channel-schema";
import type { MediaItem } from "./content-schema";
import { createId } from "./utils";
import type {
  AudienceActiveWindow,
  AudienceContext,
  AudienceDemographics,
  AudienceGeography,
} from "@/lib/audience-model";

// NOTE: this is a read-only "launchpad" mirror — campaigns & audiences are
// created/managed in each platform's portal (Meta/Google/OpenAI ads managers)
// and surfaced here for overview + link-out. CRUD-from-our-app comes later.
// Individual ad spots are not modeled yet; `campaign.adSpots` is a count.

// ---- ENUMS ---------------------------------------------------------

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "live",
  "paused",
  "ended",
]);
export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];

export const audienceTypeEnum = pgEnum("audience_type", [
  "segment",
  "keyword",
  "intent",
  "lookalike",
  "custom",
]);
export type AudienceType = (typeof audienceTypeEnum.enumValues)[number];

// Strategic layer for audiences — the canonical "who we want to reach"
// (e.g. "CA remote workers"). Per-channel `audience` rows are the reality and
// link up via the nullable `targetId` FK. Mirrors lifecycle_program.
export const audienceTargetStatusEnum = pgEnum("audience_target_status", [
  "idea",
  "planned",
  "active",
  "retired",
]);
export type AudienceTargetStatus =
  (typeof audienceTargetStatusEnum.enumValues)[number];

export const audienceTargetPriorityEnum = pgEnum("audience_target_priority", [
  "must_have",
  "should_have",
  "nice_to_have",
]);
export type AudienceTargetPriority =
  (typeof audienceTargetPriorityEnum.enumValues)[number];

export const audienceProfileScopeEnum = pgEnum("audience_profile_scope", [
  "core",
  "segment",
  "experimental",
]);
export type AudienceProfileScope =
  (typeof audienceProfileScopeEnum.enumValues)[number];

export const audienceMarketSideEnum = pgEnum("audience_market_side", [
  "consumer",
  "professional",
  "business",
  "partner",
]);
export type AudienceMarketSide =
  (typeof audienceMarketSideEnum.enumValues)[number];

export const audienceResearchMaturityEnum = pgEnum(
  "audience_research_maturity",
  ["hypothesis", "researched", "validated"],
);
export type AudienceResearchMaturity =
  (typeof audienceResearchMaturityEnum.enumValues)[number];

export const audienceActivationStatusEnum = pgEnum(
  "audience_activation_status",
  ["draft", "planned", "active", "paused", "retired"],
);
export type AudienceActivationStatus =
  (typeof audienceActivationStatusEnum.enumValues)[number];

// Provenance of an audience — makes retargeting (pixel_event = logged-out,
// customer_list = logged-in) and hyper-segmentation (amplitude_cohort) explicit
// instead of implied by campaign names. Keep in sync with audienceSourceSchema.
export const audienceSourceEnum = pgEnum("audience_source", [
  "manual",
  "pixel_event",
  "customer_list",
  "amplitude_cohort",
  "lookalike_seed",
]);
export type AudienceSource = (typeof audienceSourceEnum.enumValues)[number];

// ---- INITIATIVE (top-level, goal-driven push across ad channels) ----

/**
 * Initiative — the CMO's strategic push ("drive leads to /list"). It declares a
 * goal, the channels it *wants* to run on (`targetChannels`), dates, and a total
 * budget. The per-channel `campaign` rows are the implementations; the app
 * verifies them against `targetChannels`. The paid counterpart of a
 * `content_post` (one intent → many platform executions).
 */
export const initiativeStatusEnum = pgEnum("initiative_status", [
  "planned",
  "active",
  "paused",
  "completed",
  "archived",
]);
export type InitiativeStatus = (typeof initiativeStatusEnum.enumValues)[number];

export const initiativeTable = pgTable(
  "initiative",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("init")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(),
    slug: t.text(),

    // Goal intent as a slug for now (e.g. "supply", "saas", "brand"). Promote to
    // a `goal` table when organic content links to the same axis.
    goal: t.text(),
    landingUrl: t.text(), // where it drives (e.g. https://wander.com/list)
    description: t.text(),
    color: t.text(), // UI accent (hex), used for feed bands

    status: initiativeStatusEnum().default("active").notNull(),

    // Channels the CMO wants this to run on (platform slugs). The per-channel
    // `campaign` rows are the implementations we verify against this list.
    targetChannels: t.jsonb().$type<string[]>(),

    budget: t.integer(), // total intended (whole dollars)

    startAt: t.timestamp({ withTimezone: true }),
    endAt: t.timestamp({ withTimezone: true }),

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
    index("initiative_brand_idx").on(table.brandId),
    index("initiative_status_idx").on(table.status),
  ],
);

export type Initiative = typeof initiativeTable.$inferSelect;
export type InitiativeInsert = typeof initiativeTable.$inferInsert;

// ---- CAMPAIGN ------------------------------------------------------

export const campaignTable = pgTable(
  "campaign",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("camp")),

    // Canonical parent: the ad account it runs on. brandId is a denormalized
    // convenience for brand-scoped queries (a channel's brand never changes).
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    platform: channelPlatformEnum().notNull(), // badge; denormalized from channel

    // Optional parent push this per-channel campaign implements.
    initiativeId: t
      .text()
      .references(() => initiativeTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    status: campaignStatusEnum().default("draft").notNull(),
    objective: t.text(),

    startAt: t.timestamp({ withTimezone: true }),
    endAt: t.timestamp({ withTimezone: true }),

    // Coarse launchpad rollups (whole dollars). Precise figures live in-platform.
    budget: t.integer(),
    spend: t.integer(),
    adSpots: t.integer().default(0).notNull(),

    // Latest metrics snapshot (rolled up from the campaign's ads) + one hero
    // creative thumbnail, so feed/calendar can render a campaign card without
    // touching `ad_spot`. Snapshot, not time-series.
    stats: t.jsonb().$type<AdStats>(),
    heroThumbnailUrl: t.text(),

    externalId: t.text(), // platform campaign id
    manageUrl: t.text(), // deep-link into the platform's manager

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
    index("campaign_brand_idx").on(table.brandId),
    index("campaign_channel_idx").on(table.channelId),
    index("campaign_status_idx").on(table.status),
    index("campaign_initiative_idx").on(table.initiativeId),
  ],
);

export type Campaign = typeof campaignTable.$inferSelect;
export type CampaignInsert = typeof campaignTable.$inferInsert;

// ---- AD SPOT (one creative under a campaign; mirrors a Zernio Ad) ----

/** Inline performance snapshot for an ad/campaign (latest, not time-series). */
export type AdStats = {
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  ctr?: number;
  conversions?: number;
  cpc?: number;
  cpm?: number;
  // Value/return signals — present in Zernio's metrics; useful at campaign level.
  roas?: number;
  purchaseValue?: number;
  costPerConversion?: number;
};

export const adSpotTable = pgTable(
  "ad_spot",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ad")),

    campaignId: t
      .text()
      .references(() => campaignTable.id, { onDelete: "cascade" })
      .notNull(),
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    platform: channelPlatformEnum().notNull(),

    name: t.text(),
    status: t.text(), // raw platform status (active/paused/…); ingested as-is

    // Ad set denormalized (Zernio's AdWithContext flattens it onto the ad).
    adSetId: t.text(),
    adSetName: t.text(),

    // Creative — maps Zernio creative (image/video/thumb + body + link).
    media: t.jsonb().$type<MediaItem[]>(),
    body: t.text(),
    linkUrl: t.text(),
    thumbnailUrl: t.text(),

    // Bidding / objective context.
    platformObjective: t.text(),
    optimizationGoal: t.text(),
    bidStrategy: t.text(),

    stats: t.jsonb().$type<AdStats>(),

    externalId: t.text(), // platform ad id
    manageUrl: t.text(),

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
    index("ad_spot_campaign_idx").on(table.campaignId),
    index("ad_spot_brand_idx").on(table.brandId),
    index("ad_spot_status_idx").on(table.status),
  ],
);

export type AdSpot = typeof adSpotTable.$inferSelect;
export type AdSpotInsert = typeof adSpotTable.$inferInsert;

// ---- AUDIENCE TARGET (the intended "who" — "what we want") ----------

export const audienceTargetTable = pgTable(
  "audience_target",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("audt")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(), // canonical "who", e.g. "CA remote workers"
    slug: t.text().notNull(), // stable, idempotent key within a brand
    description: t.text(), // why we want to reach them

    // Durable audience / ICP semantics. Platform targeting mechanics live on
    // audience_activation and the mirrored audience object below.
    profileScope: audienceProfileScopeEnum().default("segment").notNull(),
    marketSide: audienceMarketSideEnum().default("consumer").notNull(),
    researchMaturity: audienceResearchMaturityEnum()
      .default("hypothesis")
      .notNull(),
    // `geography` = where the audience IS (origin). For travel intent, the place
    // we want to send them lives on `destinationGeography` — e.g. origin =
    // Pacific NW, destination = California. "California for California" is the
    // degenerate case where the two are equal.
    geography: t.jsonb().$type<AudienceGeography>(),
    destinationGeography: t.jsonb().$type<AudienceGeography>(),
    demographics: t.jsonb().$type<AudienceDemographics>(),
    context: t.jsonb().$type<AudienceContext>(),

    // Provenance + optional external handle (pixel event name, Amplitude cohort
    // id, seed audience id). Drives how this target is effectuated downstream.
    source: audienceSourceEnum().default("manual").notNull(),
    sourceRef: t.text(),
    // Seasonal/temporal intent — when this audience is worth reaching.
    activeWindow: t.jsonb().$type<AudienceActiveWindow>(),

    type: audienceTypeEnum().notNull(),
    status: audienceTargetStatusEnum().default("planned").notNull(),
    priority: audienceTargetPriorityEnum().default("should_have").notNull(),

    // Ad platforms we intend this audience to be live on (channelPlatform
    // slugs). Compared against the linked `audience` rows to spot gaps.
    intendedChannels: t.jsonb().$type<string[]>(),
    sizeGoalLabel: t.text(), // aspirational reach, e.g. "~500K"

    definition: t.jsonb(), // geo / interest hints, shared with the platform rows
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
    index("audience_target_brand_idx").on(table.brandId),
    index("audience_target_type_idx").on(table.type),
    index("audience_target_status_idx").on(table.status),
    uniqueIndex("audience_target_brand_slug_uq").on(table.brandId, table.slug),
  ],
);

export type AudienceTarget = typeof audienceTargetTable.$inferSelect;
export type AudienceTargetInsert = typeof audienceTargetTable.$inferInsert;

// ---- AUDIENCE ACTIVATION (planned per-platform targeting) ----------

export const audienceActivationTable = pgTable(
  "audience_activation",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("aact")),
    targetId: t
      .text()
      .references(() => audienceTargetTable.id, { onDelete: "cascade" })
      .notNull(),
    platform: channelPlatformEnum().notNull(),
    type: audienceTypeEnum().default("segment").notNull(),
    status: audienceActivationStatusEnum().default("planned").notNull(),

    // Null geography/demographics plus the corresponding mode is deliberate:
    // inherit/narrow/replace and none/inherit_descriptive/override are distinct.
    geographyMode: t.text().default("inherit").notNull(),
    geography: t.jsonb().$type<AudienceGeography>(),
    demographicsMode: t.text().default("none").notNull(),
    demographics: t.jsonb().$type<AudienceDemographics>(),

    targetingSpec: t.jsonb(),
    prompt: t.text(),
    exclusions: t.jsonb().$type<string[]>(),
    specialAdCategory: t.text(),
    complianceNotes: t.text(),
    reachEstimateLabel: t.text(),
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
  }),
  (table) => [
    uniqueIndex("audience_activation_target_platform_uq").on(
      table.targetId,
      table.platform,
    ),
    index("audience_activation_status_idx").on(table.status),
  ],
);

export type AudienceActivation = typeof audienceActivationTable.$inferSelect;
export type AudienceActivationInsert =
  typeof audienceActivationTable.$inferInsert;

// ---- AUDIENCE EVIDENCE (why we believe the profile) ----------------

export const audienceEvidenceTable = pgTable(
  "audience_evidence",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("aevd")),
    targetId: t
      .text()
      .references(() => audienceTargetTable.id, { onDelete: "cascade" })
      .notNull(),
    url: t.text(),
    title: t.text(),
    claim: t.text().notNull(),
    sourceType: t.text().default("research").notNull(),
    observedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [index("audience_evidence_target_idx").on(table.targetId)],
);

export type AudienceEvidence = typeof audienceEvidenceTable.$inferSelect;

// ---- AUDIENCE ------------------------------------------------------

export const audienceTable = pgTable(
  "audience",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("aud")),

    // An audience lives in ONE ad account (channel). The brand-level view
    // ("CA Remote Workers on Meta + Google") is N rows with the same name,
    // deduped by name in the UI — that's the cross-channel view.
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // The strategic target this mirrored audience fulfils, if any.
    targetId: t
      .text()
      .references(() => audienceTargetTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    type: audienceTypeEnum().notNull(),
    source: audienceSourceEnum().default("manual").notNull(),
    externalId: t.text(), // the platform's audience id (parity with campaign.externalId)
    sizeLabel: t.text(), // "~1.2M", "~40K/mo" — coarse, mirrored from platform

    definition: t.jsonb(), // loose source data for later (context hints, geo, etc.)
    manageUrl: t.text(),

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
    index("audience_brand_idx").on(table.brandId),
    index("audience_channel_idx").on(table.channelId),
    index("audience_type_idx").on(table.type),
    index("audience_target_idx").on(table.targetId),
  ],
);

export type Audience = typeof audienceTable.$inferSelect;
export type AudienceInsert = typeof audienceTable.$inferInsert;

// ---- AUDIENCE PLACEMENT (where a platform audience is running) -----

export const audiencePlacementTable = pgTable(
  "audience_placement",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("aplc")),
    audienceId: t
      .text()
      .references(() => audienceTable.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: t
      .text()
      .references(() => campaignTable.id, { onDelete: "cascade" })
      .notNull(),
    adSetId: t.text(),
    adSetName: t.text(),
    status: t.text(),
    stats: t.jsonb().$type<AdStats>(),
    externalId: t.text(),
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
    index("audience_placement_audience_idx").on(table.audienceId),
    index("audience_placement_campaign_idx").on(table.campaignId),
  ],
);

// ---- RELATIONS -----------------------------------------------------

export const initiativeRelations = relations(
  initiativeTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [initiativeTable.brandId],
      references: [brandTable.id],
    }),
    campaigns: many(campaignTable),
  }),
);

export const campaignRelations = relations(campaignTable, ({ one, many }) => ({
  brand: one(brandTable, {
    fields: [campaignTable.brandId],
    references: [brandTable.id],
  }),
  channel: one(channelTable, {
    fields: [campaignTable.channelId],
    references: [channelTable.id],
  }),
  initiative: one(initiativeTable, {
    fields: [campaignTable.initiativeId],
    references: [initiativeTable.id],
  }),
  adSpots: many(adSpotTable),
}));

export const adSpotRelations = relations(adSpotTable, ({ one }) => ({
  campaign: one(campaignTable, {
    fields: [adSpotTable.campaignId],
    references: [campaignTable.id],
  }),
  brand: one(brandTable, {
    fields: [adSpotTable.brandId],
    references: [brandTable.id],
  }),
  channel: one(channelTable, {
    fields: [adSpotTable.channelId],
    references: [channelTable.id],
  }),
}));

export const audienceTargetRelations = relations(
  audienceTargetTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [audienceTargetTable.brandId],
      references: [brandTable.id],
    }),
    audiences: many(audienceTable),
    activations: many(audienceActivationTable),
    evidence: many(audienceEvidenceTable),
  }),
);

export const audienceActivationRelations = relations(
  audienceActivationTable,
  ({ one }) => ({
    target: one(audienceTargetTable, {
      fields: [audienceActivationTable.targetId],
      references: [audienceTargetTable.id],
    }),
  }),
);

export const audienceEvidenceRelations = relations(
  audienceEvidenceTable,
  ({ one }) => ({
    target: one(audienceTargetTable, {
      fields: [audienceEvidenceTable.targetId],
      references: [audienceTargetTable.id],
    }),
  }),
);

export const audienceRelations = relations(audienceTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [audienceTable.brandId],
    references: [brandTable.id],
  }),
  channel: one(channelTable, {
    fields: [audienceTable.channelId],
    references: [channelTable.id],
  }),
  target: one(audienceTargetTable, {
    fields: [audienceTable.targetId],
    references: [audienceTargetTable.id],
  }),
}));

export const audiencePlacementRelations = relations(
  audiencePlacementTable,
  ({ one }) => ({
    audience: one(audienceTable, {
      fields: [audiencePlacementTable.audienceId],
      references: [audienceTable.id],
    }),
    campaign: one(campaignTable, {
      fields: [audiencePlacementTable.campaignId],
      references: [campaignTable.id],
    }),
  }),
);
