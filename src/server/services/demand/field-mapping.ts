/**
 * Field Mapping — normalized lead → HubSpot Contact `demand_*` properties.
 *
 * Pure data transformation, no external dependencies. The demand-sales sink
 * writes ONLY properties in the `demand_` namespace, which is what keeps the
 * guest/BDR motion separate from the supply-side (PM / Sites) contact fields
 * that live on the very same HubSpot Contact object: `hubspot_owner_id`,
 * `inbound_date`, `inbound_outbound`, `bdr_for_rr` and friends are counted
 * by the PM round-robin and are never touched from here.
 *
 * Property definitions double as the portal setup manifest
 * (scripts/setup-demand-hubspot-properties.ts) so the code and the CRM
 * cannot drift on names or types.
 */
import {
  formatDateForOutreach as formatDate,
  formatDateTimeForOutreach,
  getActivityTag,
  safeFloat,
  safeInt,
  safeString,
  type LeadData,
} from "@/server/services/outreach/field-mapping";

// =====================================================
// STAGES
// =====================================================

/**
 * The `demand_stage` option values the sync writes. The portal's dropdown
 * carries the full BDR-worked pipeline (In Progress, Connected, Wants
 * Options, Invoice Sent, No Reply, Nurture, DNC, …) with value == label;
 * the sync only ever sets these three and leaves everything else to the
 * BDRs. Verified against portal 22480390 on 2026-09-14.
 */
export const DEMAND_STAGES = {
  /** New leads entering the demand pipeline (Outreach stage 40) */
  NEW: "New Lead",
  /** BDR-assisted bookings (Outreach stage 28) — set by BDRs, never by sync */
  BOOKED: "Booked",
  /** Direct bookings without BDR assistance (Outreach stage 68) */
  BOOKED_DIRECT: "Booked Direct",
} as const;

export type DemandStage = (typeof DEMAND_STAGES)[keyof typeof DEMAND_STAGES];

// =====================================================
// PROPERTY MANIFEST
// =====================================================

export const DEMAND_PROPERTY_GROUP = "demand_sales";

export interface DemandPropertyDefinition {
  name: `demand_${string}`;
  label: string;
  type: "string" | "number" | "date" | "datetime" | "enumeration";
  fieldType: "text" | "textarea" | "number" | "date" | "select" | "checkbox";
  description?: string;
  options?: { label: string; value: string }[];
  /** HubSpot user picker — the value written is a HubSpot owner id. */
  referencedObjectType?: "OWNER";
}

export const DEMAND_PROPERTY_DEFINITIONS = [
  {
    name: "demand_stage",
    label: "DEMAND - Stage",
    type: "enumeration",
    fieldType: "select",
    // Already exists in the portal with the full BDR pipeline; listed here
    // only so the manifest names every property the sink writes.
    options: [
      { label: DEMAND_STAGES.NEW, value: DEMAND_STAGES.NEW },
      { label: DEMAND_STAGES.BOOKED, value: DEMAND_STAGES.BOOKED },
      {
        label: DEMAND_STAGES.BOOKED_DIRECT,
        value: DEMAND_STAGES.BOOKED_DIRECT,
      },
    ],
  },
  {
    name: "demand__bdr",
    label: "DEMAND - BDR",
    type: "enumeration",
    fieldType: "select",
    referencedObjectType: "OWNER",
    description:
      "Demand-sales BDR working this guest. Separate from the contact owner, which belongs to supply sales.",
  },
  {
    name: "demand_bdr_email",
    label: "DEMAND - BDR Email",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_assigned_at",
    label: "DEMAND - Assigned At",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "demand_activity_tag",
    label: "DEMAND - Activity",
    type: "string",
    fieldType: "text",
    description:
      "Highest-priority activity: Completed Purchase, Abandoned Payment, Abandoned Cart, Abandoned Wishlist, Abandoned Search, New Signup.",
  },
  {
    // Multi-select: every signal the guest has ever shown, accumulated across
    // syncs (union, never overwrite). demand_activity_tag is the single
    // highest-priority signal; this is the whole set for list segmentation.
    // Values match the raw funnel events (see EVENT_SIGNAL_MAP); created by
    // hand in portal 22480390, verified 2026-09-14.
    name: "demand_signals",
    label: "DEMAND - Signals",
    type: "enumeration",
    fieldType: "checkbox",
    description:
      "Every behavioral signal the guest has shown; accumulates across syncs.",
    options: [
      { label: "New Signup", value: "new_signup" },
      { label: "Abandoned Search", value: "abandoned_search" },
      { label: "Wishlisted", value: "wishlisted" },
      { label: "Abandoned Wishlist", value: "abandoned_wishlist" },
      { label: "Started Checkout", value: "checkout_started" },
      { label: "Abandoned Cart", value: "abandoned_cart" },
      { label: "Entered Payment", value: "payment_entered" },
      { label: "Abandoned Payment", value: "abandoned_payment" },
      { label: "Completed Purchase", value: "completed_purchase" },
    ],
  },
  {
    name: "demand_last_event_type",
    label: "DEMAND - Last Event Type",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_last_event_at",
    label: "DEMAND - Last Event At",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "demand_last_sync_at",
    label: "DEMAND - Last Sync At",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "demand_sync_count",
    label: "DEMAND - Sync Count",
    type: "number",
    fieldType: "number",
  },
  {
    // Outreach personalNote2: property, dates and amount of the most recent
    // abandonment episode. Last episode wins, as it did there.
    name: "demand__note_2",
    label: "DEMAND - Note 2",
    type: "string",
    fieldType: "textarea",
    description:
      "Property, dates and amount from the most recent abandonment episode.",
  },
  {
    name: "demand_last_property_checked_out",
    label: "DEMAND - Last Property Checked Out",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_last_5_checkout_properties",
    label: "DEMAND - Last 5 Checkout Properties",
    type: "string",
    fieldType: "textarea",
  },
  {
    name: "demand_viewed_properties",
    label: "DEMAND - Viewed Properties",
    type: "string",
    fieldType: "textarea",
  },
  {
    name: "demand_wishlisted_properties",
    label: "DEMAND - Wishlisted Properties",
    type: "string",
    fieldType: "textarea",
  },
  {
    name: "demand_last_abandoned_cart_at",
    label: "DEMAND - Last Abandoned Cart",
    type: "date",
    fieldType: "date",
  },
  {
    name: "demand_last_wishlist_at",
    label: "DEMAND - Last Wishlist",
    type: "date",
    fieldType: "date",
  },
  {
    name: "demand_last_search_destination",
    label: "DEMAND - Last Search Destination",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_last_search_dates",
    label: "DEMAND - Last Search Dates",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_search_count",
    label: "DEMAND - Search Count",
    type: "number",
    fieldType: "number",
  },
  {
    name: "demand_last_search_at",
    label: "DEMAND - Last Search",
    type: "date",
    fieldType: "date",
  },
  {
    name: "demand_total_spent",
    label: "DEMAND - Total Spent",
    type: "number",
    fieldType: "number",
  },
  {
    name: "demand_number_of_bookings",
    label: "DEMAND - Number of Bookings",
    type: "number",
    fieldType: "number",
  },
  {
    name: "demand_last_booking_at",
    label: "DEMAND - Last Booking",
    type: "date",
    fieldType: "date",
  },
  {
    name: "demand_last_property_booked",
    label: "DEMAND - Last Property Booked",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_last_5_booked_properties",
    label: "DEMAND - Last 5 Booked Properties",
    type: "string",
    fieldType: "textarea",
  },
  {
    name: "demand_avg_review_score",
    label: "DEMAND - Avg Review Score",
    type: "number",
    fieldType: "number",
  },
  {
    name: "demand_minerva_rank",
    label: "DEMAND - Minerva Rank",
    type: "number",
    fieldType: "number",
  },
  {
    // Outreach personalNote1: the Minerva lead summary. Outreach wrote it on
    // create only; here it refreshes on every sync so a rescored guest reads
    // current. Single underscore — created by hand, unlike demand__bdr/_note_2.
    name: "demand_note_1",
    label: "DEMAND - Note 1",
    type: "string",
    fieldType: "textarea",
    description: "Minerva lead summary.",
  },
  {
    name: "demand_household_income",
    label: "DEMAND - Household Income",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_cio_profile_link",
    label: "DEMAND - Customer.io Profile",
    type: "string",
    fieldType: "text",
  },
  {
    name: "demand_user_id",
    label: "DEMAND - Wander User ID",
    type: "string",
    fieldType: "text",
  },
] as const satisfies readonly DemandPropertyDefinition[];

export type DemandPropertyName =
  (typeof DEMAND_PROPERTY_DEFINITIONS)[number]["name"];

export const DEMAND_PROPERTY_NAMES: DemandPropertyName[] =
  DEMAND_PROPERTY_DEFINITIONS.map((definition) => definition.name);

/** The properties the sink reads back before deciding what to write. */
export const DEMAND_STATE_PROPERTIES = [
  "demand_stage",
  "demand__bdr",
  "demand_bdr_email",
  "demand_sync_count",
  // demand_signals accumulates, so the current set has to be read back and
  // unioned with the new event rather than overwritten.
  "demand_signals",
] as const satisfies readonly DemandPropertyName[];

/**
 * The write payload: every key is a `demand_*` property, enforced by the
 * type so a supply-side field can never ride along.
 */
export type DemandContactProperties = Partial<
  Record<DemandPropertyName, string>
>;

/** Identity fields written only when the sink creates a brand-new contact. */
export interface DemandContactIdentity {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
}

// =====================================================
// MAPPER
// =====================================================

export interface DemandMappingContext {
  /** Assigned BDR, if any. `hubspotOwnerId` null → only the email is stamped. */
  bdr?: { name: string; email: string; hubspotOwnerId: string | null } | null;
  /** True when this sync is the one that assigned the BDR. */
  newlyAssigned?: boolean;
  /** Current `demand_stage` on the contact; undefined for a new contact. */
  existingStage?: string | null;
  /** Current `demand_sync_count` on the contact. */
  existingSyncCount?: number | null;
  /** Signals already on `demand_signals`; the new event is unioned into this. */
  existingSignals?: string[] | null;
  now?: Date;
}

/**
 * Raw funnel event → `demand_signals` option value. The five identity
 * mappings and four renames match the picker the field was created with
 * (portal 22480390). Keyed on the full event token so `.includes` on an
 * aggregated `event_types` string can never conflate two events.
 */
export const EVENT_SIGNAL_MAP: Record<string, string> = {
  user_signed_up: "new_signup",
  abandoned_search: "abandoned_search",
  product_added_to_wishlist: "wishlisted",
  abandoned_wishlist: "abandoned_wishlist",
  checkout_started: "checkout_started",
  abandoned_cart: "abandoned_cart",
  payment_info_entered: "payment_entered",
  abandoned_payment: "abandoned_payment",
  order_completed: "completed_purchase",
};

/**
 * The accumulated signal set: everything already on the contact, plus every
 * known event named in this lead's aggregated `event_types` and its
 * triggering `webhook_event_type`. Union — a BDR's manual pick and past
 * signals are preserved; the same event twice does not duplicate. Order is
 * the manifest's so lists read consistently.
 */
export function resolveDemandSignals(
  lead: LeadData,
  existingSignals?: string[] | null,
): string[] {
  const set = new Set(existingSignals ?? []);
  const haystack =
    `${lead.event_types ?? ""} ${lead.webhook_event_type ?? ""}`.toLowerCase();
  for (const [event, signal] of Object.entries(EVENT_SIGNAL_MAP)) {
    if (haystack.includes(event)) set.add(signal);
  }
  const order = Object.values(EVENT_SIGNAL_MAP);
  return [...set].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    // Unknown values (a BDR's manual pick outside our map) sort to the end,
    // stable among themselves, so they are preserved rather than dropped.
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}

/**
 * Map a normalized lead to the `demand_*` property payload.
 *
 * Latest-wins by design (Phase 1 parity with Outreach): each sync overwrites
 * the "last …" fields with the newest episode. Event history is Phase 2's
 * User Events object.
 */
export function mapLeadToDemandProps(
  lead: LeadData,
  context: DemandMappingContext = {},
): DemandContactProperties {
  const now = context.now ?? new Date();
  const props: DemandContactProperties = {};
  const set = (name: DemandPropertyName, value: string | null | undefined) => {
    if (value != null && value !== "") props[name] = value;
  };

  // Stage — only ever upgrades. A BDR-set "booked" is never regressed to "new".
  const stage = resolveDemandStage(lead, context.existingStage);
  set("demand_stage", stage);

  // BDR. The picker is written explicitly — an empty string clears it — so
  // a rep with no HubSpot owner record can never leave a stale picker value
  // outranking the fresher email.
  if (context.bdr) {
    props.demand__bdr = context.bdr.hubspotOwnerId ?? "";
    set("demand_bdr_email", context.bdr.email.toLowerCase());
    if (context.newlyAssigned) set("demand_assigned_at", now.toISOString());
  }

  // Activity
  const eventType = lead.last_activity_type ?? lead.webhook_event_type;
  set(
    "demand_activity_tag",
    getActivityTag(lead.event_types ?? lead.webhook_event_type ?? null),
  );
  // Accumulated multi-select. Written as the HubSpot `;`-delimited set; only
  // set when non-empty so a lead with no known event never clears a BDR's
  // manual picks.
  const signals = resolveDemandSignals(lead, context.existingSignals);
  if (signals.length > 0) props.demand_signals = signals.join(";");
  set("demand_last_event_type", safeString(eventType));
  set("demand_last_event_at", toIsoDateTime(lead.last_activity_ts));
  set("demand_last_sync_at", now.toISOString());
  set(
    "demand_sync_count",
    String((safeInt(context.existingSyncCount) ?? 0) + 1),
  );
  set("demand__note_2", formatCheckoutContext(lead, now));

  // Properties
  set(
    "demand_last_property_checked_out",
    safeString(
      lead.last_checkout_property ??
        lead.last_activity_property_name ??
        lead.webhook_property_name,
    ),
  );
  set(
    "demand_last_5_checkout_properties",
    safeString(lead.last_5_checkout_properties),
  );
  set("demand_viewed_properties", safeString(lead.interacted_properties));
  set("demand_wishlisted_properties", safeString(lead.wishlisted_properties));
  set(
    "demand_last_abandoned_cart_at",
    formatDate(lead.last_abandoned_cart_date),
  );
  set("demand_last_wishlist_at", formatDate(lead.last_wishlist_date));

  // Abandoned search
  set(
    "demand_last_search_destination",
    safeString(lead.webhook_search_destination),
  );
  if (
    lead.webhook_event_type === "abandoned_search" &&
    lead.webhook_checkin_date &&
    lead.webhook_checkout_date
  ) {
    const from = formatDate(lead.webhook_checkin_date);
    const to = formatDate(lead.webhook_checkout_date);
    if (from && to) set("demand_last_search_dates", `${from} → ${to}`);
  }
  const searchCount = safeInt(lead.webhook_search_count);
  if (searchCount != null) set("demand_search_count", String(searchCount));
  set("demand_last_search_at", formatDate(lead.webhook_last_search_date));

  // Bookings
  const spend = safeFloat(lead.total_spend);
  if (spend != null) set("demand_total_spent", String(spend));
  const bookings = safeInt(lead.count_confirmed_bookings);
  if (bookings != null) set("demand_number_of_bookings", String(bookings));
  set("demand_last_booking_at", formatDate(lead.last_booking_date));
  set(
    "demand_last_property_booked",
    safeString(lead.last_booked_property_name),
  );
  set(
    "demand_last_5_booked_properties",
    safeString(lead.last_5_booked_properties),
  );
  const review = safeFloat(lead.avg_review_score);
  if (review != null) set("demand_avg_review_score", String(review));

  // Enrichment
  const minervaRank = safeInt(lead.minerva_rank);
  if (minervaRank != null) set("demand_minerva_rank", String(minervaRank));
  set("demand_note_1", safeString(lead.minerva_lead_summary, 5000));
  set("demand_household_income", safeString(lead.minerva_household_income));
  if (lead.id_user) {
    set("demand_user_id", safeString(lead.id_user));
    set(
      "demand_cio_profile_link",
      `https://fly.customer.io/env/wander/people/${lead.id_user}`,
    );
  }

  return props;
}

/** Standard fields for a contact the sink is creating from scratch. */
export function mapLeadToContactIdentity(
  lead: LeadData,
  email: string,
): DemandContactIdentity {
  const identity: DemandContactIdentity = { email: email.toLowerCase() };
  if (lead.first_name) identity.firstname = lead.first_name;
  if (lead.last_name) identity.lastname = lead.last_name;
  const phone = cleanPhone(lead.phone);
  if (phone) identity.phone = phone;
  return identity;
}

/** Stages that mean the guest has booked; a later booking event never rewrites them. */
const BOOKED_STAGES: ReadonlySet<string> = new Set([
  DEMAND_STAGES.BOOKED,
  DEMAND_STAGES.BOOKED_DIRECT,
  "Booked OTA",
]);

/**
 * Stage transition rule. A new contact starts at New Lead; `order_completed`
 * moves any unbooked stage to Booked Direct (Outreach parity — a booking
 * closes the loop regardless of where the BDR left it); a stage that already
 * says "booked" is kept, so a BDR-assisted booking is not re-attributed as
 * direct when the order event arrives. Everything else is the BDR's to set.
 */
export function resolveDemandStage(
  lead: LeadData,
  existingStage: string | null | undefined,
): DemandStage | null {
  if (lead.webhook_event_type === "order_completed") {
    if (existingStage && BOOKED_STAGES.has(existingStage)) return null;
    return DEMAND_STAGES.BOOKED_DIRECT;
  }
  if (!existingStage) return DEMAND_STAGES.NEW;
  return null;
}

// =====================================================
// HELPERS
// =====================================================

function toIsoDateTime(value: unknown): string | null {
  const formatted = formatDateTimeForOutreach(value);
  if (!formatted) return null;
  const parsed = new Date(formatted);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cleanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return cleaned || null;
}

function eventContextLabel(eventType: string | null | undefined): string {
  switch (eventType) {
    case "order_completed":
      return "Booking Confirmed";
    case "payment_info_entered":
    case "abandoned_payment":
      return "Abandoned Payment";
    case "product_added_to_wishlist":
      return "Wishlisted";
    case "abandoned_wishlist":
      return "Abandoned Wishlist";
    case "abandoned_search":
      return "Abandoned Search";
    default:
      return "Abandoned Cart";
  }
}

/**
 * e.g. "Abandoned Cart (Feb 23, 2026): Property: Casa Sol | Check-in: 2026-03-15 | Amount: $4,200"
 */
export function formatCheckoutContext(
  lead: LeadData,
  now: Date,
): string | null {
  const parts: string[] = [];
  if (lead.webhook_property_name)
    parts.push(`Property: ${lead.webhook_property_name}`);
  if (lead.webhook_search_destination)
    parts.push(`Destination: ${lead.webhook_search_destination}`);
  const checkin = formatDate(lead.webhook_checkin_date);
  if (checkin) parts.push(`Check-in: ${checkin}`);
  const checkout = formatDate(lead.webhook_checkout_date);
  if (checkout) parts.push(`Check-out: ${checkout}`);
  if (lead.webhook_checkout_amount != null) {
    parts.push(
      `Amount: $${lead.webhook_checkout_amount.toLocaleString("en-US")}`,
    );
  }
  if (parts.length === 0) return null;
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${eventContextLabel(lead.webhook_event_type)} (${dateStr}): ${parts.join(" | ")}`;
}
