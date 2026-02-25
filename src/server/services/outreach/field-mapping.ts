/**
 * Field Mapping Module — CIO/BigQuery Lead → Outreach Prospect
 *
 * Pure data transformation, no external dependencies.
 * Ported from wander-growth-api/app/services/outreach/field_mapping.py
 * and field_data_mapper.py.
 */

// =====================================================
// FIELD MAPPING: semantic name → Outreach custom field
// =====================================================

export const FIELD_MAPPING = {
  // Core fields (custom1-6) — Property Seller/Owner persona
  how_hot: "custom1",
  num_listings: "custom2",
  num_ota: "custom3",
  num_mls_for_sale: "custom4",
  num_mls_for_rent: "custom5",
  num_mls_off_market: "custom6",

  // Follow-up and HubSpot (custom7-8)
  follow_up_date: "custom7",
  hubspot_link: "custom8",

  // Listing details (custom9-17)
  newest_contact_on_listing: "custom9",
  ota_link_newest: "custom10",
  mls_link_newest: "custom11",
  listing_id_newest: "custom12",
  listing_type_newest: "custom13",
  listing_street_newest: "custom14",
  listing_city_newest: "custom15",
  listing_state_newest: "custom16",
  listing_bedrooms_newest: "custom17",

  // HubSpot sync (custom18-22)
  currently_in_hs_sequence: "custom18",
  last_enriched: "custom19",
  owner_assigned_date: "custom20",
  last_activity_date_hubspot: "custom21",
  last_contacted_date_hubspot: "custom22",

  // Booking & Transaction (custom23-27)
  last_property_checked_out: "custom23",
  total_money_spent: "custom24",
  last_booking_transaction_date: "custom25",
  past_booking_dates: "custom26",
  number_of_bookings: "custom27",

  // Financial and event (custom28-31)
  credits_balance: "custom28",
  points_balance: "custom29",
  last_event_date: "custom30",
  user_id: "custom31",

  // Attribution and enrichment (custom32-39)
  reason_for_not_booking: "custom32",
  remove_recently_assigned_tag: "custom33",
  has_recently_assigned_tag: "custom34",
  phones_emails_initialized: "custom35",
  new_zillow_fr_lead: "custom36",
  length_of_residency: "custom37",
  household_income: "custom38",
  melissa_enriched: "custom39",

  // AI scoring (custom40)
  ai_score_highest: "custom40",

  // PM fields (custom41-45)
  persona_name: "custom41",
  pm_name: "custom42",
  rep_sourced: "custom43",
  ww_listing_url_pm_leads: "custom44",
  pm_website: "custom45",

  // Minerva (custom46)
  minerva_rank: "custom46",

  // Property tracking (custom47)
  last_5_checkout_properties: "custom47",

  // Sync tracking (custom48-52)
  last_sync_timestamp: "custom48",
  last_activity_timestamp: "custom49",
  last_sync_tag: "custom50",
  sync_count: "custom51",
  last_event_type: "custom52",

  // Property lists (custom53, 58)
  viewed_properties: "custom53",
  wishlisted_properties: "custom58",

  // Booking property tracking (custom60-61)
  last_property_booked: "custom60",
  last_5_booked_properties: "custom61",

  // Recency tracking (custom62-63)
  last_abandoned_cart_date: "custom62",
  last_wishlist_date: "custom63",

  // CIO activity (custom64-65)
  cio_activity_summary: "custom64",
  cio_profile_link: "custom65",

  // Review (custom66)
  avg_review_score: "custom66",
} as const;

export type FieldName = keyof typeof FIELD_MAPPING;

/**
 * Reverse lookup: Outreach custom field → semantic name
 */
export function getSemanticName(customField: string): FieldName | undefined {
  for (const [key, value] of Object.entries(FIELD_MAPPING)) {
    if (value === customField) return key as FieldName;
  }
  return undefined;
}

/**
 * Get the Outreach custom field for a semantic name
 */
export function getOutreachField(name: FieldName): string {
  return FIELD_MAPPING[name];
}

// =====================================================
// OUTREACH STAGES
// =====================================================

export const OUTREACH_STAGES = {
  /** New leads entering the demand pipeline */
  DEMAND_NEW: 40,
  /** BDR-assisted bookings */
  DEMAND_BOOKED: 28,
  /** Direct bookings without BDR assistance */
  DEMAND_BOOKED_DIRECT: 68,
} as const;

/** Outreach persona ID for "Booking Guest" — set on all demand synced leads */
export const PERSONA_BOOKING_GUEST_ID = 3;

// =====================================================
// SYNC TAG MAPPING
// =====================================================

export const SYNC_TAG_MAPPING: Record<string, string> = {
  payment_info_entered: "RealtimeSync-PaymentEntered",
  checkout_started: "RealtimeSync-CheckoutStarted",
  abandoned_cart: "RealtimeSync-AbandonedCart",
  user_signed_up: "RealtimeSync-UserSignedUp",
  order_completed: "RealtimeSync-OrderCompleted",
  product_added_to_wishlist: "RealtimeSync-Wishlisted",
};

/** Activity tags with priority (higher = more important) */
export const TAG_PRIORITIES: Record<string, number> = {
  "Completed Purchase": 3,
  "Abandoned Payment": 2,
  "Abandoned Cart": 1,
  "New Signup": 0,
};

// =====================================================
// HELPER UTILITIES
// =====================================================

/** Convert to float, return null if invalid */
export function safeFloat(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/** Convert to integer, return null if invalid */
export function safeInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : Math.floor(num);
}

/** Convert to string, return null if empty */
export function safeString(value: unknown, maxLen = 32000): string | null {
  if (value == null || value === "") return null;
  const str = toPlainString(value);
  if (str == null || str === "") return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function toPlainString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function unwrapTemporalValue(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in value) {
    return (value as { value: unknown }).value;
  }
  return value;
}

/**
 * Format a date value for Outreach (YYYY-MM-DD)
 */
export function formatDateForOutreach(value: unknown): string | null {
  const normalized = unwrapTemporalValue(value);
  if (normalized == null || normalized === "") return null;
  if (normalized instanceof Date) {
    return normalized.toISOString().split("T")[0]!;
  }
  const str = toPlainString(normalized);
  if (!str) return null;

  // Handle numeric timestamps (seconds or milliseconds)
  const num = Number(str);
  if (!isNaN(num) && num > 0) {
    const ms = num > 1e12 ? num : num * 1000;
    return new Date(ms).toISOString().split("T")[0]!;
  }

  let candidate = str;
  // Handle both ISO "T" separator and Postgres space separator
  // e.g. "2026-02-21T15:17:44Z" or "2026-02-21 15:17:44.787+00"
  if (candidate.includes("T")) {
    candidate = candidate.split("T")[0]!;
  } else if (/^\d{4}-\d{2}-\d{2}\s/.test(candidate)) {
    candidate = candidate.split(" ")[0]!;
  }

  // Validate YYYY-MM-DD format before returning
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    console.warn(`⚠️ [FieldMapping] Invalid date for Outreach: "${str}" → skipping`);
    return null;
  }
  return candidate;
}

/**
 * Format a datetime value for Outreach (ISO 8601, no microseconds)
 */
export function formatDateTimeForOutreach(value: unknown): string | null {
  const normalized = unwrapTemporalValue(value);
  if (normalized == null || normalized === "") return null;
  if (normalized instanceof Date) {
    return normalized.toISOString().replace(/\.\d{3}Z$/, "+00:00");
  }
  let str = toPlainString(normalized);
  if (!str) return null;
  // Fix double timezone suffix
  str = str.replace("+00:00+00:00", "+00:00");
  str = str.replace("Z+00:00", "+00:00");
  // Remove microseconds
  if (str.includes(".")) {
    const [base, rest] = str.split(".");
    const tzMatch = rest?.match(/([+-]\d{2}:\d{2}|Z)$/);
    const tz = tzMatch ? tzMatch[1] : "+00:00";
    str = `${base}${tz === "Z" ? "+00:00" : tz}`;
  }
  // Add timezone if missing
  if (str.includes("T") && !str.includes("+") && !str.endsWith("Z")) {
    str += "+00:00";
  }
  if (str.endsWith("Z")) {
    str = str.replace("Z", "+00:00");
  }
  return str;
}

/**
 * Format past bookings for custom26.
 * Input: pipe-delimited string "PropertyName|booking_date|checkin_date|checkout_date;..."
 * Output: human-readable booking summary
 */
function formatPastBookings(raw: string | null): string | null {
  if (!raw) return null;
  const bookings = raw.split(";").filter(Boolean);
  if (bookings.length === 0) return null;

  const formatted = bookings.slice(0, 5).map((b, i) => {
    const [property, bookingDate, checkin, checkout] = b.split("|");
    const bookedStr = bookingDate ? formatShortDate(bookingDate) : "Unknown";
    const stayStr =
      checkin && checkout
        ? `${formatShortDate(checkin)} - ${formatShortDate(checkout)}`
        : "";
    const line = `${property ?? "Unknown"} (Booked: ${bookedStr}${stayStr ? ` | Stay: ${stayStr}` : ""})`;
    return bookings.length > 1 ? `${i + 1}. ${line}` : line;
  });

  if (bookings.length > 1) {
    return `[${bookings.length} bookings]\n${formatted.join("\n")}`;
  }
  return formatted[0]!;
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Determine the "How Hot" classification
 */
function determineHowHot(lead: LeadData): string | null {
  const quality = lead.lead_quality;
  if (quality) {
    if (quality.includes("Hot")) return "Hot";
    if (quality.includes("Warm")) return "Warm";
    return "Standard";
  }
  const score = safeFloat(lead.total_score);
  if (score != null) {
    if (score >= 75) return "Hot";
    if (score >= 50) return "Warm";
    if (score >= 25) return "Cool";
    return "Standard";
  }
  return null;
}

/**
 * Determine the highest-priority activity tag
 */
export function getActivityTag(eventTypes: string | null): string | null {
  if (!eventTypes) return null;
  const types = eventTypes.toLowerCase();
  if (types.includes("order_completed")) return "Completed Purchase";
  if (types.includes("payment_info_entered")) return "Abandoned Payment";
  if (types.includes("checkout_started") || types.includes("abandoned_cart")) return "Abandoned Cart";
  if (types.includes("user_signed_up")) return "New Signup";
  return null;
}

// =====================================================
// LEAD DATA INTERFACE
// =====================================================

/**
 * Normalized lead data from BigQuery or CIO.
 * All fields are optional — mappers handle missing data gracefully.
 */
export interface LeadData {
  // Identity
  id_user?: string | null;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;

  // Activity
  event_types?: string | null;
  interacted_properties?: string | null;
  unique_properties?: number | null;
  last_activity_ts?: string | null;
  last_activity_type?: string | null;
  last_activity_property_name?: string | null;

  // Specific activity
  last_checkout_property?: string | null;
  checkout_count?: number | null;
  payment_count?: number | null;
  property_view_count?: number | null;
  wishlist_count?: number | null;

  // Bookings
  past_properties?: string | null;
  past_bookings?: string | null;
  last_booking_date?: string | null;
  last_checkin?: string | null;
  last_checkout?: string | null;
  last_booked_property_name?: string | null;
  last_5_booked_properties?: string | null;
  last_5_checkout_properties?: string | null;
  wishlisted_properties?: string | null;
  last_abandoned_cart_date?: string | null;
  last_wishlist_date?: string | null;

  // Stats
  count_confirmed_bookings?: number | null;
  total_spend?: number | null;

  // Webhook context
  webhook_event_type?: string | null;
  webhook_property_name?: string | null;
  webhook_checkin_date?: string | null;
  webhook_checkout_date?: string | null;
  webhook_checkout_amount?: number | null;

  // Minerva AI
  minerva_rank?: number | null;
  minerva_date_scored?: string | null;
  minerva_lead_summary?: string | null;
  minerva_ac_7d?: boolean | null;
  minerva_ac_30d?: boolean | null;
  flag_has_minerva_score?: boolean | null;
  minerva_household_income?: string | null;

  // Reviews
  review_count?: number | null;
  avg_review_score?: number | null;

  // CIO activity
  cio_activity_summary?: string | null;

  // Scoring
  lead_quality?: string | null;
  total_score?: number | null;

  // Existing sync tracking (from Outreach prospect if updating)
  existing_sync_count?: number | null;
}

// =====================================================
// MAIN MAPPER
// =====================================================

export type MappedCustomFields = Record<string, string | null>;

/**
 * Map lead data to Outreach custom field values.
 * Returns an object keyed by Outreach custom field names (custom1, custom2, etc.)
 */
export function mapLeadToOutreachFields(lead: LeadData): MappedCustomFields {
  const now = new Date();
  const fields: MappedCustomFields = {};

  // custom1: How Hot
  const howHot = determineHowHot(lead);
  if (howHot) fields.custom1 = howHot;

  // custom23 + custom59: Last Property Checked Out (dual-write for legacy compat)
  const lastCheckout =
    lead.last_checkout_property ??
    lead.last_activity_property_name ??
    lead.webhook_property_name;
  if (lastCheckout) {
    fields.custom23 = safeString(lastCheckout);
    fields.custom59 = safeString(lastCheckout);
  }

  // custom24: Total Money Spent
  const spend = safeFloat(lead.total_spend);
  if (spend != null) fields.custom24 = String(spend);

  // custom25: Last Booking Transaction Date
  if (lead.last_booking_date)
    fields.custom25 = formatDateForOutreach(lead.last_booking_date);

  // custom26: Past Booking Dates (formatted)
  if (lead.past_bookings)
    fields.custom26 = formatPastBookings(lead.past_bookings);

  // custom27: Number of Bookings
  const bookingCount = safeInt(lead.count_confirmed_bookings);
  if (bookingCount != null) fields.custom27 = String(bookingCount);

  // custom30: Last Event Date
  if (lead.last_activity_ts) {
    fields.custom30 = formatDateForOutreach(lead.last_activity_ts);
  } else if (lead.minerva_date_scored) {
    fields.custom30 = formatDateForOutreach(lead.minerva_date_scored);
  }

  // custom31: User ID
  if (lead.id_user) fields.custom31 = safeString(lead.id_user);

  // custom38: Household Income (prefer Minerva enrichment)
  const income = lead.minerva_household_income;
  if (income) fields.custom38 = safeString(income);

  // custom46: Minerva Lead Rank
  const minervaRank = safeInt(lead.minerva_rank);
  if (minervaRank != null) fields.custom46 = String(minervaRank);

  // custom47: Last 5 Properties Checked Out
  if (lead.last_5_checkout_properties)
    fields.custom47 = safeString(lead.last_5_checkout_properties);

  // custom48: Last Sync Timestamp
  fields.custom48 = formatDateTimeForOutreach(now);

  // custom49: Last Activity Timestamp
  if (lead.last_activity_ts)
    fields.custom49 = formatDateTimeForOutreach(lead.last_activity_ts);

  // custom50: Last Sync Tag
  const syncTag = lead.webhook_event_type
    ? SYNC_TAG_MAPPING[lead.webhook_event_type]
    : null;
  if (syncTag) fields.custom50 = syncTag;

  // custom51: Sync Count (increment)
  const prevCount = safeInt(lead.existing_sync_count) ?? 0;
  fields.custom51 = String(prevCount + 1);

  // custom52: Last Event Type
  const eventType = lead.last_activity_type ?? lead.webhook_event_type;
  if (eventType) fields.custom52 = safeString(eventType);

  // custom53: Viewed Properties
  if (lead.interacted_properties)
    fields.custom53 = safeString(lead.interacted_properties);

  // custom58: Wishlisted Properties
  if (lead.wishlisted_properties)
    fields.custom58 = safeString(lead.wishlisted_properties);

  // custom60: Last Property Booked
  if (lead.last_booked_property_name)
    fields.custom60 = safeString(lead.last_booked_property_name);

  // custom61: Last 5 Properties Booked
  if (lead.last_5_booked_properties)
    fields.custom61 = safeString(lead.last_5_booked_properties);

  // custom62: Last Abandoned Cart Date
  if (lead.last_abandoned_cart_date)
    fields.custom62 = formatDateForOutreach(lead.last_abandoned_cart_date);

  // custom63: Last Wishlist Date
  if (lead.last_wishlist_date)
    fields.custom63 = formatDateForOutreach(lead.last_wishlist_date);

  // custom64: CIO Activity Summary (truncated to 2000 chars)
  if (lead.cio_activity_summary)
    fields.custom64 = safeString(lead.cio_activity_summary, 2000);

  // custom65: CIO Profile Link
  if (lead.id_user)
    fields.custom65 = `https://fly.customer.io/env/wander/people/${lead.id_user}`;

  // custom66: Average Review Score
  const reviewScore = safeFloat(lead.avg_review_score);
  if (reviewScore != null) fields.custom66 = String(reviewScore);

  return fields;
}

// =====================================================
// PAYLOAD BUILDERS
// =====================================================

/**
 * Clean a phone number for Outreach (remove non-digit chars except leading +)
 */
function cleanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return cleaned || null;
}

/**
 * Build tags array for a prospect.
 */
export function buildTags(lead: LeadData, existingTags?: string[]): string[] {
  const tags = new Set(existingTags ?? []);

  // Activity tag (priority-based, only highest applies)
  const activityTag = getActivityTag(
    lead.event_types ?? lead.webhook_event_type ?? null,
  );
  if (activityTag) tags.add(activityTag);

  // Sync tag
  const syncTag = lead.webhook_event_type
    ? SYNC_TAG_MAPPING[lead.webhook_event_type]
    : null;
  if (syncTag) tags.add(syncTag);

  // Payment info implies checkout intent; keep both tags for BDR workflows.
  if (lead.webhook_event_type === "payment_info_entered") {
    tags.add("Abandoned Cart");
  }

  // Minerva tags
  if (lead.flag_has_minerva_score) {
    tags.add("minerva_enriched_v2");
    if (lead.minerva_ac_7d) {
      tags.add("AC_LAST7D");
    } else if (lead.minerva_ac_30d) {
      tags.add("AC_LAST30D");
    } else {
      tags.add("NOT_AC");
    }
  }

  return Array.from(tags);
}

/**
 * Format abandoned cart checkout context for Outreach personalNote2.
 * e.g. "Abandoned Cart (Feb 23, 2026): Property: Casa Sol | Check-in: 2026-03-15 | Check-out: 2026-03-22 | Amount: $4,200"
 */
function formatCheckoutContext(lead: LeadData): string | null {
  const parts: string[] = [];
  if (lead.webhook_property_name) parts.push(`Property: ${lead.webhook_property_name}`);
  const checkin = lead.webhook_checkin_date ? formatDateForOutreach(lead.webhook_checkin_date) : null;
  if (checkin) parts.push(`Check-in: ${checkin}`);
  const checkout = lead.webhook_checkout_date ? formatDateForOutreach(lead.webhook_checkout_date) : null;
  if (checkout) parts.push(`Check-out: ${checkout}`);
  if (lead.webhook_checkout_amount != null) {
    parts.push(`Amount: $${lead.webhook_checkout_amount.toLocaleString("en-US")}`);
  }
  if (parts.length === 0) return null;
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `Abandoned Cart (${dateStr}): ${parts.join(" | ")}`;
}

/**
 * Build the full create payload for a new Outreach prospect.
 * Includes standard fields + all custom fields.
 */
export function buildCreatePayload(lead: LeadData): {
  attributes: Record<string, unknown>;
  stageId: number;
  personaId: number;
} {
  const customFields = mapLeadToOutreachFields(lead);
  const tags = buildTags(lead);

  const attributes: Record<string, unknown> = {
    // Standard fields (name is computed by Outreach from firstName+lastName — don't set it)
    firstName: lead.first_name ?? null,
    lastName: lead.last_name ?? null,
    emails: lead.email ? [lead.email] : [],
    addressCity: lead.city ?? null,
    addressState: lead.state ?? null,
    addressCountry: lead.country ?? null,
    tags,
    // Phone
    ...(cleanPhone(lead.phone)
      ? { mobilePhones: [cleanPhone(lead.phone)] }
      : {}),
    // Custom fields
    ...customFields,
  };

  // Determine stage: order_completed → direct booked, else new lead
  const eventType = lead.webhook_event_type ?? "";
  const stageId =
    eventType === "order_completed"
      ? OUTREACH_STAGES.DEMAND_BOOKED_DIRECT
      : OUTREACH_STAGES.DEMAND_NEW;

  // personalNote1: Minerva lead summary
  if (lead.minerva_lead_summary) {
    attributes.personalNote1 = safeString(lead.minerva_lead_summary, 5000);
  }

  // personalNote2: Abandoned cart checkout context (property, dates, amount)
  const checkoutNote = formatCheckoutContext(lead);
  if (checkoutNote) attributes.personalNote2 = checkoutNote;

  return { attributes, stageId, personaId: PERSONA_BOOKING_GUEST_ID };
}

/**
 * Build the update payload for an existing Outreach prospect.
 * Only custom fields — don't overwrite standard fields like name/email/phone.
 */
export function buildUpdatePayload(
  lead: LeadData,
  existingTags?: string[],
): {
  attributes: Record<string, unknown>;
  stageId?: number;
} {
  const customFields = mapLeadToOutreachFields(lead);
  const tags = buildTags(lead, existingTags);

  const attributes: Record<string, unknown> = {
    tags,
    ...customFields,
  };

  // personalNote2: Abandoned cart checkout context (property, dates, amount)
  const checkoutNote = formatCheckoutContext(lead);
  if (checkoutNote) attributes.personalNote2 = checkoutNote;

  // Upgrade stage to booked-direct if order_completed
  let stageId: number | undefined;
  if (lead.webhook_event_type === "order_completed") {
    stageId = OUTREACH_STAGES.DEMAND_BOOKED_DIRECT;
  }

  return { attributes, stageId };
}
