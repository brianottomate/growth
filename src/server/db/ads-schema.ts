import { adAccountTable } from "./ad-account-schema";
import { seedListTable } from "./seed-schema";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";
import type { MetaPlacement } from "@/lib/meta-placement-plan";
import type { IdeaStudio } from "@/lib/ad-idea-studio";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { brandTable, personaTable } from "./brand-schema";
import { channelPlatformEnum, channelTable } from "./channel-schema";
import type { AdFormat } from "@/lib/performance-ads";
import type { AdPushGoal } from "@/lib/ad-platforms";

import type { MediaItem } from "./content-schema";
import { bookingTargetTable } from "./home-group-schema";
import { homeTable } from "./home-schema";
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

/**
 * Where an ad is in production, which is not where its campaign is on the
 * platform. Drawn the moment a set is built, approved once someone wants it,
 * which is also what makes it safe from the next rebuild. Nothing here touches
 * Meta; `platform_ad` is the mirror of what does.
 *
 * `kept` sat between the two and carried no behaviour of its own. Nothing is
 * written with it; it stays listed because Postgres cannot drop an enum value.
 */
/**
 * drawn is a draft; ready means its author marked it for review; approved is
 * frozen until Return to Studio reopens the same record. `kept` is legacy.
 */
export const adStatusEnum = pgEnum("ad_status", [
  "drawn",
  "kept",
  "approved",
  "ready",
]);
export type AdStatus = (typeof adStatusEnum.enumValues)[number];

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
export type DeliveryGeography = {
  /** ISO country codes, e.g. ["US"]. */
  countries?: string[];
  /** Whole US states to target, as two-letter codes. */
  states?: string[];
  /** Named country subdivisions outside the US, resolved at export. */
  regions?: string[];
  /** Explicit city delivery targets. */
  cities?: string[];
};

/**
 * A placement's own file for one card, and how it came to be: uploaded as
 * is, cropped from the baseline, extended past its edges by the outpaint, or
 * re-rendered from the composition the baseline came from.
 */
export type AdPlacementVariant = MediaItem & {
  via: "upload" | "crop" | "extend" | "render";
};

/**
 * What one cell of the placement matrix keeps that differs from the base
 * `content`. The map is keyed "<platform>:<placement>", e.g.
 * "meta_ads:facebook_feed"; the placements a platform offers, and each one's
 * crop and copy rules, live in `lib/ad-placements.ts`.
 *
 * Sparse on purpose. A cell with no entry is a live render of the base into
 * the placement's spec and stores nothing, so the library never fills with
 * renders nobody chose. An entry exists only once someone overrides a cell
 * or freezes it. Freezing is per cell: `frozenAt` marks the copy and files
 * the push takes for that placement.
 */
export type AdPlacementCell = {
  /** Copy that differs from the base here. A missing field inherits the base. */
  copy?: {
    headline?: string;
    body?: string;
    callToAction?: string;
    linkUrl?: string;
  };
  /**
   * This placement's own file per card, in card order. `null`, or an array
   * shorter than the cards, means "show the base card in this crop". This
   * generalizes the older `AdCard.story` slot, which was this map with one
   * key; `lib/ad-placements.ts` reads that slot as the story cell until the
   * ad is migrated.
   */
  cards?: (AdPlacementVariant | null)[];
  /** Set when the cell is frozen: these are the files and copy the push takes. */
  frozenAt?: string;
  frozenBy?: string;
  /** Last touch and by what, for the cell's chip. Absent on legacy cells. */
  updatedAt?: string;
  via?: "manual" | "ai" | "director";
  note?: string;
};

/** The sparse per-cell map on an ad. An absent key renders the base. */
export type AdPlacements = Record<string, AdPlacementCell>;

/**
 * One card of an ad: the baseline file every placement falls back to, and
 * the 9:16 that stories and reels show instead when there is one. The push
 * sends both as one ad through Meta's placement asset customization.
 */
export type AdCard = MediaItem & {
  landingUrl?: string;
  bookingTargetId?: string;
  story?: AdPlacementVariant;
  /** Carousel card's own Meta headline and description; blank uses the ad's. */
  headline?: string;
  description?: string;
};

/** Content of a `creative` ad: one image/carousel plus its copy. */
export type AdCreativeContent = {
  /** Editable source recipes and shape variants; no schema migration. */
  ideaStudio?: IdeaStudio;
  metaImport?: {
    campaignId: string;
    adId: string;
    creativeId: string;
    importedAt: string;
    issues: string[];
    rawCreative: Record<string, unknown>;
  };
  /**
   * What the ad is, declared. Absent on ads drawn before the field existed,
   * which read their shape off `media` (see `adFormatOf`). Declared so a
   * shell with no cards yet still knows how many it will hold.
   */
  format?: AdFormat;
  headline: string;
  body: string;
  /** Meta's line under the headline; absent lets Meta scrape the landing page. */
  description?: string;
  /** Falls back to the campaign's landing URL. */
  linkUrl?: string;
  callToAction?: string;
  /** The home the ad is about, as the onboarding list names it; the push names the ad by it. */
  propertyName?: string;
  /**
   * Draw every card as its bare photo, dropping the composition's overlay. For
   * source photos already stamped with a headline or a mark, so the ad does not
   * double up. Reversible: the branded recipe stays in each card's URL and the
   * overlay returns when this is cleared.
   */
  photoOnly?: boolean;
  /** One item = static image; several = carousel, in this order. Empty on a shell awaiting its creative. */
  media: AdCard[];
};

/** Content of a `text` ad: the asset pool Google/OpenAI render from. */
export type AdTextContent = {
  headlines: string[];
  descriptions: string[];
  linkUrl?: string;
};

export type AdContent = AdCreativeContent | AdTextContent;

/** One home's card in a homes run, as the operator watches it happen. */
export type HomesRunStep = {
  name: string;
  url: string;
  status: "pending" | "rendering" | "done" | "reused" | "failed";
  /** The rendered card, once there is one. */
  assetId?: string;
  cardUrl?: string;
  /** What the art director changed, in its own words. */
  changes?: string[];
  note?: string;
};

/**
 * The last "draft ads from their homes" run on a campaign. Written as it
 * goes, so the page can show progress while the mutation is still working
 * and keep the director's notes after it is done.
 */
export type HomesRun = {
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  steps: HomesRunStep[];
  notes: string[];
  adIds: string[];
  error?: string;
};

/**
 * Per-platform settings on the platform campaign row itself. Typed JSONB
 * rather than per-platform tables because these are payload we read whole and
 * never filter or join on — and platforms change shapes faster than a
 * migration cadence. Anything we DO query (budget, status, externalId) is a
 * column.
 */
/**
 * A push that stopped partway. What it created stays on the platform,
 * paused, and is mirrored; this records that the plan is not all there.
 * The platform status stays whatever sync reads.
 */
export type IncompletePlatformPush = {
  at: string;
  /** Where it stopped, e.g. "creating ad set 2 of 3 (name)". */
  stoppedAt: string;
  error: string;
};

export type PlatformCampaignSettings = {
  /** Omitted = all eligible campaign ads; [] = none. Explicit selection stays fixed as ideas are added. */
  selectedAdIds?: string[];
  /** Unassigned Studio ideas shown for planning only; never consumed by publishing. */
  previewAdIds?: string[];
  incompletePush?: IncompletePlatformPush;
  google?: {
    goal?: "traffic" | "engagement" | "awareness" | "conversions";
    geography?: DeliveryGeography;
    /** Zernio supports search and display; the type decides everything else. */
    campaignType?: "search" | "display";
    images?: { landscape: string; square: string };
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
    /** The ad account (and the connection that reaches it) the push uses. */
    destination?: { connectionAccountId: string; adAccountId: string };
    goal?: AdPushGoal;
    /** Explicitly bypass inherited dates; omitted preserves legacy inheritance. */
    startWhenLaunched?: boolean;
    runUntilPaused?: boolean;
    placements?: MetaPlacement[];
    importReviewed?: boolean;
    importSource?: {
      campaignId: string;
      importedAt: string;
      issues: string[];
      adSets: Record<string, unknown>[];
    };
    pixelId?: string;
    customEventType?: string;
    /**
     * Optimise toward this Custom Conversion instead of the raw event. Set
     * by hand to pin one. A client brand with a website always gets a
     * host-scoped one provisioned at push time, for reporting.
     */
    customConversionId?: string;
    /**
     * What a client ad set optimises on when no conversion is pinned. "pixel"
     * (the default) runs on the shared fleet-wide event, for volume; "host"
     * optimises on the host-scoped custom conversion. Reporting reads the
     * host-scoped conversion either way. Meta freezes the choice once the
     * ad set is published.
     */
    conversionScope?: "host" | "pixel";
    /**
     * Where the budget lives. CBO puts it on the campaign and lets Meta move
     * it between ad sets; ABO gives each ad set its own fixed budget.
     * Defaults to CBO.
     */
    budgetMode?: "cbo" | "abo";
    /**
     * Lead generation: the Meta instant form on the brand's Page that the
     * ad set points at. The form is the ad's destination; Meta owns it and
     * Growth lists the Page's forms by this id.
     */
    leadFormId?: string;
  };
  linkedin?: {
    /**
     * The Company Page that authors the Direct Sponsored Content behind every
     * ad: a numeric organization id or urn:li:organization:N. Zernio infers
     * it when the ad account is owned by an organization.
     */
    organizationId?: string;
    /** Bid type; CPM when omitted. Required when unitCost is set. */
    costType?: "CPM" | "CPC" | "CPV";
    /** Manual bid in whole account-currency units; omit for automated bidding. */
    unitCost?: number;
    /** CTA button on every creative; LEARN_MORE when omitted and a link is set. */
    callToAction?: string;
  };
  openai?: {
    goal?: "traffic" | "awareness" | "conversions";
    /**
     * Fixed bidding. Omitted means Maximize Results, which OpenAI allows
     * only for traffic and conversions on a daily budget.
     */
    bidStrategy?:
      | "LOWEST_COST_WITHOUT_CAP"
      | "LOWEST_COST_WITH_BID_CAP"
      | "COST_CAP";
    /** Bid in whole account-currency units; required with a capped strategy. */
    bidAmount?: number;
    /**
     * conversions goal: the optimizable event on the account's tracking tag,
     * by id, eventType or name. Set per campaign; OpenAI rejects anything
     * else in promotedObject.
     */
    customEventType?: string;
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
    bookingTargetId: t
      .text()
      .references(() => bookingTargetTable.id, { onDelete: "set null" }),
    description: t.text(),
    color: t.text(), // UI accent (hex), used for feed bands

    status: campaignStatusEnum().default("active").notNull(),

    /**
     * Shared creative for this campaign's ads — picked once from the brand's
     * media library so an ad references it rather than re-picking per ad.
     */
    creativePool: t.jsonb().$type<MediaItem[]>().default([]),

    /**
     * RETIRED with "draft ads from their homes": nothing writes or reads it.
     * Kept so the build's schema push does not stop on a column drop.
     */
    homesRun: t.jsonb().$type<HomesRun>(),

    /**
     * ADVISORY total (whole dollars): what the operator intends to spend
     * across platforms. Nothing spends this number, and platform drafts do not
     * copy it; the campaign page shows it next to the authoritative
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

// ---- AUDIENCE (the campaign's "who and why") ----------------------

/** Campaign-specific customer intent. Executable settings live on platform plans. */
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
    /** Intended locations of people; destination interests belong in description/persona.
     * Platform plans own executable delivery targeting. */
    geography: t.jsonb().$type<DeliveryGeography>(),
    /** Intended ages; never automatically inherited or sent to a platform. */
    ageMin: t.integer(),
    ageMax: t.integer(),
    type: audienceTypeEnum().default("segment").notNull(),

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
    check(
      "audience_age_min_valid",
      sql`${table.ageMin} IS NULL OR ${table.ageMin} BETWEEN 0 AND 120`,
    ),
    check(
      "audience_age_max_valid",
      sql`${table.ageMax} IS NULL OR ${table.ageMax} BETWEEN 0 AND 120`,
    ),
    check(
      "audience_age_order_valid",
      sql`${table.ageMin} IS NULL OR ${table.ageMax} IS NULL OR ${table.ageMin} <= ${table.ageMax}`,
    ),
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
 * under every ad set of each platform in its `platforms`. Per-audience ad
 * scoping is a later column, not a table.
 */
export const adTable = pgTable(
  "ad",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ad")),

    /**
     * NULL until the ad is put in a campaign, which is what a draft is. A
     * Performance set is drafted, reviewed and adjusted against the brand,
     * and attached to the month it runs in only once someone has decided;
     * requiring a campaign up front forced an empty one to exist first.
     */
    campaignId: t
      .text()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    /** The home this ad is about, when it is about one. */
    homeId: t.text().references(() => homeTable.id, { onDelete: "set null" }),
    bookingTargetId: t
      .text()
      .references(() => bookingTargetTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    type: adTypeEnum().default("creative").notNull(),
    status: adStatusEnum().default("drawn").notNull(),
    /** Prepared creative. Approval locks edits; campaign attachment saves its exports. */
    content: t.jsonb().$type<AdContent>().notNull(),
    /**
     * Per platform × placement cells that differ from `content`: copy
     * overrides, a placement's own files, and whether the cell is frozen.
     * Sparse; an absent key renders the base and stores nothing. Kept apart
     * from `content` so a global copy edit writes one column and a selective
     * one writes the other. See `AdPlacements`.
     *
     * Nullable: this column lands in production through the release build's
     * schema push, so code that reads it must tolerate its absence until then.
     */
    placements: t.jsonb().$type<AdPlacements>(),

    /**
     * Where this idea runs. Null or empty means every planned platform that
     * can render it (text to search, creative to feeds); a list narrows it.
     * The compile filters by this before anything else.
     */
    platforms: channelPlatformEnum().array(),

    /**
     * Deterministic key carried to the provider as the idempotency key, and
     * what links this draft to the platform ads it became — externalIds only
     * exist after the platform accepts, so without this a relaunch cannot
     * tell a duplicate from a new ad.
     */
    businessKey: t.text(),

    /** Marked ready for review, and by whom. Service edits clear it. */
    readyAt: t.timestamp(),
    readyBy: t.text().references(() => userTable.id, { onDelete: "set null" }),
    /** Signed off, and by whom. Set once; an approved ad is final. */
    approvedAt: t.timestamp(),
    approvedBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    /**
     * Legacy replacement link, retained for compatibility; new flows do not write it.
     */
    replacesAdId: t.text().references((): AnyPgColumn => adTable.id, {
      onDelete: "set null",
    }),

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

    /** Direct reporting membership, independent of the planned campaign parent. */
    performanceCycleId: t
      .text()
      .references(() => performanceCycleTable.id, { onDelete: "set null" }),
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

// ---- PLATFORM DELIVERY GROUP (planned or imported native delivery unit) ------

/**
 * Meta ad set, Google ad group, TikTok ad group, LinkedIn "campaign" (its
 * top level is "campaign group"). Different names, same job everywhere:
 * this tier owns targeting, placement, schedule, and bid — the campaign owns
 * objective and money strategy, the ad owns creative. One generic table;
 * `platform` on the parent campaign says which dialect you are reading.
 *
 * A mirrored ad belongs to one native delivery group, so the mirror
 * is a strict tree. Reuse across ad sets happens one level up: a plan `ad`
 * fans out to one platform_ad per set at compile time.
 */
export const platformDeliveryGroupTable = pgTable(
  "platform_delivery_group",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pdg")),

    platformCampaignId: t
      .text()
      .references(() => platformCampaignTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    /** Optional shared audience lineage. NULL for broad plans and native imports. */
    audienceId: t
      .text()
      .references(() => audienceTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    status: t.text(), // raw platform status, ingested as-is
    /** What was actually sent to / read from the platform. */
    /** Editable, validated local delivery plan; null for unreviewed imports. */
    configuration: t.jsonb().$type<DeliveryGroupConfiguration>(),
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
    index("platform_delivery_group_campaign_idx").on(table.platformCampaignId),
    index("platform_delivery_group_audience_idx").on(table.audienceId),
    uniqueIndex("platform_delivery_group_external_id_idx")
      .on(table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
  ],
);

export type PlatformDeliveryGroup =
  typeof platformDeliveryGroupTable.$inferSelect;
export type PlatformDeliveryGroupInsert =
  typeof platformDeliveryGroupTable.$inferInsert;

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
    platformDeliveryGroupId: t
      .text()
      .references(() => platformDeliveryGroupTable.id, {
        onDelete: "set null",
      }),
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
    /** The full text pools sent, where the platform takes pools (Google RSA). */
    copy: t.jsonb().$type<{ headlines: string[]; descriptions: string[] }>(),
    /** What Growth pushed; sync updates observed fields without overwriting this. */
    pushedCreative: t.jsonb().$type<{
      name: string;
      headline: string | null;
      body: string | null;
      linkUrl: string | null;
      media: MediaItem[] | null;
      copy: { headlines: string[]; descriptions: string[] } | null;
    }>(),
    thumbnailUrl: t.text(),

    status: t.text(), // raw platform status (active/paused/rejected/…)
    platformObjective: t.text(),
    optimizationGoal: t.text(),
    bidStrategy: t.text(),

    // Ad set context as Zernio flattens it onto the ad; platformDeliveryGroupId is
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
    index("platform_delivery_group_idx").on(table.platformDeliveryGroupId),
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
    /**
     * The persona this asset is bought for. At most one per persona per
     * platform: a campaign audience derived from the persona targets it when
     * it has no direct `audienceId` link of its own, so one lookalike serves
     * every campaign built for that persona.
     */
    personaId: t
      .text()
      .references(() => personaTable.id, { onDelete: "set null" }),
    /** Destination identity owned by the allowlist registry; provider JSON is provenance. */
    adAccountId: t
      .text()
      .references(() => adAccountTable.id, { onDelete: "restrict" }),
    /** The seed list a customer list was uploaded from. */
    seedListId: t
      .text()
      .references(() => seedListTable.id, { onDelete: "set null" }),
    /** Local identity of a lookalike's seed; external sourceId remains provider provenance. */
    parentPlatformAudienceId: t
      .text()
      .references((): AnyPgColumn => platformAudienceTable.id, {
        onDelete: "restrict",
      }),
    /** The asset this one was derived from (lookalike seed, etc.). */
    sourceId: t.text(),
    /**
     * The client brand a seed asset in Wander's account was built for. Its
     * lookalike reaches that brand only by an Ads Manager share, after which
     * the client account's own mirror row carries the same externalId.
     */
    forBrandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    type: audienceTypeEnum().notNull(),
    source: audienceSourceEnum().default("manual").notNull(),
    externalId: t.text(),
    sizeLabel: t.text(), // "~1.2M" — coarse, mirrored from platform

    definition: t.jsonb(),
    /** Operational metadata only; never recipient rows or uploaded files. */
    seedMetadata: t.jsonb().$type<{
      count: number;
      status: "uploading" | "ready" | "failed";
    }>(),
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
    index("platform_audience_persona_idx").on(table.personaId),
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
  platformDeliveryGroups: many(platformDeliveryGroupTable),
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
  home: one(homeTable, {
    fields: [adTable.homeId],
    references: [homeTable.id],
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
    deliveryGroups: many(platformDeliveryGroupTable),
    ads: many(platformAdTable),
  }),
);

export const platformDeliveryGroupRelations = relations(
  platformDeliveryGroupTable,
  ({ one, many }) => ({
    platformCampaign: one(platformCampaignTable, {
      fields: [platformDeliveryGroupTable.platformCampaignId],
      references: [platformCampaignTable.id],
    }),
    audience: one(audienceTable, {
      fields: [platformDeliveryGroupTable.audienceId],
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
  deliveryGroup: one(platformDeliveryGroupTable, {
    fields: [platformAdTable.platformDeliveryGroupId],
    references: [platformDeliveryGroupTable.id],
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
    persona: one(personaTable, {
      fields: [platformAudienceTable.personaId],
      references: [personaTable.id],
    }),
  }),
);

/** One reusable asset per platform for each campaign audience. */
export const campaignAudienceAssetTable = pgTable(
  "campaign_audience_asset",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("caasset")),
    audienceId: t
      .text()
      .notNull()
      .references(() => audienceTable.id, { onDelete: "cascade" }),
    platformAudienceId: t
      .text()
      .notNull()
      .references(() => platformAudienceTable.id, { onDelete: "cascade" }),
    platform: channelPlatformEnum().notNull(),
  }),
  (table) => [
    uniqueIndex("campaign_audience_asset_platform_idx").on(
      table.audienceId,
      table.platform,
    ),
    index("campaign_audience_asset_asset_idx").on(table.platformAudienceId),
  ],
);
