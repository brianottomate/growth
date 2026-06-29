import { relations } from "drizzle-orm";
import { index, pgSchema, uniqueIndex } from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { createId } from "./utils";

// ---------------------------------------------------------------------------
// LEADS — outbound prospecting back-office (Wander Sites pregen pipeline)
//
// Deliberately isolated in its own Postgres schema (`leads.*`) so it stays
// decoupled from auth/brand/content while we figure the model out. If the
// experiment dead-ends: `DROP SCHEMA leads CASCADE` and nothing else is
// touched. Promote tables into `public` later if it earns its keep.
//
// Grain rule (the whole point):
//   - `lead_domain`  = ONE row per normalized domain — the unit we score/rank.
//   - `lead_contact` = MANY per domain — the unit we *send to* via Instantly.
// This is what fixes the CSV "amgroupltd.uk ×7,032" fan-out: scoring lives on
// the domain, send-explosion lives on contacts.
//
// Provider data follows the repo convention: queryable/rankable fields are
// first-class columns; raw provider rows go in `enrichment` JSONB keyed by
// source, so we can always re-derive without re-importing.
// ---------------------------------------------------------------------------

export const leadsSchema = pgSchema("leads");

// ---- ENUMS ---------------------------------------------------------

// Where a piece of data came from. Drives the presence flags + enrichment keys.
export const leadSourceEnum = leadsSchema.enum("lead_source", [
  "builtwith", // tech-stack / PMS detection universe
  "hubspot", // CRM export (dedup + exclusion signals)
  "pregen", // pregen-sites catalog (already-built sites)
  "instantly_upload", // the contact-level upload CSVs
  "minerva", // enrichment service
  "manual",
  "other",
]);
export type LeadSource = (typeof leadSourceEnum.enumValues)[number];

// Our OWN computed tier (distinct from messy incoming `sourceTier` strings).
export const leadTierEnum = leadsSchema.enum("lead_tier", [
  "tier_1",
  "tier_2",
  "tier_3",
  "untiered",
]);
export type LeadTier = (typeof leadTierEnum.enumValues)[number];

// A captured way to reach a company, discovered by crawling its own website.
// One `lead_domain` has many — this is the reachability superset behind the
// "email is just the preferred route" model. `sms` is reserved for phase 2.
export const leadChannelKindEnum = leadsSchema.enum("lead_channel_kind", [
  "email",
  "phone",
  "form",
  "chatbot",
  "sms",
]);
export type LeadChannelKind = (typeof leadChannelKindEnum.enumValues)[number];

// Per-channel delivery lifecycle. Discovery writes `discovered`; the
// human-approved dispatch path walks it through queued → sending → sent, and
// an inbound reply flips it to `replied`. `skipped`/`failed` are terminal.
export const leadChannelStateEnum = leadsSchema.enum(
  "lead_channel_delivery_state",
  ["discovered", "queued", "sending", "sent", "replied", "failed", "skipped"],
);
export type LeadChannelState = (typeof leadChannelStateEnum.enumValues)[number];

// ---- JSONB SHAPES --------------------------------------------------

// Raw provider payloads, keyed by source. Lossless escape hatch — keep the
// original CSV row so columns can be re-derived without re-ingesting.
export type LeadEnrichment = Partial<
  Record<LeadSource, Record<string, unknown>>
>;

// A single field on a discovered contact form. Drives the field→value mapping
// the operator confirms before an agent submits (the human-in-the-loop gate).
export type ContactFormField = {
  name: string;
  label?: string | null;
  type?: string | null; // text | email | tel | textarea | select | ...
  required?: boolean | null;
};

// Evidence captured when a channel is used — the audit trail for an agentic
// send. Screenshots land in R2; transcript/payload are kept verbatim. `error`
// is set when a dispatch fails (captcha, blocked, submit rejected).
export type LeadChannelEvidence = {
  screenshotUrl?: string;
  transcript?: string;
  submittedPayload?: Record<string, unknown>;
  confirmationText?: string;
  error?: string;
};

// ---- LEAD DOMAIN (the spine) ---------------------------------------

/**
 * One row per normalized domain (lowercased, no scheme/www/path — see
 * `scripts/domain-audit.py` for the canonical normalizer). Every CSV ingest
 * upserts on `domain`, merging fields and flipping the matching `in*` flag.
 */
export const leadDomainTable = leadsSchema.table(
  "domain",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ld")),

    // Canonical normalized domain — the natural dedup key.
    domain: t.text().notNull(),
    companyName: t.text(),

    // Geo (sparse across sources).
    country: t.text(),
    state: t.text(),
    city: t.text(),

    // Tech / PMS (BuiltWith). `pms` = best single PMS guess; `platforms` = full list.
    pms: t.text(),
    platforms: t.jsonb().$type<string[]>(),
    platformCount: t.integer(),
    isIntegratedPms: t.boolean(),

    // Prize size — portfolio / unit / property count (pregen, HubSpot, Minerva).
    unitCount: t.integer(),
    websiteQuality: t.text(),

    // Pregen site state.
    pregenSiteUrl: t.text(),
    pregenStatus: t.text(), // LIVE_RENTAL / LIVE_OTHER / ... (raw, messy upstream)
    pregenPageTitle: t.text(),

    // HubSpot signals — used for the pre-send guard, never to *drive* outreach.
    hubspotRecordId: t.text(),
    hubspotLeadStatus: t.text(),
    hubspotOwner: t.text(),
    outreachLink: t.text(),
    hasHubspotDeal: t.boolean().default(false).notNull(),
    isExistingCustomer: t.boolean().default(false).notNull(),

    // Raw incoming tier label(s) — often ";"-joined / dirty. Keep verbatim;
    // our own ranking writes `computedTier` instead.
    sourceTier: t.text(),

    // Source presence — which lists this domain showed up in.
    inBuiltwith: t.boolean().default(false).notNull(),
    inHubspot: t.boolean().default(false).notNull(),
    inPregen: t.boolean().default(false).notNull(),
    inInstantly: t.boolean().default(false).notNull(),

    // Reachability presence — projected from `lead_channel` by the channel
    // discovery pass so the list can filter "has a form / phone / chatbot"
    // without a join (mirrors the `in*` source-presence flags above).
    hasPhone: t.boolean().default(false).notNull(),
    hasForm: t.boolean().default(false).notNull(),
    hasChatbot: t.boolean().default(false).notNull(),

    // ---- Unit-count enrichment (the headline: sales doesn't trust portfolio_size) ----
    // A triangulated estimate with a range + confidence + provenance. The raw
    // per-signal evidence + citations live in `enrichment.unitEstimate` JSONB.
    // Writes back to HubSpot CONTACT props portfolio_size_ai_guess_2_exact/_range.
    unitEstimate: t.integer(), // best single number
    unitLow: t.integer(), // range low
    unitHigh: t.integer(), // range high
    unitConfidence: t.text(), // high | medium | low
    unitBasis: t.text(), // managed_units | listings | mixed | unknown — what the count represents
    unitMethod: t.text(), // which signal drove the estimate
    unitEstimateModel: t.text(),
    unitEstimatedAt: t.timestamp(),

    // ---- Scoring (written by a re-runnable scoring pass) ----
    scorePregenPotential: t.real(),
    scoreUnit: t.real(),
    scoreLeadQuality: t.real(),
    scoreComposite: t.real(),
    computedTier: leadTierEnum(),
    scoreVersion: t.text(), // which scoring fn produced the above
    scoredAt: t.timestamp(),

    // ---- Outreach gate ----
    // Operational kill-switch independent of score (existing customer, opted
    // out, bad domain). Checked before any Instantly push.
    excludeFromOutreach: t.boolean().default(false).notNull(),
    excludeReason: t.text(),

    // Lossless raw provider rows.
    enrichment: t.jsonb().$type<LeadEnrichment>(),

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
    uniqueIndex("lead_domain_domain_idx").on(table.domain),
    index("lead_domain_pms_idx").on(table.pms),
    index("lead_domain_tier_idx").on(table.computedTier),
    index("lead_domain_composite_idx").on(table.scoreComposite),
    index("lead_domain_pregen_status_idx").on(table.pregenStatus),
  ],
);

export type LeadDomain = typeof leadDomainTable.$inferSelect;
export type LeadDomainInsert = typeof leadDomainTable.$inferInsert;

// ---- LEAD CONTACT --------------------------------------------------

/**
 * Person-verification evidence — the "trust layer". Re-runnable, droppable
 * (lives on the contact, not a separate table). Minerva is the geo-validator
 * (does this person plausibly live where the company operates?); Bright Data
 * LinkedIn is the opportunistic confirmer (does this person actually work
 * here?), only fired when a profile URL surfaces via Minerva's resolve step.
 * Written by `lead-verify.service.ts`; consumed by `scoreStoredContact`.
 */
export type LeadContactVerification = {
  verifiedAt: string; // ISO
  // "match" / "mismatch" / "unknown" (could not resolve / no company geo).
  geoMatch: "match" | "mismatch" | "unknown";
  companyMatch: "match" | "mismatch" | "unknown";
  minerva?: {
    isMatch: boolean;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    confidence?: number | null; // 0-1
  };
  linkedin?: {
    url: string;
    currentCompany?: string | null;
    scrapedAt: string;
  };
};

/**
 * A person at a domain (the Instantly upload grain). Many per `lead_domain`.
 * Engagement metrics sync back from Instantly so scoring can react to it.
 */
export const leadContactTable = leadsSchema.table(
  "contact",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lc")),

    domainId: t
      .text()
      .references(() => leadDomainTable.id, { onDelete: "cascade" })
      .notNull(),
    // Denormalized normalized domain — lets the importer match before the
    // domain row's id is known, and keeps ad-hoc queries cheap.
    domain: t.text().notNull(),

    email: t.text().notNull(), // stored lowercased
    firstName: t.text(),
    lastName: t.text(),
    jobTitle: t.text(),
    phone: t.text(),
    state: t.text(),

    // Deliverability (Instantly / Minerva verification).
    verificationStatus: t.text(),

    // Person-verification evidence (Minerva geo + Bright Data LinkedIn).
    // Re-runnable trust layer — see lead-verify.service.ts.
    verification: t.jsonb().$type<LeadContactVerification>(),

    // Instantly linkage (this is the projection — source of truth stays here).
    instantlyLeadId: t.text(),
    instantlyCampaignId: t.text(),
    pushedToInstantlyAt: t.timestamp(),

    // Engagement synced back from Instantly.
    emailOpenCount: t.integer().default(0).notNull(),
    emailReplyCount: t.integer().default(0).notNull(),
    emailClickCount: t.integer().default(0).notNull(),
    interestStatus: t.integer(), // Instantly lt_interest_status
    lastContactedAt: t.timestamp(),

    source: leadSourceEnum(),
    raw: t.jsonb().$type<Record<string, unknown>>(),

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
    // One contact per (domain, email) — the dedup key for re-imports.
    uniqueIndex("lead_contact_domain_email_idx").on(table.domain, table.email),
    index("lead_contact_domain_id_idx").on(table.domainId),
    index("lead_contact_email_idx").on(table.email),
    index("lead_contact_instantly_idx").on(table.instantlyLeadId),
  ],
);

export type LeadContact = typeof leadContactTable.$inferSelect;
export type LeadContactInsert = typeof leadContactTable.$inferInsert;

// ---- LEAD IMPORT (provenance / audit) ------------------------------

/**
 * One row per CSV ingest run. The answer to "how do I get my data back out":
 * every load is logged with counts, so the internal DB — not Instantly or a
 * stray CSV — is the durable record of what entered the system and when.
 */
export const leadImportTable = leadsSchema.table(
  "import",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("imp")),

    filename: t.text().notNull(),
    source: leadSourceEnum().notNull(),

    rowCount: t.integer().default(0).notNull(),
    domainsSeen: t.integer().default(0).notNull(),
    domainsCreated: t.integer().default(0).notNull(),
    domainsUpdated: t.integer().default(0).notNull(),
    contactsCreated: t.integer().default(0).notNull(),
    contactsUpdated: t.integer().default(0).notNull(),

    notes: t.text(),
    importedBy: t.text().references(() => userTable.id),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("lead_import_source_idx").on(table.source),
    index("lead_import_created_idx").on(table.createdAt),
  ],
);

export type LeadImport = typeof leadImportTable.$inferSelect;
export type LeadImportInsert = typeof leadImportTable.$inferInsert;

// ---- LEAD OUTREACH (per-lead personalized sequences) ---------------
//
// The per-lead "meal": a bespoke, AI-generated cold sequence for ONE domain,
// built from its enrichment + a lifecycle "recipe" (strategic intent). Lives in
// the leads domain on purpose — high cardinality belongs here, NOT as thousands
// of lifecycle_program rows. `programId` is a soft reference to the lifecycle
// strategy used (no cross-schema FK; lifecycle lives in `public`).

export const leadOutreachStatusEnum = leadsSchema.enum("lead_outreach_status", [
  "draft", // AI-generated, awaiting human review
  "approved", // human-approved, ready to queue
  "queued", // pushed to Instantly
  "sent", // first step sent
  "replied", // prospect replied
  "skipped", // dropped
]);
export type LeadOutreachStatus =
  (typeof leadOutreachStatusEnum.enumValues)[number];

export type OutreachStep = {
  subject: string | null; // null for in-thread follow-ups
  body: string;
  delayDays: number;
};

export const leadOutreachTable = leadsSchema.table(
  "outreach",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lo")),
    domainId: t
      .text()
      .references(() => leadDomainTable.id, { onDelete: "cascade" })
      .notNull(),
    domain: t.text().notNull(),
    contactId: t
      .text()
      .references(() => leadContactTable.id, { onDelete: "set null" }),
    programId: t.text(), // soft ref to the lifecycle strategy/recipe used
    status: leadOutreachStatusEnum().default("draft").notNull(),
    angle: t.text(),
    personalizedOn: t.jsonb().$type<string[]>(),
    steps: t.jsonb().$type<OutreachStep[]>(),
    model: t.text(),
    // Instantly linkage once queued/sent.
    instantlyCampaignId: t.text(),
    instantlyLeadId: t.text(),
    sentAt: t.timestamp(),
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
    index("lead_outreach_domain_id_idx").on(table.domainId),
    index("lead_outreach_status_idx").on(table.status),
  ],
);
export type LeadOutreach = typeof leadOutreachTable.$inferSelect;
export type LeadOutreachInsert = typeof leadOutreachTable.$inferInsert;

// ---- LEAD CHANNEL (reachability + multi-channel delivery) ----------
//
// Every captured way to reach a company, discovered by crawling its own site
// (channel-discovery.service.ts). MANY per `lead_domain`. This is the "email is
// just the preferred route" model: a form/phone/chatbot row is a real delivery
// target, not a dead end. Each row carries its own mutable delivery state +
// evidence so a fallback send can be tracked independently of the email path.
// The raw capture also caches into `lead_domain.enrichment.contactChannels`;
// these rows are the queryable projection.

// Physical name is `lead_channel` (not bare `channel`): Drizzle's relational
// query builder keys its config by physical table name, so a bare `channel`
// here collides with `public.channel` (channel-schema.ts) and corrupts the
// relation inference for unrelated domains. The `leads.` schema prefix isn't
// enough — keep the name globally unique.
export const leadChannelTable = leadsSchema.table(
  "lead_channel",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lch")),

    domainId: t
      .text()
      .references(() => leadDomainTable.id, { onDelete: "cascade" })
      .notNull(),
    // Denormalized normalized domain — same cheap-lookup rationale as lead_contact.
    domain: t.text().notNull(),

    kind: leadChannelKindEnum().notNull(),
    // email address / E.164 phone / contact-form URL / chatbot page URL.
    value: t.text().notNull(),
    // Contact-form field structure (kind="form").
    fields: t.jsonb().$type<ContactFormField[]>(),
    // Detected chat widget vendor (kind="chatbot"): intercom | drift | crisp | ...
    vendor: t.text(),

    // Provenance + confidence of the capture.
    source: t.text(), // firecrawl_extract | regex | manual
    confidence: t.real(), // 0-1
    verified: t.boolean().default(false).notNull(),

    // ---- Delivery state (the dispatch half) ----
    deliveryState: leadChannelStateEnum().default("discovered").notNull(),
    // Which generated sequence was dispatched through this channel.
    outreachId: t
      .text()
      .references(() => leadOutreachTable.id, { onDelete: "set null" }),
    // The plus-addressed reply-to we stamped (form/chat sends leave our address);
    // `replyToken` is the opaque key the inbound webhook resolves back to this row.
    replyToAlias: t.text(),
    replyToken: t.text(),
    // Audit trail for an agentic send (screenshot/transcript/payload/error).
    evidence: t.jsonb().$type<LeadChannelEvidence>(),

    lastUsedAt: t.timestamp(),
    sentAt: t.timestamp(),
    repliedAt: t.timestamp(),

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
    // One row per (domain, kind, value) — the upsert key so re-discovery
    // refreshes rather than duplicates.
    uniqueIndex("lead_channel_domain_kind_value_idx").on(
      table.domainId,
      table.kind,
      table.value,
    ),
    index("lead_channel_domain_id_idx").on(table.domainId),
    index("lead_channel_kind_idx").on(table.kind),
    index("lead_channel_delivery_state_idx").on(table.deliveryState),
    // Direct inbound-reply lookup (reply+<token>@… → this row).
    uniqueIndex("lead_channel_reply_token_idx").on(table.replyToken),
  ],
);

export type LeadChannel = typeof leadChannelTable.$inferSelect;
export type LeadChannelInsert = typeof leadChannelTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const leadDomainRelations = relations(leadDomainTable, ({ many }) => ({
  contacts: many(leadContactTable),
  channels: many(leadChannelTable),
}));

export const leadContactRelations = relations(leadContactTable, ({ one }) => ({
  domainRow: one(leadDomainTable, {
    fields: [leadContactTable.domainId],
    references: [leadDomainTable.id],
  }),
}));

export const leadChannelRelations = relations(leadChannelTable, ({ one }) => ({
  domainRow: one(leadDomainTable, {
    fields: [leadChannelTable.domainId],
    references: [leadDomainTable.id],
  }),
  outreach: one(leadOutreachTable, {
    fields: [leadChannelTable.outreachId],
    references: [leadOutreachTable.id],
  }),
}));

export const leadImportRelations = relations(leadImportTable, ({ one }) => ({
  importedByUser: one(userTable, {
    fields: [leadImportTable.importedBy],
    references: [userTable.id],
  }),
}));
