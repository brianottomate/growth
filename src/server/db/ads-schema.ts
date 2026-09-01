import { relations, sql } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { brandTable, personaTable } from "./brand-schema";
import { channelPlatformEnum, channelTable } from "./channel-schema";
import type { MediaItem } from "./content-schema";
import { performanceCycleTable } from "./performance-schema";
import { createId } from "./utils";

// ---- THE ADS DOMAIN --------------------------------------------------
//
// Two layers, same split as content (content_post → platform_post):
//
//   PLAN (our words)          campaign → audience, ad
//   MIRROR (their words)      platform_campaign → platform_ad_set → platform_ad
//                             platform_audience (per ad account)
//
// The invariant that keeps them honest: no plan table carries an externalId,
// and no mirror table carries an opinion about intent. Plan budgets are
// advisory; the authoritative budget lives on the platform row that spends
// it. Every mirror row has a NULLABLE pointer to its plan parent — null means
// backfilled/orphaned, which is a first-class state, not an error.

// ---- ENUMS ---------------------------------------------------------

export const platformCampaignStatusEnum = pgEnum("platform_campaign_status", [
  "draft",
  "scheduled",
  "live",
  "paused",
  "ended",
]);
export type PlatformCampaignStatus =
  (typeof platformCampaignStatusEnum.enumValues)[number];

export const audienceTypeEnum = pgEnum("audience_type", [
  "segment",
  "keyword",
  "intent",
  "lookalike",
  "custom",
]);
export type AudienceType = (typeof audienceTypeEnum.enumValues)[number];

// Provenance for a platform audience asset, so lists and lookalikes are typed
// instead of implied by names. Keep in sync with audienceSourceSchema.
export const audienceSourceEnum = pgEnum("audience_source", [
  "manual",
  "pixel_event",
  "customer_list",
  "amplitude_cohort",
  "lookalike_seed",
]);
export type AudienceSource = (typeof audienceSourceEnum.enumValues)[number];

export const campaignStatusEnum = pgEnum("campaign_status", [
  "planned",
  "active",
  "paused",
  "completed",
  "archived",
]);
export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];

export const adTypeEnum = pgEnum("ad_type", ["creative", "text"]);
export type AdType = (typeof adTypeEnum.enumValues)[number];

// ---- SHARED VALUE TYPES ---------------------------------------------

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
  roas?: number;
  purchaseValue?: number;
  costPerConversion?: number;
};

/**
 * Where a plan audience buys. Strict enough to compile (country codes,
 * platform-resolvable region names), unlike a persona's loose prose arrays.
 */
export type AudienceGeographyPlan = {
  /** ISO country codes, e.g. ["US"]. */
  countries?: string[];
  /** Region/state names the platform's geo search can resolve, e.g. ["California"]. */
  regions?: string[];
  cities?: string[];
};

/** Content of a `creative` ad: one image/carousel plus its copy. */
export type AdCreativeContent = {
  headline: string;
  body: string;
  /** Falls back to the campaign's landing URL. */
  linkUrl?: string;
  callToAction?: string;
  /** One item = static image; several = carousel, in this order. */
  media: MediaItem[];
};

/** Content of a `text` ad: the asset pool Google/OpenAI render from. */
export type AdTextContent = {
  headlines: string[];
  descriptions: string[];
  linkUrl?: string;
};

export type AdContent = AdCreativeContent | AdTextContent;

/**
 * Per-platform settings on the platform campaign row itself. Typed JSONB
 * rather than per-platform tables because these are payload we read whole and
 * never filter or join on — and platforms change shapes faster than a
 * migration cadence. Anything we DO query (budget, status, externalId) is a
 * column.
 */
export type PlatformCampaignSettings = {
  google?: {
    /** Zernio supports search and display; the type decides everything else. */
    campaignType?: "search" | "display";
    /**
     * Structured keywords the compile derived (or the operator overrode).
     * Seeded from the plan audiences' keyword suggestions.
     */
    keywords?: string[];
    negativeKeywords?: string[];
    additionalHeadlines?: string[];
    additionalDescriptions?: string[];
    /** Display only: Google renders the advertiser name on the creative. */
    businessName?: string;
  };
  meta?: {
    pixelId?: string;
    customEventType?: string;
    /**
     * Where the budget lives. CBO puts it on the campaign and lets Meta move
     * it between ad sets; ABO gives each ad set its own fixed budget.
     * Defaults to CBO.
     */
    budgetMode?: "cbo" | "abo";
  };
};

// ---- CAMPAIGN (the plan) ---------------------------------------------

/**
 * The first-party plan — the paid counterpart of a content_post. It carries
 * the shared substance (name, goal, landing page, copy context, creative
 * pool) and an ADVISORY budget. Platforms are planned by creating a draft
 * platform_campaign row; audiences and ads hang off this row and are
 * compiled per platform at push time.
 */
export const campaignTable = pgTable(
  "campaign",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("camp")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(),
    slug: t.text(),

    // Goal intent as a slug for now (e.g. "supply", "saas", "brand").
    goal: t.text(),
    landingUrl: t.text(),
    description: t.text(),
    color: t.text(), // UI accent (hex), used for feed bands

    status: campaignStatusEnum().default("active").notNull(),

    /**
     * Shared creative for this campaign's ads — picked once from the brand's
     * media library so an ad references it rather than re-picking per ad.
     */
    creativePool: t.jsonb().$type<MediaItem[]>().default([]),

    /**
     * ADVISORY total (whole dollars): what the operator intends to spend
     * across platforms. Nothing spends this number — it seeds the platform
     * drafts, and the campaign page shows it next to the authoritative
     * per-platform budgets and actual spend.
     */
    budget: t.integer(),

    // Sponsored delivery: the paid performance cycle this campaign fulfils.
    performanceCycleId: t
      .text()
      .references(() => performanceCycleTable.id, { onDelete: "set null" }),

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
    index("campaign_brand_idx").on(table.brandId),
    index("campaign_status_idx").on(table.status),
    index("campaign_performance_cycle_idx").on(table.performanceCycleId),
  ],
);

export type Campaign = typeof campaignTable.$inferSelect;
export type CampaignInsert = typeof campaignTable.$inferInsert;

// ---- AUDIENCE (the plan's "who", with the money) ----------------------

/**
 * One buyable narrowing under a campaign: a coherent targeting cell (one age
 * window, one geography) plus its optional budget split. The row IS the
 * allocation — each one compiles to a Meta ad set / Google ad group. Wanting
 * two age ranges means two audiences, by design.
 *
 * Reuse lives on `persona` (the stable brand-level "who"), not here: these
 * rows are campaign working data, allowed to be many and disposable.
 */
export const audienceTable = pgTable(
  "audience",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("aud")),

    campaignId: t
      .text()
      .references(() => campaignTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    /** The stable persona this audience narrows, when derived from one. */
    personaId: t
      .text()
      .references(() => personaTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    description: t.text(),
    type: audienceTypeEnum().default("segment").notNull(),

    ageMin: t.integer(),
    ageMax: t.integer(),
    geography: t.jsonb().$type<AudienceGeographyPlan>(),
    /**
     * Keyword SUGGESTIONS (loose). The Google compile derives its structured
     * keyword object from these; the Meta compile ignores them. Platform
     * overrides live on the platform campaign's settings.
     */
    keywords: t.jsonb().$type<string[]>(),

    optimizationGoal: t.text(),

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
    index("audience_campaign_idx").on(table.campaignId),
    index("audience_brand_idx").on(table.brandId),
    index("audience_persona_idx").on(table.personaId),
  ],
);

export type PlanAudience = typeof audienceTable.$inferSelect;
export type PlanAudienceInsert = typeof audienceTable.$inferInsert;

// ---- AD (the plan's creative suggestion) ------------------------------

/**
 * A drafted creative combo under a campaign — a SUGGESTION the push
 * transforms into platform ads. `type` picks the content shape: `creative`
 * (Meta image/carousel and friends) or `text` (Google/OpenAI asset pools).
 * Ads belong to the campaign, not to an audience: at push, every ad runs
 * under every ad set. Per-audience ad scoping is a later column, not a table.
 */
export const adTable = pgTable(
  "ad",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ad")),

    campaignId: t
      .text()
      .references(() => campaignTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(),
    type: adTypeEnum().default("creative").notNull(),
    content: t.jsonb().$type<AdContent>().notNull(),

    /**
     * Deterministic key carried to the provider as the idempotency key, and
     * what links this draft to the platform ads it became — externalIds only
     * exist after the platform accepts, so without this a relaunch cannot
     * tell a duplicate from a new ad.
     */
    businessKey: t.text(),

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
    index("ad_campaign_idx").on(table.campaignId),
    index("ad_brand_idx").on(table.brandId),
    uniqueIndex("ad_business_key_idx")
      .on(table.businessKey)
      .where(sql`${table.businessKey} IS NOT NULL`),
  ],
);

export type Ad = typeof adTable.$inferSelect;
export type AdInsert = typeof adTable.$inferInsert;

// ---- PLATFORM CAMPAIGN (mirror) ---------------------------------------

/**
 * One campaign as a platform knows it — or will: `draft` status means
 * "planned for this platform", created when the operator plans the platform,
 * holding its settings and the AUTHORITATIVE budget. The push fills in
 * externalId and flips the status.
 */
export const platformCampaignTable = pgTable(
  "platform_campaign",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pcamp")),

    // Canonical parent: the ad account it runs on. brandId is denormalized.
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    platform: channelPlatformEnum().notNull(), // badge; denormalized from channel

    /** Plan parent. NULL = discovered by sync, not born here. */
    campaignId: t
      .text()
      .references(() => campaignTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    status: platformCampaignStatusEnum().default("draft").notNull(),
    objective: t.text(),

    startAt: t.timestamp({ withTimezone: true }),
    endAt: t.timestamp({ withTimezone: true }),

    /**
     * AUTHORITATIVE budget (whole units of the ad account's currency): what
     * the push sends. Seeded from the plan's advisory numbers, editable on
     * the draft before pushing.
     */
    budget: t.integer(),
    budgetType: t.text(), // "daily" | "lifetime"
    spend: t.integer(),
    adCount: t.integer().default(0).notNull(),

    settings: t.jsonb().$type<PlatformCampaignSettings>().default({}),

    // Latest metrics snapshot + one hero creative thumbnail, so feed/calendar
    // can render a campaign card without touching platform_ad.
    stats: t.jsonb().$type<AdStats>(),
    heroThumbnailUrl: t.text(),

    externalId: t.text(), // platform campaign id; null while draft
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
    index("platform_campaign_brand_idx").on(table.brandId),
    index("platform_campaign_channel_idx").on(table.channelId),
    index("platform_campaign_status_idx").on(table.status),
    index("platform_campaign_campaign_idx").on(table.campaignId),
  ],
);

export type PlatformCampaign = typeof platformCampaignTable.$inferSelect;
export type PlatformCampaignInsert = typeof platformCampaignTable.$inferInsert;

// ---- PLATFORM AD SET (mirror: the middle tier every platform has) ------

/**
 * Meta ad set, Google ad group, TikTok ad group, LinkedIn "campaign" (its
 * top level is "campaign group"). Different names, same job everywhere:
 * this tier owns targeting, placement, schedule, and bid — the campaign owns
 * objective and money strategy, the ad owns creative. One generic table;
 * `platform` on the parent campaign says which dialect you are reading.
 *
 * A physical ad lives in exactly ONE ad set on every platform, so the mirror
 * is a strict tree. Reuse across ad sets happens one level up: a plan `ad`
 * fans out to one platform_ad per set at compile time.
 */
export const platformAdSetTable = pgTable(
  "platform_ad_set",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pas")),

    platformCampaignId: t
      .text()
      .references(() => platformCampaignTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    /** The plan audience this was compiled from. NULL = discovered by sync. */
    audienceId: t
      .text()
      .references(() => audienceTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    status: t.text(), // raw platform status, ingested as-is
    /** What was actually sent to / read from the platform. */
    targetingSpec: t.jsonb(),
    budget: t.integer(),
    budgetType: t.text(),
    optimizationGoal: t.text(),

    externalId: t.text(), // platform ad set / ad group id
    stats: t.jsonb().$type<AdStats>(),

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
    index("platform_ad_set_campaign_idx").on(table.platformCampaignId),
    index("platform_ad_set_audience_idx").on(table.audienceId),
    uniqueIndex("platform_ad_set_external_id_idx")
      .on(table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
  ],
);

export type PlatformAdSet = typeof platformAdSetTable.$inferSelect;
export type PlatformAdSetInsert = typeof platformAdSetTable.$inferInsert;

// ---- PLATFORM AD (mirror) ----------------------------------------------

/**
 * One physical ad on one platform. A drafted `ad` fans out to N of these
 * (platforms × ad sets), each with its own externalId, review status and
 * metrics. `adId` is nullable lineage: null = discovered by sync, or a shape
 * the platform refused 1:1 (one Google RSA can absorb several text drafts).
 */
export const platformAdTable = pgTable(
  "platform_ad",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pad")),

    // Denormalized alongside the true parent below, like brandId: an ad's
    // set row may not exist yet when sync first sees it. When both are set
    // they must agree; compiler and sync construct them together.
    platformCampaignId: t
      .text()
      .references(() => platformCampaignTable.id, { onDelete: "cascade" })
      .notNull(),
    /** The true parent (one ad set per ad, on every platform); sync backfills. */
    platformAdSetId: t
      .text()
      .references(() => platformAdSetTable.id, { onDelete: "set null" }),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),
    platform: channelPlatformEnum().notNull(),

    /** Plan lineage. NULL = discovered by sync or fuzzy mapping. */
    adId: t.text().references(() => adTable.id, { onDelete: "set null" }),

    name: t.text(),
    headline: t.text(),
    body: t.text(),
    linkUrl: t.text(),
    media: t.jsonb().$type<MediaItem[]>(),
    thumbnailUrl: t.text(),

    status: t.text(), // raw platform status (active/paused/rejected/…)
    platformObjective: t.text(),
    optimizationGoal: t.text(),
    bidStrategy: t.text(),

    // Ad set context as Zernio flattens it onto the ad; platformAdSetId is
    // resolved from these when the set row exists.
    externalAdSetId: t.text(),
    adSetName: t.text(),

    stats: t.jsonb().$type<AdStats>(),
    externalId: t.text(), // platform ad id
    manageUrl: t.text(),

    /** Idempotency key echoed from the plan ad that produced this. */
    businessKey: t.text(),

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
    index("platform_ad_campaign_idx").on(table.platformCampaignId),
    index("platform_ad_set_idx").on(table.platformAdSetId),
    index("platform_ad_brand_idx").on(table.brandId),
    index("platform_ad_status_idx").on(table.status),
    index("platform_ad_plan_idx").on(table.adId),
    uniqueIndex("platform_ad_external_id_idx")
      .on(table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
  ],
);

export type PlatformAd = typeof platformAdTable.$inferSelect;
export type PlatformAdInsert = typeof platformAdTable.$inferInsert;

// ---- PLATFORM AUDIENCE (mirror: assets in an ad account) ---------------

/**
 * An audience ASSET as an ad account holds it: custom list, pixel audience,
 * lookalike. Lives under a channel. `sourceId` is the platform-side ancestry
 * ("customer list → lookalike 1%"), which is where lookalike depth actually
 * exists. `audienceId` links the plan audience it fulfils, when one does.
 */
export const platformAudienceTable = pgTable(
  "platform_audience",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("paud")),

    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    /** Plan lineage. NULL = pre-existing asset discovered in the account. */
    audienceId: t
      .text()
      .references(() => audienceTable.id, { onDelete: "set null" }),
    /** The asset this one was derived from (lookalike seed, etc.). */
    sourceId: t.text(),

    name: t.text().notNull(),
    type: audienceTypeEnum().notNull(),
    source: audienceSourceEnum().default("manual").notNull(),
    externalId: t.text(),
    sizeLabel: t.text(), // "~1.2M" — coarse, mirrored from platform

    definition: t.jsonb(),
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
    index("platform_audience_brand_idx").on(table.brandId),
    index("platform_audience_channel_idx").on(table.channelId),
    index("platform_audience_plan_idx").on(table.audienceId),
    uniqueIndex("platform_audience_external_id_idx")
      .on(table.channelId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
  ],
);

export type PlatformAudience = typeof platformAudienceTable.$inferSelect;
export type PlatformAudienceInsert = typeof platformAudienceTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const campaignRelations = relations(campaignTable, ({ one, many }) => ({
  brand: one(brandTable, {
    fields: [campaignTable.brandId],
    references: [brandTable.id],
  }),
  audiences: many(audienceTable),
  ads: many(adTable),
  platformCampaigns: many(platformCampaignTable),
}));

export const audienceRelations = relations(audienceTable, ({ one, many }) => ({
  campaign: one(campaignTable, {
    fields: [audienceTable.campaignId],
    references: [campaignTable.id],
  }),
  brand: one(brandTable, {
    fields: [audienceTable.brandId],
    references: [brandTable.id],
  }),
  persona: one(personaTable, {
    fields: [audienceTable.personaId],
    references: [personaTable.id],
  }),
  platformAdSets: many(platformAdSetTable),
  platformAudiences: many(platformAudienceTable),
}));

export const adRelations = relations(adTable, ({ one, many }) => ({
  campaign: one(campaignTable, {
    fields: [adTable.campaignId],
    references: [campaignTable.id],
  }),
  brand: one(brandTable, {
    fields: [adTable.brandId],
    references: [brandTable.id],
  }),
  platformAds: many(platformAdTable),
}));

export const platformCampaignRelations = relations(
  platformCampaignTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [platformCampaignTable.brandId],
      references: [brandTable.id],
    }),
    channel: one(channelTable, {
      fields: [platformCampaignTable.channelId],
      references: [channelTable.id],
    }),
    campaign: one(campaignTable, {
      fields: [platformCampaignTable.campaignId],
      references: [campaignTable.id],
    }),
    adSets: many(platformAdSetTable),
    ads: many(platformAdTable),
  }),
);

export const platformAdSetRelations = relations(
  platformAdSetTable,
  ({ one, many }) => ({
    platformCampaign: one(platformCampaignTable, {
      fields: [platformAdSetTable.platformCampaignId],
      references: [platformCampaignTable.id],
    }),
    audience: one(audienceTable, {
      fields: [platformAdSetTable.audienceId],
      references: [audienceTable.id],
    }),
    ads: many(platformAdTable),
  }),
);

export const platformAdRelations = relations(platformAdTable, ({ one }) => ({
  platformCampaign: one(platformCampaignTable, {
    fields: [platformAdTable.platformCampaignId],
    references: [platformCampaignTable.id],
  }),
  adSet: one(platformAdSetTable, {
    fields: [platformAdTable.platformAdSetId],
    references: [platformAdSetTable.id],
  }),
  ad: one(adTable, {
    fields: [platformAdTable.adId],
    references: [adTable.id],
  }),
  brand: one(brandTable, {
    fields: [platformAdTable.brandId],
    references: [brandTable.id],
  }),
  channel: one(channelTable, {
    fields: [platformAdTable.channelId],
    references: [channelTable.id],
  }),
}));

export const platformAudienceRelations = relations(
  platformAudienceTable,
  ({ one }) => ({
    brand: one(brandTable, {
      fields: [platformAudienceTable.brandId],
      references: [brandTable.id],
    }),
    channel: one(channelTable, {
      fields: [platformAudienceTable.channelId],
      references: [channelTable.id],
    }),
    audience: one(audienceTable, {
      fields: [platformAudienceTable.audienceId],
      references: [audienceTable.id],
    }),
  }),
);
