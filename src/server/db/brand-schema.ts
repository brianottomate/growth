import type { BrandingProfile } from "@mendable/firecrawl-js";
import type { PerformanceChecklist } from "@/lib/performance-checklist";
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organizationTable, userTable } from "./auth-schema";
import { createId } from "./utils";

// ---- ENUMS ---------------------------------------------------------

// A brand is either a company or a personal brand (founder, employee).
export const brandTypeEnum = pgEnum("brand_type", ["company", "personal"]);
export type BrandType = (typeof brandTypeEnum.enumValues)[number];

// Wander's relationship to a brand, which is a different question from what
// the brand IS (`type`). Wander's own brands, paying Performance clients,
// targets a rep is pitching, and competitors we merely watch all belong in
// one table and none of them belong in the same list.
/** The money and the relationship. See lib/performance-stage. */
export const businessStageEnum = pgEnum("business_stage", [
  "prospect",
  "pitch_sent",
  "meeting_booked",
  "signed",
  "paid",
  "paused",
  "lost",
  "churned",
]);

/** The production line, from intake to live ads. See lib/performance-stage. */
export const deliveryStageEnum = pgEnum("delivery_stage", [
  "not_started",
  "intake_sent",
  "intake_submitted",
  "access_verified",
  "ads_review",
  "live",
  "paused",
]);

export const brandRelationshipEnum = pgEnum("brand_relationship", [
  "internal",
  "client",
  "prospect",
  "reference",
]);
export type BrandRelationship =
  (typeof brandRelationshipEnum.enumValues)[number];

// Why an owned brand tracks a reference brand.
export const inspirationPurposeEnum = pgEnum("inspiration_purpose", [
  "competitor", // defensive analysis
  "inspiration", // emulation
]);
export type InspirationPurpose =
  (typeof inspirationPurposeEnum.enumValues)[number];

// Access-grant role hierarchy (viewer < contributor < editor < admin < owner).
export const accessRoleEnum = pgEnum("access_role", [
  "viewer",
  "contributor",
  "editor",
  "admin",
  "owner",
]);
export type AccessRole = (typeof accessRoleEnum.enumValues)[number];

// Polymorphic subject for resource access grants.
export const accessSubjectTypeEnum = pgEnum("access_subject_type", [
  "user",
  "organization",
  "team",
]);
export type AccessSubjectType =
  (typeof accessSubjectTypeEnum.enumValues)[number];

// ---- JSONB SHAPES --------------------------------------------------

// Jungian voice archetypes (used inside the fingerprint, not a DB column).
export const BRAND_VOICE_TYPES = [
  "hero",
  "challenger",
  "sage",
  "innocent",
  "explorer",
  "creator",
  "ruler",
  "caregiver",
  "everyman",
  "jester",
  "lover",
  "magician",
] as const;
export type BrandVoiceType = (typeof BRAND_VOICE_TYPES)[number];

export type BrandWebsiteMeta = {
  title?: string;
  description?: string;
  favicon?: string;
  ogImage?: string;
  scrapedAt?: string; // ISO 8601
};

/**
 * The mark a brand's cards carry, chosen by an operator rather than scraped.
 * `variants` are library assets rendered from the recipe: the colour version,
 * a white silhouette for photos, a near-black one for light grounds.
 */
export type BrandMark = {
  source: "logo" | "favicon" | "lockup";
  /** Lockup only: the icon beside the name, a library asset. */
  iconAssetId?: string | null;
  /** Lockup only: the icon taken from the scraped logo or favicon instead. */
  iconFrom?: "logo" | "favicon" | null;
  /** Lockup only: the wordmark text. Defaults to the brand name. */
  text?: string | null;
  /** Lockup only: the family the text is set in; null means the house font. */
  fontFamily?: string | null;
  variants: { color: string; white: string; dark: string };
  /**
   * The mark traced to SVG, when the shape traces cleanly: white and dark
   * always, colour only when the mark is drawn in a single colour.
   */
  vector?: { white: string; dark: string; color?: string | null } | null;
  /**
   * An art director's corrections to the measured lockup, in cap heights, from
   * a vision pass over the first render. Stored so every tone and every later
   * render agrees with what was judged.
   */
  tuning?: {
    iconScale: number;
    iconShift: number;
    gapScale: number;
    note: string;
  } | null;
  updatedAt: string;
};

/**
 * One card kept as a preview of the brand's ads: what they will look like
 * before any campaign exists, the way the mark shows what the lockup looks
 * like before anything is published. A reference, not a copy: the card is a
 * library asset whose composition metadata already holds the spec that made
 * it, so the Studio can reopen it and a homes run can read its blueprint.
 */
/**
 * A Performance client's settings: the live state a person or the agent
 * sets, or that an intake is promoted into. The intake itself stays a
 * client-only receipt. Facts with a table of their own are not repeated here:
 * budget is on the cycle, access on the intake verification, homes on
 * performance_property, spend on the platform rows.
 * Applied with scripts/apply-performance-settings-schema.ts.
 */
export type PerformanceSettings = {
  /** Verified tracking defaults, keyed by the paying Meta account id. */
  metaTrackingDefaults?: Record<
    string,
    { pixelId: string; customEventType: string }
  >;

  /** Brand whose Zernio connection is explicitly shared for paid ads only. */
  adsConnectionBrandId?: string;
  homeInventory?: import("@/server/services/home-inventory.service").HomeInventory;
  /** Who receives the monthly report; free text, commas between addresses. */
  reportEmails?: string | null;
  invoiceEmail?: string | null;
  /** What the client said about reusing guest content, in their words. */
  ugcPermission?: string | null;
  /** The client's own creative and guest-list folders, from the intake or a rep. */
  creativeDriveUrl?: string | null;
  guestListDriveUrl?: string | null;
  /** The tracker sheet's creative columns. */
  catalogCreativeUrl?: string | null;
  carouselCreativeUrl?: string | null;
  heroCreativeUrl?: string | null;
  adCopiesUrl?: string | null;
  dedicatedNewsletter?: string | null;
  influencer?: string | null;
  socialMediaPosts?: string | null;
  /** Bookings reported by hand, until the platform counts them. */
  bookings?: number | null;
  updatedAt?: string;
  updatedBy?: string | null;
  /** What last wrote here: the intake being applied, a person, or the agent. */
  updatedFrom?: "intake" | "operator" | "agent";
};

export type BrandAdPreview = {
  assetId: string;
  /** The blueprint and canvas the card was rendered with, for the caption. */
  templateId: string;
  formatId: string;
  /** The listing the photo came from, when it came from one. */
  homeUrl?: string | null;
  savedAt: string;
  savedBy?: string | null;
};

export type BrandIdentity = {
  /** Firecrawl's whole branding profile, kept so nothing it read is lost. */
  raw?: BrandingProfile;
  colorScheme?: "light" | "dark";
  colors?: { primary?: string; secondary?: string; accent?: string };
  fonts?: Array<{ family: string; weight?: number; role?: "body" | "heading" }>;
  /**
   * Set when an operator picked the fonts instead of taking the scrape.
   * Re-enrich keeps `fonts` while this is set; the scrape stays in `raw`.
   */
  fontsChosen?: { by: string; at: string } | null;
  logo?: string | null;
  favicon?: string | null;
  personality?: { tone: string; energy: string; targetAudience: string };
  extractedAt?: string;
};

// AI-extracted voice, used as prompt-injection context when forging content.
export type BrandFingerprint = {
  fingerprintText: string; // full voice description for prompt injection
  voices: BrandVoiceType[]; // archetypes
  extractedAt?: string;
  postsAnalyzed?: number;
};

// The shared listening "story" — the WHAT-is-signal judgment + reply guidance,
// reused across every listening source (the sibling of the publishing
// fingerprint). VOICE is NOT duplicated here: it's read from brandFingerprint
// (posting voice == replying voice). This carries only the listening-specific
// judgment that's currently copy-pasted into each monitor's system prompt.
export type BrandListeningStory = {
  signalGuidance: string; // what counts as high/low signal; what's worth engaging
  replyGuidance: string; // how we reply — etiquette + the "Wander Test"
  productBoilerplate?: string; // the WanderOS / Sites / Operated framing
  updatedBy?: string;
  updatedAt?: string;
};

// Raw AI market research blob (Parallel AI etc.). Pillars get promoted to a
// real table later; this keeps the loose source data.
export type BrandIndustryResearch = {
  confidence?: "low" | "medium" | "high";
  sources?: string[];
  analyzedAt?: string;
  [key: string]: unknown;
};

// Named external links surfaced on the brand card — the app becomes the index
// (where you go to find things) while the linked tool (a tracker Sheet, a Notion
// doc, a dashboard) stays the system-of-record. `url` is optional so a link can
// be dropped as a placeholder ("this brand should have a podcast tracker") and
// filled in later; a label-only entry reads as a pending to-do.
export const BRAND_LINK_CATEGORIES = [
  "sheet",
  "doc",
  "dashboard",
  "design",
  "other",
] as const;
export type BrandLinkCategory = (typeof BRAND_LINK_CATEGORIES)[number];

export type BrandLink = {
  label: string; // required — the only thing you must provide
  url?: string; // fill in later
  category?: BrandLinkCategory; // drives the chip icon; auto-detected from the URL
};

// ---- BRAND TABLE ---------------------------------------------------

/**
 * Brand — the hub of the whole model.
 *
 * - Owned brand: `organizationId` is set (Wander, WanderOS, a founder's personal brand).
 * - Reference/competitor brand: `organizationId` is NULL, populated by scraping,
 *   linked to owners via `brandInspirationTable`.
 *
 * Owned-only data (campaigns, pillars, audiences, OAuth channels, lifecycle) FK to
 * `brand` and is simply never created for reference rows. Guard "my brands" queries
 * with `organizationId IS NOT NULL`.
 */
export const brandTable = pgTable(
  "brand",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("brand")),

    // NULL => reference/competitor brand (no owner).
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" }),

    // The user who owns/manages this brand — implicit full-access owner.
    // NULL for reference/competitor brands.
    ownerId: t.text().references(() => userTable.id),

    type: brandTypeEnum().default("company").notNull(),

    relationship: brandRelationshipEnum().default("internal").notNull(),

    /**
     * The two Performance lifecycles. Null for brands that are not on the
     * desk. Business is set by a person; delivery mostly by workflows, which
     * only move it forward. The ⋯ dialog can set either to anything.
     */
    businessStage: businessStageEnum(),
    businessStageAt: t.timestamp({ withTimezone: true }),
    deliveryStage: deliveryStageEnum(),
    deliveryStageAt: t.timestamp({ withTimezone: true }),

    /**
     * The brand's WanderOS site, when they have one.
     *
     * The id is discovered by reading their own homepage, which is a fetch of
     * their site plus a regex, so it is cached here rather than repeated on
     * every listing read. NULL with `wanderOsCheckedAt` set means we looked
     * and they are not on WanderOS, which is the common case and is worth
     * remembering just as much as a hit.
     */
    wanderOsWebsiteId: t.text(),
    wanderOsCheckedAt: t.timestamp({ withTimezone: true }),

    // The domain of the `leads.lead_domain` row a prospect came from. A text
    // column rather than a foreign key on purpose: `leads` lives in its own
    // Postgres schema so it stays droppable, and a cross-schema FK would take
    // that away.
    leadDomain: t.text(),

    // Basic info
    name: t.text().notNull(),
    slug: t.text(), // unique within an org for owned brands; null for references
    tagline: t.text(), // short positioning line (e.g. "Luxury travel marketplace")
    description: t.text(),
    logo: t.text(),
    website: t.text(),

    // One Zernio workspace is shared by Wander. Each owned brand maps to
    // one profile in that workspace; its connected accounts live on `channel`.
    zernioProfileId: t.text(),
    // The Facebook Page this brand's ads and posts run as. A Performance
    // client grants it through Leadsie, and Verify access records it here.
    // Zernio binds a Meta connection to ONE Page and offers no per-ad
    // override, so the push refuses a connection bound to any other Page, and
    // the connect flow re-selects this one when a client's connection lands
    // on the wrong Page.
    metaPageId: t.text(),
    /**
     * The home an operator chose to stand for the brand: its listing URL on
     * their site. The Performance brand page draws the on-demand ad previews
     * from it. Null means nobody has picked a hero yet; nothing is guessed
     * in its place.
     */
    featuredListingUrl: t.text(),
    /**
     * The brand story: a short, plain-language brief of what makes this
     * brand itself, who books it and why, and the creative taste it wants.
     * Drafted by AI at setup, edited by the operator, and updated by the
     * agent as it learns from corrections. Injected into every creative
     * prompt for the brand. Null until drafted.
     */
    story: t.text(),
    /**
     * The photo the on-demand ad previews are drawn on: a home's hero on
     * their WanderOS site or a library image, by URL. Picking a home sets
     * this and `featuredListingUrl` together; a library image sets this
     * alone and the featured home keeps supplying the copy. Null means the
     * featured home's own hero.
     */
    previewSourceUrl: t.text(),

    // Bearer secret for /connect/[token], the no-login page where a client
    // connects their own accounts into this brand's Zernio profile. The link
    // is the credential: regenerating it is how a sent link is revoked.
    connectToken: t.text(),
    // Who at Wander issued the link. The connect page is the only surface a
    // client sees, so it names a person and gives them somewhere to ask —
    // stamped at mint rather than read live, because the page has no session
    // and the issuer is a fact about the link, not about the brand.
    connectTokenIssuedByName: t.text(),
    connectTokenIssuedByEmail: t.text(),
    connectTokenIssuedAt: t.timestamp({ withTimezone: true }),
    /**
     * Last time anyone hit the public access check for this brand. The only
     * rate limit that survives serverless: an in-memory counter is per
     * instance, and this endpoint reaches Zernio and then Meta, so an
     * unthrottled public route is someone else's outage.
     */
    lastAccessCheckAt: t.timestamp({ withTimezone: true }),

    // Cached aggregate (sum of channel followers) for overview cards.
    followerCount: t.integer(),

    // Enrichment (AI / scraped) — JSONB until we need to query it.
    websiteMeta: t.jsonb().$type<BrandWebsiteMeta>(),
    brandIdentity: t.jsonb().$type<BrandIdentity>(),
    brandMark: t.jsonb().$type<BrandMark>(),
    /**
     * Cards saved as previews of the brand's ads, newest first. Applied with
     * scripts/apply-brand-ad-previews-schema.ts; see that file for why.
     */
    adPreviews: t.jsonb().$type<BrandAdPreview[]>(),
    /** Live client settings; see PerformanceSettings. */
    performanceSettings: t.jsonb().$type<PerformanceSettings>(),
    /** Hand-kept performance checklist; see PerformanceChecklist. Each field carries who last set it. */
    performanceChecklist: t.jsonb().$type<PerformanceChecklist>(),
    brandFingerprint: t.jsonb().$type<BrandFingerprint>(),
    // Shared listening judgment + reply guidance (voice still from brandFingerprint).
    brandListeningStory: t.jsonb().$type<BrandListeningStory>(),
    industryResearch: t.jsonb().$type<BrandIndustryResearch>(),

    // Named external links (tracker Sheets, docs, dashboards) shown on the card.
    links: t.jsonb().$type<BrandLink[]>().default([]),

    isActive: t.boolean().default(true).notNull(),

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
    index("brand_org_id_idx").on(table.organizationId),
    index("brand_owner_id_idx").on(table.ownerId),
    index("brand_type_idx").on(table.type),
    uniqueIndex("brand_org_slug_idx").on(table.organizationId, table.slug),
    uniqueIndex("brand_zernio_profile_idx").on(table.zernioProfileId),
    uniqueIndex("brand_connect_token_idx").on(table.connectToken),
    check(
      "brand_zernio_profile_owned_check",
      sql`${table.zernioProfileId} IS NULL OR ${table.organizationId} IS NOT NULL`,
    ),
  ],
);

export type Brand = typeof brandTable.$inferSelect;
export type BrandInsert = typeof brandTable.$inferInsert;

// ---- BRAND INSPIRATION (self-referencing junction) -----------------

/**
 * BrandInspiration — links an owned brand to a reference brand it tracks.
 *
 * Many-to-many on `brand` so one canonical competitor (e.g. Airbnb) can be
 * referenced by several owned brands ("ref by Wander · WanderOS") without
 * duplicating the competitor row.
 */
export const brandInspirationTable = pgTable(
  "brand_inspiration",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("insp")),

    // The owner doing the tracking.
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // The reference/competitor brand being tracked.
    inspirationBrandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    purpose: inspirationPurposeEnum().default("inspiration").notNull(),
    notes: t.text(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("brand_inspiration_brand_idx").on(table.brandId),
    index("brand_inspiration_inspiration_idx").on(table.inspirationBrandId),
    uniqueIndex("brand_inspiration_pair_idx").on(
      table.brandId,
      table.inspirationBrandId,
    ),
  ],
);

export type BrandInspiration = typeof brandInspirationTable.$inferSelect;
export type BrandInspirationInsert = typeof brandInspirationTable.$inferInsert;

// ---- ACCESS GRANTS --------------------------------------------------------

/**
 * Access — grants a polymorphic subject (user / organization / team) a role on
 * a brand. Effective access is resolved (in a future `security` service) by
 * taking the most permissive role across a user's direct grant + their org/team
 * grants, with `brand.ownerId` as an implicit owner.
 */
export const accessTable = pgTable(
  "access",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("acc")),

    // The resource being shared. Brand-scoped for now; switch to a polymorphic
    // resourceType/resourceId pair if sub-resource grants are ever needed.
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    subjectType: accessSubjectTypeEnum().notNull(),
    subjectId: t.text().notNull(), // user.id | organization.id | team.id

    role: accessRoleEnum().default("viewer").notNull(),
    permissions: t.jsonb(), // flexible escape hatch for provider-specific grants
    label: t.text(), // optional human label for the grant

    invitedBy: t.text().references(() => userTable.id),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("access_brand_idx").on(table.brandId),
    index("access_subject_idx").on(table.subjectType, table.subjectId),
    // One role per subject per brand.
    uniqueIndex("access_unique_idx").on(
      table.brandId,
      table.subjectType,
      table.subjectId,
    ),
  ],
);

export type Access = typeof accessTable.$inferSelect;
export type AccessInsert = typeof accessTable.$inferInsert;

// ---- PERSONA (who the brand talks to) --------------------------------

/**
 * The stable brand-level "who" — the people counterpart of a content pillar
 * ("what we talk about" / "who hears it"). Few per brand, curated, and
 * PLANNING-MODE ONLY: the metadata here is loose prose arrays that inspire
 * campaign audiences and content, never ad targeting by itself. The strict,
 * compilable narrowing ("CA homebuyers 30-50, $5/day") is a campaign-scoped
 * `audience` row that may point back here via personaId.
 */
/**
 * Structured demand geography for a persona: where the guests we want come
 * FROM. This is the interesting side. Supply geography — where a brand's homes
 * are — is housekeeping that lives on the listings; this is the demand signal
 * that shapes who the ads chase. Mirrors a campaign audience's geography on
 * purpose: the persona is the reusable brand-level source, the audience the
 * per-campaign buy derived from it. Filled today by an operator or an agent's
 * reasoning (often a blob looked up in another system and pasted in), not yet
 * a live data source; `source` records where it came from.
 */
export type PersonaDemandGeography = {
  /** ISO country codes, e.g. ["US"]. */
  countries?: string[];
  /** Two-letter state codes, e.g. ["CA", "TX"]. */
  states?: string[];
  /** Region/state names a platform geo search resolves, e.g. ["California"]. */
  regions?: string[];
  /** City names, e.g. ["Los Angeles", "Dallas"]. */
  cities?: string[];
  /** Provenance: an operator note, the system a blob was pasted from, a date. */
  source?: string | null;
};

export const personaTable = pgTable(
  "persona",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pers")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(), // "First-time homebuyers"
    description: t.text(),

    /** Loose prose, e.g. ["30-50", "retirement age"]. Not targeting. */
    ageRanges: t.jsonb().$type<string[]>(),
    /** Loose prose, e.g. ["California", "big US cities"]. Not targeting. */
    geographies: t.jsonb().$type<string[]>(),
    /**
     * The demand side, structured: where the guests we want come from. Filled
     * by an operator or agent; a campaign audience can be derived from it.
     */
    demandGeography: t.jsonb().$type<PersonaDemandGeography>(),
    notes: t.text(),

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
  (table) => [index("persona_brand_idx").on(table.brandId)],
);

export type Persona = typeof personaTable.$inferSelect;
export type PersonaInsert = typeof personaTable.$inferInsert;

export const personaRelations = relations(personaTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [personaTable.brandId],
    references: [brandTable.id],
  }),
}));

// ---- RELATIONS -----------------------------------------------------

export const brandRelations = relations(brandTable, ({ one, many }) => ({
  organization: one(organizationTable, {
    fields: [brandTable.organizationId],
    references: [organizationTable.id],
  }),
  owner: one(userTable, {
    fields: [brandTable.ownerId],
    references: [userTable.id],
  }),
  // Reference brands this brand tracks.
  inspirations: many(brandInspirationTable, { relationName: "owner" }),
  // Owned brands that track this (reference) brand.
  trackedBy: many(brandInspirationTable, { relationName: "inspiration" }),
  // Access grants on this brand.
  access: many(accessTable),
}));

export const brandInspirationRelations = relations(
  brandInspirationTable,
  ({ one }) => ({
    brand: one(brandTable, {
      fields: [brandInspirationTable.brandId],
      references: [brandTable.id],
      relationName: "owner",
    }),
    inspirationBrand: one(brandTable, {
      fields: [brandInspirationTable.inspirationBrandId],
      references: [brandTable.id],
      relationName: "inspiration",
    }),
  }),
);

export const accessRelations = relations(accessTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [accessTable.brandId],
    references: [brandTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [accessTable.invitedBy],
    references: [userTable.id],
  }),
}));
