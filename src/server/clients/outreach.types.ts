/**
 * Outreach API TypeScript Type Definitions
 *
 * Lightweight types for the most commonly used Outreach API resources.
 * Outreach uses JSON:API format, so all responses follow that structure.
 *
 * Reference: https://developers.outreach.io/api/reference/overview/
 */

// =====================================================
// JSON:API WRAPPER TYPES
// =====================================================

/**
 * JSON:API resource wrapper
 * All Outreach resources follow this structure
 *
 * Note: Outreach uses numeric IDs despite JSON:API recommending strings
 */
export interface JsonApiResource<
  Type extends string = string,
  Attributes = Record<string, unknown>,
> {
  id: string | number;
  type: Type;
  attributes: Attributes;
  relationships?: Record<
    string,
    {
      data:
        | { id: string | number; type: string }
        | { id: string | number; type: string }[]
        | null;
      links?: {
        self?: string;
        related?: string;
      };
      meta?: {
        count?: number;
        [key: string]: unknown;
      };
    }
  >;
  links?: {
    self?: string;
  };
  meta?: Record<string, unknown>;
}

/**
 * JSON:API collection response with pagination
 */
export interface JsonApiCollectionResponse<T = JsonApiResource> {
  data: T[];
  links?: {
    first?: string;
    last?: string;
    next?: string;
    prev?: string;
    self?: string;
  };
  meta?: {
    count?: number;
    [key: string]: unknown;
  };
}

/**
 * JSON:API single resource response
 */
export interface JsonApiSingleResponse<T = JsonApiResource> {
  data: T;
  links?: {
    self?: string;
  };
  meta?: Record<string, unknown>;
}

// =====================================================
// PROSPECT
// =====================================================

export interface ProspectAttributes {
  // Basic info
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  title: string | null;
  company: string | null;

  // Contact info
  emails: string[];
  workPhones: string[];
  mobilePhones: string[];
  homePhones: string[];

  // Address
  addressCity: string | null;
  addressState: string | null;
  addressCountry: string | null;
  addressStreet: string | null;
  addressStreet2: string | null;
  addressZip: string | null;

  // Social
  linkedInUrl: string | null;
  linkedInId: string | null;
  twitterUsername: string | null;
  githubUsername: string | null;

  // Engagement
  engagedAt: string | null;
  engagedScore: number | null;
  openCount: number;
  clickCount: number;
  replyCount: number;

  // Opt out status
  emailsOptStatus: string | null;
  emailsOptedAt: string | null;
  callsOptStatus: string | null;
  callsOptedAt: string | null;

  // Stage
  availableAt: string | null;
  addedAt: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;
  touchedAt: string | null;

  // External
  externalId: string | null;
  externalSource: string | null;

  // =====================================================
  // CUSTOM FIELDS: PROPERTY SELLER/OWNER PERSONA (1-22)
  // =====================================================
  custom1?: string | null; // How Hot?
  custom2?: string | null; // # of Listings
  custom3?: string | null; // # of OTA
  custom4?: string | null; // # of MLS - For Sale
  custom5?: string | null; // # of MLS - For Rent
  custom6?: string | null; // # of MLS - Off Market
  custom7?: string | null; // Follow-Up Date
  custom8?: string | null; // HubSpot Link
  custom9?: string | null; // Newest Contact on Listing?
  custom10?: string | null; // OTA Link (newest)
  custom11?: string | null; // MLS Link (newest)
  custom12?: string | null; // Listing ID (newest)
  custom13?: string | null; // Listing Type (newest)
  custom14?: string | null; // Listing Street (newest)
  custom15?: string | null; // Listing City (newest)
  custom16?: string | null; // Listing State (newest)
  custom17?: string | null; // Listing Bedrooms (newest)
  custom18?: string | null; // Currently in HS Sequence
  custom19?: string | null; // Last Enriched
  custom20?: string | null; // Owner Assigned Date
  custom21?: string | null; // Last Activity Date (HubSpot)
  custom22?: string | null; // Last Contacted Date (HubSpot)

  // =====================================================
  // CUSTOM FIELDS: BOOKING GUEST PERSONA (23-66)
  // =====================================================
  custom23?: string | null; // Last Property Checked Out
  custom24?: string | null; // Total Money Spent
  custom25?: string | null; // Last Booking Transaction Date
  custom26?: string | null; // Past Booking Dates
  custom27?: string | null; // Number of Bookings
  custom28?: string | null; // Credits Balance
  custom29?: string | null; // Points Balance
  custom30?: string | null; // Last Event Date
  custom31?: string | null; // User ID (Customer.io)
  custom32?: string | null; // Reason For Not Booking
  custom33?: string | null; // remove_recently_assigned_tag
  custom34?: string | null; // has_recently_assigned_tag
  custom35?: string | null; // phones_emails_initialized
  custom36?: string | null; // New Zillow FR Lead?
  custom37?: string | null; // Length of Residency
  custom38?: string | null; // Household Income
  custom39?: string | null; // Melissa Enriched?
  custom40?: string | null; // AI Score (Highest)
  custom41?: string | null; // persona_name
  custom42?: string | null; // PM Name
  custom43?: string | null; // Rep-Sourced?
  custom44?: string | null; // WW Listing URL (PM Leads)
  custom45?: string | null; // PM Website
  custom46?: string | null; // Minerva Lead Rank
  custom47?: string | null; // Last 5 Properties Checked Out
  custom48?: string | null; // last_sync_timestamp
  custom49?: string | null; // last_activity_timestamp
  custom50?: string | null; // last_sync_tag
  custom51?: string | null; // sync_count
  custom52?: string | null; // last_event_type
  custom53?: string | null; // viewed_properties
  custom54?: string | null; // WW Listing Name
  custom55?: string | null; // Propensity Score
  custom56?: string | null; // How they heard about us
  custom57?: string | null; // Portfolio Size (Rep-Verified)
  custom58?: string | null; // wishlisted_properties
  custom59?: string | null; // last_property_checked_out
  custom60?: string | null; // Last Property Booked
  custom61?: string | null; // Last 5 Properties Booked
  custom62?: string | null; // Last Abandoned Cart Date
  custom63?: string | null; // Last Wishlist Date
  custom64?: string | null; // CIO Activity (email campaign status)
  custom65?: string | null; // CIO Profile Link
  custom66?: string | null; // AVG Review Score
  custom67?: string | null;
  custom68?: string | null;
  custom69?: string | null;
  custom70?: string | null;
  custom71?: string | null;
  custom72?: string | null;
  custom73?: string | null;
  custom74?: string | null;
  custom75?: string | null;
  custom76?: string | null;
  custom77?: string | null;
  custom78?: string | null;
  custom79?: string | null;
  custom80?: string | null;
  custom81?: string | null;
  custom82?: string | null;
  custom83?: string | null;
  custom84?: string | null;
  custom85?: string | null;
  custom86?: string | null;
  custom87?: string | null;
  custom88?: string | null;
  custom89?: string | null;
  custom90?: string | null;
  custom91?: string | null;
  custom92?: string | null;
  custom93?: string | null;
  custom94?: string | null;
  custom95?: string | null;
  custom96?: string | null;
  custom97?: string | null;
  custom98?: string | null;
  custom99?: string | null;
  custom100?: string | null;
  custom101?: string | null;
  custom102?: string | null;
  custom103?: string | null;
  custom104?: string | null;
  custom105?: string | null;
  custom106?: string | null;
  custom107?: string | null;
  custom108?: string | null;
  custom109?: string | null;
  custom110?: string | null;
  custom111?: string | null;
  custom112?: string | null;
  custom113?: string | null;
  custom114?: string | null;
  custom115?: string | null;
  custom116?: string | null;
  custom117?: string | null;
  custom118?: string | null;
  custom119?: string | null;
  custom120?: string | null;
  custom121?: string | null;
  custom122?: string | null;
  custom123?: string | null;
  custom124?: string | null;
  custom125?: string | null;
  custom126?: string | null;
  custom127?: string | null;
  custom128?: string | null;
  custom129?: string | null;
  custom130?: string | null;
  custom131?: string | null;
  custom132?: string | null;
  custom133?: string | null;
  custom134?: string | null;
  custom135?: string | null;
  custom136?: string | null;
  custom137?: string | null;
  custom138?: string | null;
  custom139?: string | null;
  custom140?: string | null;
  custom141?: string | null;
  custom142?: string | null;
  custom143?: string | null;
  custom144?: string | null;
  custom145?: string | null;
  custom146?: string | null;
  custom147?: string | null;
  custom148?: string | null;
  custom149?: string | null;
  custom150?: string | null;

  // Tags
  tags: string[];

  // Time zone
  timeZone: string | null;
  timeZoneIana: string | null;

  [key: string]: unknown; // Allow additional fields
}

export type Prospect = JsonApiResource<"prospect", ProspectAttributes>;
export type ProspectsResponse = JsonApiCollectionResponse<Prospect>;
export type ProspectResponse = JsonApiSingleResponse<Prospect>;

// =====================================================
// ACCOUNT
// =====================================================

export interface AccountAttributes {
  // Basic info
  name: string;
  domain: string | null;
  description: string | null;
  customId: string | null;

  // Company info
  locality: string | null;
  industry: string | null;
  companyType: string | null;
  websiteUrl: string | null;

  // Size
  numberOfEmployees: number | null;
  linkedInEmployees: number | null;

  // LinkedIn
  linkedInUrl: string | null;
  followers: number | null;

  // Financial
  foundedAt: string | null;
  annualRevenueRange: string | null;
  tickerSymbol: string | null;

  // Scores
  buyerIntentScore: number | null;

  // Metadata
  createdAt: string;
  updatedAt: string;
  touchedAt: string | null;

  // External
  externalSource: string | null;

  // Flags
  named: boolean;
  naturalName: string | null;

  // Tags
  tags: string[];

  // Custom fields (first 10)
  custom1?: string | null;
  custom2?: string | null;
  custom3?: string | null;
  custom4?: string | null;
  custom5?: string | null;

  // Sharing
  sharingTeamId: string | null;

  [key: string]: unknown;
}

export type Account = JsonApiResource<"account", AccountAttributes>;
export type AccountsResponse = JsonApiCollectionResponse<Account>;
export type AccountResponse = JsonApiSingleResponse<Account>;

// =====================================================
// USER
// =====================================================

export interface UserAttributes {
  // Basic info
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  name: string;
  title: string | null;

  // Status
  locked: boolean;

  // Contact
  phoneNumber: string | null;
  phoneCountryCode: string | null;
  phoneType: string | null;

  // Timezones
  primaryTimezone: string | null;
  secondaryTimezone: string | null;
  tertiaryTimezone: string | null;

  // Activity
  currentSignInAt: string | null;
  lastSignInAt: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;
  userGuid: string;

  // Custom
  custom1?: string | null;
  custom2?: string | null;
  custom3?: string | null;
  custom4?: string | null;
  custom5?: string | null;

  [key: string]: unknown;
}

export type User = JsonApiResource<"user", UserAttributes>;
export type UsersResponse = JsonApiCollectionResponse<User>;
export type UserResponse = JsonApiSingleResponse<User>;

// =====================================================
// SEQUENCE
// =====================================================

export interface SequenceAttributes {
  // Basic info
  name: string;
  description: string | null;

  // Status
  enabled: boolean;
  enabledAt: string | null;
  locked: boolean;
  lockedAt: string | null;

  // Configuration
  transactional: boolean;
  finishOnReply: boolean;
  scheduleIntervalType: string | null;
  scheduleCount: number;
  maxActivations: number | null;
  sequenceType: string | null;
  shareType: string;

  // Metrics
  bounceCount: number;
  clickCount: number;
  deliverCount: number;
  openCount: number;
  replyCount: number;
  failureCount: number;
  optOutCount: number;

  // Reply counts
  positiveReplyCount: number;
  neutralReplyCount: number;
  negativeReplyCount: number;

  // Stats
  durationInDays: number;
  sequenceStepCount: number;
  numContactedProspects: number;
  numRepliedProspects: number;
  automationPercentage: number;

  // Usage
  lastUsedAt: string | null;

  // Throttling
  throttleCapacity: number | null;
  throttleMaxAddsPerDay: number | null;
  throttlePaused: boolean | null;
  throttlePausedAt: string | null;

  // Reply actions
  primaryReplyAction: string | null;
  primaryReplyPauseDuration: number | null;
  secondaryReplyAction: string | null;
  secondaryReplyPauseDuration: number | null;

  // Metadata
  createdAt: string;
  updatedAt: string;

  // Tags
  tags: string[];

  [key: string]: unknown;
}

export type Sequence = JsonApiResource<"sequence", SequenceAttributes>;
export type SequencesResponse = JsonApiCollectionResponse<Sequence>;
export type SequenceResponse = JsonApiSingleResponse<Sequence>;

// =====================================================
// SEQUENCE STATE
// =====================================================

export interface SequenceStateAttributes {
  // Status
  state: string; // 'active', 'paused', 'finished', 'bounced'
  stateChangedAt: string;
  pauseReason: string | null;

  // Timing
  activeAt: string | null;

  // Metrics
  bounceCount: number;
  clickCount: number;
  deliverCount: number;
  openCount: number;
  replyCount: number;
  failureCount: number;
  optOutCount: number;
  scheduleCount: number;

  // Reply counts
  positiveReplyCount: number;
  neutralReplyCount: number;
  negativeReplyCount: number;

  // Activity
  repliedAt: string | null;
  callCompletedAt: string | null;

  // Error
  errorReason: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;

  [key: string]: unknown;
}

export type SequenceState = JsonApiResource<
  "sequenceState",
  SequenceStateAttributes
>;
export type SequenceStatesResponse = JsonApiCollectionResponse<SequenceState>;
export type SequenceStateResponse = JsonApiSingleResponse<SequenceState>;

// =====================================================
// STAGE
// =====================================================

export interface StageAttributes {
  name: string;
  order: number;
  color: string | null;
  createdAt: string;
  updatedAt: string;

  [key: string]: unknown;
}

export type Stage = JsonApiResource<"stage", StageAttributes>;
export type StagesResponse = JsonApiCollectionResponse<Stage>;
export type StageResponse = JsonApiSingleResponse<Stage>;

// =====================================================
// MAILING
// =====================================================

export interface MailingAttributes {
  // Status
  state: string; // 'scheduled', 'sending', 'sent', 'bounced', 'failed'
  stateChangedAt: string;
  mailingType: string;

  // Email content
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;

  // Tracking
  trackOpens: boolean | null;
  trackLinks: boolean | null;

  // Metrics
  openCount: number;
  clickCount: number;

  // Timing
  scheduledAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  unsubscribedAt: string | null;
  markedAsSpamAt: string | null;

  // Error handling
  errorReason: string | null;
  errorBacktrace: string | null;
  retryAt: string | null;
  retryCount: number;

  // Follow up
  followUpTaskScheduledAt: string | null;
  followUpTaskType: string | null;

  // Technical
  messageId: string | null;
  mailboxAddress: string | null;
  references: string[];

  // Metadata
  createdAt: string;
  updatedAt: string;

  [key: string]: unknown;
}

export type Mailing = JsonApiResource<"mailing", MailingAttributes>;
export type MailingsResponse = JsonApiCollectionResponse<Mailing>;
export type MailingResponse = JsonApiSingleResponse<Mailing>;

// =====================================================
// CUSTOM OBJECTS (Wander-specific)
// =====================================================

/**
 * Booking - A guest reservation
 */
export interface BookingAttributes {
  // Booking identification
  booking_id: string | null;
  id_booking: string | null;
  id_user: string | null;

  // Booking details
  booking_type: string | null;
  property_name: string | null;
  booking_price: number | null;
  booking_stay_length: number | null;

  // Dates
  check_in_date: string | null;
  check_out_date: string | null;
  ts_created: string | null;
  ts_confirmed: string | null;
  ts_canceled: string | null;

  // Booking status
  status: string | null;
  is_direct_booking: boolean | null;
  is_name_your_price: boolean | null;
  is_profit: boolean | null;

  // OTA details
  ota_source: string | null;
  ota_fee_percentage: number | null;

  // Guest details
  num_guest_invites: number | null;

  // Metadata
  createdAt: string;
  updatedAt: string;

  [key: string]: unknown;
}

export type Booking = JsonApiResource<"bookings", BookingAttributes>;
export type BookingsResponse = JsonApiCollectionResponse<Booking>;
export type BookingResponse = JsonApiSingleResponse<Booking>;

/**
 * Listing - A property available for booking
 */
export interface ListingAttributes {
  // Basic info
  listing_name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  state_abbreviation: string | null;

  // Property details
  type: string | null;
  primary_secondary_residence: string | null;

  // Listings/URLs
  mls_listing: string | null;
  ota_listing: string | null;
  ota_link_last_checked: string | null;
  wos_url: string | null;

  // External IDs
  hubspot_id: number | null;
  hubspot_link: string | null;

  // Status
  stage: string | null;
  wander_worthy: string | null;
  wander_worthy_date_confirmed: string | null;

  // Property management
  airdna_pm: string | null;

  // Zillow data
  zillow_url_confirmed: string | null;
  zillow_status: string | null;
  zillow_home_type: string | null;
  zillow_bedrooms: number | null;
  zillow_bathrooms: number | null;
  zillow_price: number | null;
  zillow_price_change: number | null;
  zillow_price_change_date: string | null;
  zillow_price_history: string | null;
  zillow_last_scraped: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;

  [key: string]: unknown;
}

export type Listing = JsonApiResource<"listings", ListingAttributes>;
export type ListingsResponse = JsonApiCollectionResponse<Listing>;
export type ListingResponse = JsonApiSingleResponse<Listing>;

/**
 * User Event - Activity tracking for prospects
 */
export interface UserEventAttributes {
  // Event identification
  event_id: string | null;
  id_event: string | null;
  event_type: string | null;
  event_source: string | null;

  // User
  user_id: string | null;

  // Property context
  property_name: string | null;
  property_city: string | null;
  property_state: string | null;
  category_name: string | null;

  // Event details
  page_viewed: string | null;
  platform: string | null;
  is_from_mobile_device: boolean | null;

  // Revenue
  booking_revenue: number | null;

  // Timestamp
  ts: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;

  [key: string]: unknown;
}

export type UserEvent = JsonApiResource<"user_events", UserEventAttributes>;
export type UserEventsResponse = JsonApiCollectionResponse<UserEvent>;
export type UserEventResponse = JsonApiSingleResponse<UserEvent>;

// =====================================================
// HELPER TYPES
// =====================================================

/**
 * Common query parameters for list endpoints
 */
export interface OutreachListParams {
  "page[size]"?: number;
  "page[number]"?: number;
  "filter[id]"?: string | string[];
  "sort"?: string;
  "count"?: boolean;
  [key: string]: unknown;
}

/**
 * Outreach error response
 */
export interface OutreachErrorResponse {
  errors?: Array<{
    id?: string;
    status?: string;
    code?: string;
    title?: string;
    detail?: string;
    source?: {
      pointer?: string;
      parameter?: string;
    };
    meta?: Record<string, unknown>;
  }>;
}

// =====================================================
// WANDER-SPECIFIC UTILITY TYPES
// =====================================================

/**
 * Property Seller/Owner custom fields (custom1-22)
 */
export type PropertySellerFields = Pick<
  ProspectAttributes,
  | "custom1" // How Hot?
  | "custom2" // # of Listings
  | "custom3" // # of OTA
  | "custom4" // # of MLS - For Sale
  | "custom5" // # of MLS - For Rent
  | "custom6" // # of MLS - Off Market
  | "custom7" // Follow-Up Date
  | "custom8" // HubSpot Link
  | "custom9" // Newest Contact on Listing?
  | "custom10" // OTA Link (newest)
  | "custom11" // MLS Link (newest)
  | "custom12" // Listing ID (newest)
  | "custom13" // Listing Type (newest)
  | "custom14" // Listing Street (newest)
  | "custom15" // Listing City (newest)
  | "custom16" // Listing State (newest)
  | "custom17" // Listing Bedrooms (newest)
  | "custom18" // Currently in HS Sequence
  | "custom19" // Last Enriched
  | "custom20" // Owner Assigned Date
  | "custom21" // Last Activity Date (HubSpot)
  | "custom22" // Last Contacted Date (HubSpot)
>;

/**
 * Booking Guest custom fields (custom23-66)
 */
export type BookingGuestFields = Pick<
  ProspectAttributes,
  | "custom23" // Last Property Checked Out
  | "custom24" // Total Money Spent
  | "custom25" // Last Booking Transaction Date
  | "custom26" // Past Booking Dates
  | "custom27" // Number of Bookings
  | "custom28" // Credits Balance
  | "custom29" // Points Balance
  | "custom30" // Last Event Date
  | "custom31" // User ID (Customer.io)
  | "custom32" // Reason For Not Booking
  | "custom40" // AI Score (Highest)
  | "custom46" // Minerva Lead Rank
  | "custom47" // Last 5 Properties Checked Out
  | "custom48" // last_sync_timestamp
  | "custom49" // last_activity_timestamp
  | "custom50" // last_sync_tag
  | "custom51" // sync_count
  | "custom52" // last_event_type
  | "custom53" // viewed_properties
  | "custom55" // Propensity Score
  | "custom58" // wishlisted_properties
  | "custom60" // Last Property Booked
  | "custom61" // Last 5 Properties Booked
  | "custom62" // Last Abandoned Cart Date
  | "custom63" // Last Wishlist Date
  | "custom64" // CIO Activity
  | "custom65" // CIO Profile Link
  | "custom66" // AVG Review Score
>;

/**
 * Helper to identify prospect persona based on custom fields
 */
export function getProspectPersona(
  prospect: Prospect,
): "property_seller" | "booking_guest" | "unknown" {
  const attrs = prospect.attributes;

  // Check for booking guest signals
  const hasGuestFields =
    attrs.custom31 || // Customer.io ID
    attrs.custom50 || // last_sync_tag
    attrs.custom52 || // last_event_type
    attrs.custom64; // CIO Activity

  // Check for property seller signals
  const hasSellerFields =
    attrs.custom2 || // # of Listings
    attrs.custom8 || // HubSpot Link
    attrs.custom12; // Listing ID

  if (hasGuestFields) return "booking_guest";
  if (hasSellerFields) return "property_seller";
  return "unknown";
}

/**
 * Booking Guest with key fields typed
 */
export interface BookingGuestProspect extends Prospect {
  attributes: ProspectAttributes & {
    custom23: string | null; // Last Property Checked Out
    custom24: string | null; // Total Money Spent
    custom27: string | null; // Number of Bookings
    custom30: string | null; // Last Event Date
    custom31: string | null; // User ID (Customer.io)
    custom50: string | null; // last_sync_tag
    custom52: string | null; // last_event_type
    custom53: string | null; // viewed_properties
    custom62: string | null; // Last Abandoned Cart Date
    custom64: string | null; // CIO Activity
    custom65: string | null; // CIO Profile Link
  };
}

/**
 * Property Seller with key fields typed
 */
export interface PropertySellerProspect extends Prospect {
  attributes: ProspectAttributes & {
    custom1: string | null; // How Hot?
    custom2: string | null; // # of Listings
    custom8: string | null; // HubSpot Link
    custom12: string | null; // Listing ID (newest)
    custom15: string | null; // Listing City (newest)
    custom16: string | null; // Listing State (newest)
  };
}
