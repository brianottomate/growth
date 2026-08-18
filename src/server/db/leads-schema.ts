import { relations, sql } from "drizzle-orm";
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

    // Generated-preview artifacts. These columns are deliberately not a
    // qualification or build-lifecycle model. The old CSV catalog used them
    // for LIVE_RENTAL/LIVE_OTHER and placeholder URLs; that state was retired.
    // Introduce a separate lifecycle table when production generation is real.
    pregenSiteUrl: t.text(),
    pregenStatus: t.text(), // Retired compatibility column; keep null.
    pregenPageTitle: t.text(),

    // HubSpot signals — used for the pre-send guard, never to *drive* outreach.
    hubspotRecordId: t.text(),
    hubspotLeadStatus: t.text(),
    hubspotOwner: t.text(),
    // Snapshot/webhook freshness. The export importer writes both; webhook
    // projection advances them so an older export can never overwrite a newer
    // CRM change on a rerun.
    hubspotSyncedAt: t.timestamp(),
    hubspotLastModifiedAt: t.timestamp(),
    outreachLink: t.text(),
    hasHubspotDeal: t.boolean().default(false).notNull(),
    isExistingCustomer: t.boolean().default(false).notNull(),

    // Raw incoming tier label(s) — often ";"-joined / dirty. Keep verbatim;
    // our own ranking writes `computedTier` instead.
    sourceTier: t.text(),

    // Source presence — which lists this domain showed up in.
    inBuiltwith: t.boolean().default(false).notNull(),
    inHubspot: t.boolean().default(false).notNull(),
    inPregen: t.boolean().default(false).notNull(), // Retired compatibility flag.
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

    // ---- Send batch ----
    // Which pregen send batch this company belongs to, e.g. "pregen-1". Replaces
    // the hardcoded SEND_BATCH_1 array the leads router carried, which was
    // always flagged as wanting a column once batches became routine. Nullable:
    // most of the 216k universe is in no batch.
    pregenBatch: t.text(),

    // ---- Outreach gate ----
    // Operational kill-switch independent of score (existing customer, opted
    // out, bad domain). Checked before any Instantly push.
    excludeFromOutreach: t.boolean().default(false).notNull(),
    excludeReason: t.text(),

    // Lossless raw provider rows.
    enrichment: t.jsonb().$type<LeadEnrichment>(),

    /**
     * The whole Firecrawl response for the company's homepage.
     *
     * Its own column rather than a key on `enrichment`, because the leads list
     * selects `enrichment` for every row it renders and a homepage's markdown
     * and html would ride along on all of them. Nothing selects this except the
     * code that wants the page.
     *
     * Stored unstripped. The ranker used to keep the screenshot URL and the
     * image list and drop the copy, and the sequence generator then fetched the
     * same homepage again to get it back, so every pass scraped each site twice
     * and kept neither result.
     */
    siteScrape: t.jsonb().$type<LeadSiteScrape>(),

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

    // HubSpot's own email opt-out flag, mirrored so Growth can suppress before
    // spending on a contact rather than after. HubSpot enforces suppression at
    // send time regardless; the point of holding it here is that enrollability
    // counts and Send Review must not offer up a contact we may not email, and
    // a pregen site build is not free. Null means HubSpot has not told us yet.
    emailOptOut: t.boolean(),

    // Retired as a recipient: the address bounced, the person left, or a human
    // judged them the wrong door in. Distinct from `deletedAt` (the row is
    // still true and still worth showing) and from `emailOptOut` (which is the
    // contact's own choice and HubSpot's to enforce). Retiring is how a company
    // moves to the next candidate after a failed send, so the scorer zeroes
    // these and the enrolment guard ignores them when asking what is in flight.
    retiredAt: t.timestamp(),
    retiredReason: t.text(),

    // Person-verification evidence (Minerva geo + Bright Data LinkedIn).
    // Re-runnable trust layer — see lead-verify.service.ts.
    verification: t.jsonb().$type<LeadContactVerification>(),

    // Instantly linkage (this is the projection — source of truth stays here).
    hubspotContactId: t.text(),
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
    index("lead_contact_hubspot_idx").on(table.hubspotContactId),
    index("lead_contact_instantly_idx").on(table.instantlyLeadId),
  ],
);

export type LeadContact = typeof leadContactTable.$inferSelect;
export type LeadContactInsert = typeof leadContactTable.$inferInsert;

// ---- HUBSPOT TARGET-LIST MEMBERSHIP -------------------------------
//
// HubSpot remains the source of truth for list definitions. This table is the
// durable, queryable membership projection that makes those cohorts available
// to Growth jobs and the /leads operator UI without flattening them into flags.

export const hubspotListMembershipTable = leadsSchema.table(
  "hubspot_list_membership",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("hlm")),
    listId: t.text().notNull(),
    listName: t.text().notNull(),
    objectType: t.text().notNull(), // company | contact
    objectId: t.text().notNull(),
    cohort: t.text().notNull(), // recycled | untouched
    domainId: t
      .text()
      .references(() => leadDomainTable.id, { onDelete: "set null" }),
    contactId: t
      .text()
      .references(() => leadContactTable.id, { onDelete: "set null" }),
    importedAt: t
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
    uniqueIndex("hubspot_list_membership_list_object_idx").on(
      table.listId,
      table.objectId,
    ),
    index("hubspot_list_membership_domain_idx").on(table.domainId),
    index("hubspot_list_membership_contact_idx").on(table.contactId),
    index("hubspot_list_membership_cohort_type_idx").on(
      table.cohort,
      table.objectType,
    ),
  ],
);

export type HubspotListMembership =
  typeof hubspotListMembershipTable.$inferSelect;
export type HubspotListMembershipInsert =
  typeof hubspotListMembershipTable.$inferInsert;

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

/**
 * What the generator actually read when it wrote a draft.
 *
 * HubSpot email and call history is fetched live at generation time and was
 * previously discarded, which made a draft unreviewable: `personalizedOn` says
 * the copy used "a logged call with Shaun", but not who Shaun is or which side
 * of the call he was on. Re-fetching on review answers a different question —
 * what HubSpot says *now*, not what the copy was written from.
 *
 * Kept deliberately small: counts plus short excerpts, not the full bodies.
 */
/**
 * A stored Firecrawl scrape. `raw` is the untouched response; the named fields
 * are the ones consumers reach for, lifted so they do not each re-guess the
 * SDK's shape.
 */
export type LeadSiteScrape = {
  url: string;
  fetchedAt: string;
  markdown?: string;
  html?: string;
  links?: string[];
  images?: string[];
  screenshot?: string;
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export type PregenGenerationContext = {
  generatedAt: string;
  motion: "fresh" | "reengagement";
  pms: string | null;
  steer: string | null;
  hubspotCompanyId: string | null;
  /**
   * The person the copy was written to, when one could be resolved. The draft
   * addresses their own history as "you", so a reviewer needs to know who that
   * was before enrolling someone else. Absent on company-level drafts.
   */
  recipient?: {
    name: string | null;
    email: string;
    hubspotContactId: string | null;
  } | null;
  /** The renderer address the generator read and wrote copy about. */
  previewUrl: string;
  /**
   * The link the copy actually carries: the wander.com wrapper around
   * `previewUrl`, with attribution. Absent on drafts generated before the
   * wrapper was adopted, which carried the tracked renderer address instead.
   */
  outreachUrl?: string;
  /**
   * What the model wanted to know and refused to invent — the rep's queue.
   * Answer one through the sidebar chat's steer and regenerate.
   */
  openQuestions?: string[];
  /** Whether reply-winning exemplars were available at generation time. */
  exemplarsUsed?: boolean;
  preview: {
    readable: boolean;
    detail: string;
    characters: number;
    /**
     * Written against a stand-in rather than a real preview — a copy-iteration
     * run, not a sendable draft. Previews do not exist yet for most of the
     * universe, so the copy still has to be workable before they do; this flag
     * is what keeps such a draft out of HubSpot.
     */
    pretend: boolean;
  };
  website: {
    characters: number;
    /** Whether the copy read the stored Firecrawl scrape or fetched live. */
    source?: "scrape" | "live";
  };
  emails: {
    available: number;
    retained: number;
    inbound: number;
    outbound: number;
    items: Array<{
      sentAt: string;
      direction: "outbound" | "inbound" | "unknown";
      subject: string;
      excerpt: string;
    }>;
  } | null;
  activity: {
    available: number;
    retained: number;
    items: Array<{
      at: string;
      kind: string;
      /** Call direction or meeting outcome — says whether a name is theirs or ours. */
      qualifier: string | null;
      title: string;
      excerpt: string;
    }>;
  } | null;
};

export const leadSequenceTable = leadsSchema.table(
  "sequence",
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
    // Provenance for review — see PregenGenerationContext.
    generationContext: t.jsonb().$type<PregenGenerationContext>(),
    // Instantly linkage once queued/sent.
    instantlyCampaignId: t.text(),
    instantlyLeadId: t.text(),
    // HubSpot sequence enrolment: the ledger that makes a second Start refuse.
    // HubSpot's own enrollment-status endpoint is checked first (a rep can
    // enrol from the CRM and Growth would never hear about it), but recording
    // it here is what lets the lead page answer "already in flight" without a
    // provider round trip, and what a duplicate guard can index on.
    hubspotSequenceId: t.text(),
    hubspotEnrollmentId: t.text(),
    enrolledAt: t.timestamp(),
    enrolledByEmail: t.text(),
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
    // One live enrolment per domain. Partial so redrafting a skipped or
    // replied-to company stays allowed.
    uniqueIndex("lead_sequence_live_enrollment_idx")
      .on(table.domainId)
      .where(sql`${table.status} in ('queued', 'sent')`),
  ],
);
export type LeadOutreach = typeof leadSequenceTable.$inferSelect;
export type LeadOutreachInsert = typeof leadSequenceTable.$inferInsert;

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
      .references(() => leadSequenceTable.id, { onDelete: "set null" }),
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
  outreach: one(leadSequenceTable, {
    fields: [leadChannelTable.outreachId],
    references: [leadSequenceTable.id],
  }),
}));

export const leadImportRelations = relations(leadImportTable, ({ one }) => ({
  importedByUser: one(userTable, {
    fields: [leadImportTable.importedBy],
    references: [userTable.id],
  }),
}));

// ---- HUBSPOT WEBHOOK EVENTS (raw inbound event log) ----------------
//
// Accept-then-process: /api/webhooks/hubspot stores every HubSpot event row
// here verbatim BEFORE anything is applied, so a processing bug can never
// lose an event. A light inline pass refreshes lead_domain status/owner;
// everything else stays pending (processedAt null) for the projection
// processor that lands with the full company backfill
// (docs/leads-convergence-plan.md — sync design).

export const hubspotWebhookEventTable = leadsSchema.table(
  "hubspot_webhook_event",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("hswe")),

    // HubSpot's own event id — redeliveries reuse it, so unique +
    // conflict-ignore makes retries a no-op.
    eventId: t.text().notNull(),
    // Classic: "company.propertyChange". Expanded object support (beta):
    // "object.propertyChange" + objectTypeId identifies the object.
    subscriptionType: t.text().notNull(),
    objectTypeId: t.text(), // e.g. "0-2" (company), "0-1" (contact); null on classic
    portalId: t.text(),
    objectId: t.text().notNull(), // company/contact record id
    propertyName: t.text(),
    propertyValue: t.text(),
    changeSource: t.text(),
    attemptNumber: t.integer().default(0).notNull(),
    occurredAt: t.timestamp(),

    payload: t.jsonb().$type<Record<string, unknown>>().notNull(),

    processedAt: t.timestamp(), // null = pending for the projection processor
    processNote: t.text(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    uniqueIndex("hubspot_webhook_event_event_id_idx").on(table.eventId),
    index("hubspot_webhook_event_object_idx").on(table.objectId),
    index("hubspot_webhook_event_pending_idx").on(table.processedAt),
    index("hubspot_webhook_event_type_idx").on(table.subscriptionType),
  ],
);

export type HubspotWebhookEvent = typeof hubspotWebhookEventTable.$inferSelect;
export type HubspotWebhookEventInsert =
  typeof hubspotWebhookEventTable.$inferInsert;

/**
 * One-to-one sales emails our reps have sent and received, anonymized, with
 * the one label the retired file corpus never had: whether the send earned a
 * reply.
 *
 * The July corpus kept outbound only, wrote to a gitignored file, and was read
 * once by a human. This is the same redaction pipeline landing somewhere the
 * generator can reach at runtime, so drafts can be steered by exchanges that
 * actually worked instead of by hand-transcribed impressions of them. Bodies
 * are anonymized before insert (emails, phones and URLs are tokens), and the
 * builder refuses to write a row that fails its leak check.
 */
export const salesEmailCorpusTable = leadsSchema.table(
  "sales_email_corpus",
  (t) => ({
    /** HubSpot engagement id — the natural key, so re-runs refresh in place. */
    engagementId: t.text().primaryKey(),
    direction: t.text().notNull(), // outbound | inbound
    sentAt: t.timestamp().notNull(),
    /** Rep display name when the owner id maps to one, else a stable hash. */
    rep: t.text(),
    /** The external party's email domain — the join key back to lead_domain. */
    counterpartDomain: t.text(),
    subject: t.text().notNull(),
    body: t.text().notNull(),
    wordCount: t.integer().notNull(),
    /** Subject starts with re: — an in-thread send, not a cold opener. */
    isReply: t.boolean().default(false).notNull(),
    /** Outbound only: an inbound from the same counterpart landed within 45d. */
    gotReply: t.boolean().default(false).notNull(),
    replyAt: t.timestamp(),
    replyEngagementId: t.text(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("sales_email_corpus_winners_idx").on(
      table.direction,
      table.gotReply,
      table.sentAt,
    ),
  ],
);
export type SalesEmailCorpusRow = typeof salesEmailCorpusTable.$inferSelect;

/**
 * Pregen site build lifecycle — one row per build we asked WanderOS for.
 *
 * The `pregen*` columns on `lead_domain` were explicitly not a lifecycle model
 * ("introduce a separate lifecycle table when production generation is real").
 * wandercom/wander#20939 is that moment: it adds `POST /internal/prospects`,
 * which mints a `SaasWebsiteProspect`, and a fire-and-forget webhook that
 * reports the build settling.
 *
 * A domain can be built more than once — retries, expiry, a rebuild after the
 * source site changes — so the build is the entity the webhook addresses, keyed
 * on WanderOS's `prospectId`. `lead_domain.pregenSiteUrl` stays as the
 * denormalized "current preview" pointer, which is what generation, the
 * reachability probe, the review card and the publish guard already read.
 */
export const pregenBuildTable = leadsSchema.table(
  "pregen_build",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pgb")),
    domainId: t
      .text()
      .references(() => leadDomainTable.id, { onDelete: "cascade" })
      .notNull(),
    domain: t.text().notNull(),

    // WanderOS identifiers. `prospectId` is the webhook's correlation key and is
    // unique, so a redelivered event updates rather than duplicates.
    prospectId: t.text(),
    websiteId: t.text(),
    previewToken: t.text(),

    // What we asked for, kept so a retry can repeat the request faithfully.
    businessName: t.text(),
    sourceUrl: t.text(),

    // WanderOS's own status string, stored verbatim rather than remapped — the
    // vocabulary is theirs and mirroring it avoids a translation table that
    // silently drifts when they add a state.
    status: t.text(),
    previewUrl: t.text(),
    errorMessage: t.text(),

    requestedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    // `occurredAt` from the last webhook applied. Guards against an out-of-order
    // delivery overwriting a newer state with an older one.
    lastEventAt: t.timestamp(),
    settledAt: t.timestamp(),
    /**
     * When the prospect claimed the site — signed up and took ownership.
     *
     * The conversion this whole motion produces. Kept separate from settledAt
     * because CLAIMED is both terminal and the only terminal state that is a
     * win, and "how many pregen sites got claimed" is the question the
     * programme will be judged on.
     */
    claimedAt: t.timestamp(),

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
    uniqueIndex("pregen_build_prospect_id_idx").on(table.prospectId),
    index("pregen_build_domain_idx").on(table.domainId),
    index("pregen_build_status_idx").on(table.status),
  ],
);

export type PregenBuild = typeof pregenBuildTable.$inferSelect;
export type PregenBuildInsert = typeof pregenBuildTable.$inferInsert;
