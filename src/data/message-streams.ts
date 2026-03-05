/**
 * Wander Message Streams — Orchestration Map
 *
 * Models the concurrent message streams a single user can be in,
 * their triggers, exit criteria, suppression rules, and conflict zones.
 */

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type PhaseId =
  | "signup"
  | "onboarding"
  | "active"
  | "qualified"
  | "booking"
  | "pre-trip"
  | "during-trip"
  | "post-trip";

export type StreamId =
  | "onboarding"
  | "newsletter"
  | "property-recs"
  | "sales-outreach"
  | "transactional"
  | "concierge";

export type ToolId = "customer-io" | "outreach" | "system" | "human";

export interface Phase {
  id: PhaseId;
  label: string;
  description: string;
  triggerEvent?: string;
  durationHint?: string;
}

export interface MessageStream {
  id: StreamId;
  label: string;
  description: string;
  tool: ToolId;
  owner: string;
  type: "automated" | "semi-automated" | "human";
  color: string;
  /** Which phases this stream can be active during */
  activePhases: PhaseId[];
  trigger: string;
  exitCriteria: string[];
  messages?: string[];
}

export interface SuppressionRule {
  id: string;
  /** The stream that takes priority */
  dominant: StreamId;
  /** The stream that gets suppressed */
  suppressed: StreamId;
  condition: string;
  description: string;
  severity: "hard" | "soft";
}

export interface ConflictZone {
  id: string;
  streams: StreamId[];
  phases: PhaseId[];
  risk: string;
  resolution: string;
  status: "resolved" | "needs-rules" | "unknown";
}

// ─────────────────────────────────────────
// PHASES (left to right timeline)
// ─────────────────────────────────────────

export const PHASES: Phase[] = [
  {
    id: "signup",
    label: "Signup",
    description: "User creates account",
    triggerEvent: "User Signed Up",
    durationHint: "instant",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    description: "Welcome sequence, value prop education",
    durationHint: "7-14 days",
  },
  {
    id: "active",
    label: "Active Browsing",
    description: "User searches, views properties, builds wishlists",
    durationHint: "ongoing",
  },
  {
    id: "qualified",
    label: "Qualified Lead",
    description: "User shows high intent or high-value signals",
    triggerEvent: "Lead score threshold / Payment Info Entered",
    durationHint: "event-driven",
  },
  {
    id: "booking",
    label: "Booking",
    description: "User completes a reservation",
    triggerEvent: "Order Completed",
    durationHint: "instant",
  },
  {
    id: "pre-trip",
    label: "Pre-Trip",
    description: "Between booking and check-in",
    durationHint: "days to months",
  },
  {
    id: "during-trip",
    label: "During Trip",
    description: "Guest is at the property",
    durationHint: "1-14 nights",
  },
  {
    id: "post-trip",
    label: "Post-Trip",
    description: "After checkout — review, re-engagement",
    durationHint: "30 days",
  },
];

// ─────────────────────────────────────────
// STREAMS (swimlanes)
// ─────────────────────────────────────────

export const STREAMS: MessageStream[] = [
  {
    id: "onboarding",
    label: "Onboarding",
    description: "Welcome sequence introducing Wander, key features, and first-booking nudges",
    tool: "customer-io",
    owner: "Growth / Lifecycle",
    type: "automated",
    color: "#3b82f6",
    activePhases: ["signup", "onboarding"],
    trigger: "User Signed Up",
    exitCriteria: [
      "Sequence complete (day 14)",
      "User books (Order Completed)",
      "User unsubscribes",
    ],
    messages: [
      "Welcome email (day 0)",
      "How Wander works (day 1)",
      "Top destinations (day 3)",
      "Wishlist CTA (day 5)",
      "Social proof / reviews (day 7)",
      "First booking incentive (day 10)",
      "Final nudge (day 14)",
    ],
  },
  {
    id: "newsletter",
    label: "Newsletter & Topics",
    description: "General newsletter, destination guides, seasonal promotions, company updates",
    tool: "customer-io",
    owner: "Marketing (Brian's team)",
    type: "semi-automated",
    color: "#10b981",
    activePhases: ["active", "qualified", "pre-trip", "post-trip"],
    trigger: "Onboarding complete OR 14 days after signup",
    exitCriteria: ["User unsubscribes", "Hard bounce"],
    messages: [
      "Weekly/biweekly newsletter",
      "Seasonal destination guides",
      "New property announcements",
      "Company updates / brand stories",
    ],
  },
  {
    id: "property-recs",
    label: "Property Recommendations",
    description: "Personalized property recommendations based on search history, wishlists, and preferences",
    tool: "customer-io",
    owner: "Growth Engineering",
    type: "automated",
    color: "#8b5cf6",
    activePhases: ["active", "qualified", "post-trip"],
    trigger: "Product Viewed (3+ properties) OR wishlist activity",
    exitCriteria: [
      "User books",
      "No engagement for 60 days",
      "User unsubscribes from recs",
    ],
    messages: [
      "Similar to what you viewed",
      "New in your favorite destinations",
      "Wishlist price drops",
      "Back in stock / availability alerts",
    ],
  },
  {
    id: "sales-outreach",
    label: "Sales Outreach",
    description: "1:1 BDR outreach for high-value leads — personalized sequences via Outreach",
    tool: "outreach",
    owner: "Sales — Sorrell Becker (Demand)",
    type: "semi-automated",
    color: "#f59e0b",
    activePhases: ["qualified", "booking", "post-trip"],
    trigger: "High intent signals: Payment Info Entered, high-value search, repeat visitor, enterprise inquiry",
    exitCriteria: [
      "User books",
      "User declines / opts out",
      "No response after sequence complete",
      "BDR manually removes",
    ],
    messages: [
      "Personal intro from BDR",
      "Tailored property suggestions",
      "Availability check offer",
      "Follow-up with incentive",
      "Break-up email",
    ],
  },
  {
    id: "transactional",
    label: "Transactional / Booking",
    description: "System-generated notifications tied to booking lifecycle events",
    tool: "system",
    owner: "Engineering",
    type: "automated",
    color: "#f43f5e",
    activePhases: ["booking", "pre-trip", "during-trip", "post-trip"],
    trigger: "Order Completed",
    exitCriteria: ["Post-trip sequence complete", "Booking cancelled"],
    messages: [
      "Booking confirmation",
      "Payment receipt",
      "Pre-trip checklist (7 days before)",
      "Check-in instructions (1 day before)",
      "Welcome / arrival info",
      "Mid-stay check-in",
      "Checkout reminder",
      "Review request (post-trip day 1)",
      "Rebooking nudge (post-trip day 14)",
    ],
  },
  {
    id: "concierge",
    label: "Concierge",
    description: "Human-led 1:1 conversation for booked guests — trip planning, special requests, VIP treatment",
    tool: "human",
    owner: "Concierge — Nick Waze",
    type: "human",
    color: "#ec4899",
    activePhases: ["pre-trip", "during-trip", "post-trip"],
    trigger: "Booking confirmed (high-value or all bookings TBD)",
    exitCriteria: ["Post-trip follow-up complete", "Guest opts out"],
    messages: [
      "Welcome call / intro message",
      "Trip planning assistance",
      "Special requests handling",
      "Day-of arrival coordination",
      "During-stay support",
      "Post-trip thank you + feedback",
    ],
  },
];

// ─────────────────────────────────────────
// SUPPRESSION RULES
// ─────────────────────────────────────────

export const SUPPRESSION_RULES: SuppressionRule[] = [
  {
    id: "onboarding-suppresses-newsletter",
    dominant: "onboarding",
    suppressed: "newsletter",
    condition: "User is in onboarding sequence (days 0-14)",
    description: "No newsletters during onboarding — too much noise, dilutes welcome sequence",
    severity: "hard",
  },
  {
    id: "onboarding-suppresses-recs",
    dominant: "onboarding",
    suppressed: "property-recs",
    condition: "User is in onboarding sequence",
    description: "Onboarding already includes curated property content — separate recs would conflict",
    severity: "hard",
  },
  {
    id: "sales-suppresses-recs",
    dominant: "sales-outreach",
    suppressed: "property-recs",
    condition: "User is in active Outreach sequence",
    description: "BDR is sending personalized suggestions — automated recs would undercut the personal touch",
    severity: "soft",
  },
  {
    id: "sales-coordinates-newsletter",
    dominant: "sales-outreach",
    suppressed: "newsletter",
    condition: "User is in active Outreach sequence AND BDR has sent message in last 48h",
    description: "Avoid marketing email on same day as BDR outreach — feels overwhelming",
    severity: "soft",
  },
  {
    id: "transactional-suppresses-newsletter",
    dominant: "transactional",
    suppressed: "newsletter",
    condition: "Transactional email sent in last 24h",
    description: "Don't send newsletter same day as booking confirmation or check-in instructions",
    severity: "soft",
  },
  {
    id: "transactional-suppresses-recs",
    dominant: "transactional",
    suppressed: "property-recs",
    condition: "User has active booking (pre-trip or during-trip)",
    description: "Don't recommend other properties while guest has upcoming/active trip",
    severity: "hard",
  },
  {
    id: "concierge-coordinates-transactional",
    dominant: "concierge",
    suppressed: "transactional",
    condition: "Concierge has active conversation about same booking",
    description: "Concierge may handle check-in instructions personally — avoid duplicate system messages",
    severity: "soft",
  },
];

// ─────────────────────────────────────────
// CONFLICT ZONES
// ─────────────────────────────────────────

export const CONFLICT_ZONES: ConflictZone[] = [
  {
    id: "cz-onboarding-overlap",
    streams: ["onboarding", "newsletter", "property-recs"],
    phases: ["onboarding"],
    risk: "New user gets onboarding email + newsletter + recs in the same week",
    resolution: "Hard suppress newsletter and recs during onboarding",
    status: "needs-rules",
  },
  {
    id: "cz-sales-marketing",
    streams: ["sales-outreach", "newsletter", "property-recs"],
    phases: ["qualified"],
    risk: "BDR sends personal outreach, then user gets generic marketing email same day — breaks the illusion of 1:1 relationship",
    resolution: "Sync Outreach enrollment status back to CIO, suppress marketing for active sales leads",
    status: "needs-rules",
  },
  {
    id: "cz-booking-flood",
    streams: ["transactional", "concierge", "newsletter"],
    phases: ["booking", "pre-trip"],
    risk: "User books and gets: confirmation email, concierge intro, newsletter, and pre-trip checklist within 48 hours",
    resolution: "Suppress newsletter for 48h post-booking. Coordinate concierge intro timing with transactional.",
    status: "needs-rules",
  },
  {
    id: "cz-concierge-system",
    streams: ["concierge", "transactional"],
    phases: ["pre-trip", "during-trip"],
    risk: "Concierge personally sends check-in info, then system also sends automated check-in instructions",
    resolution: "Flag in CIO when concierge has handled check-in. Skip automated message if flag set.",
    status: "needs-rules",
  },
  {
    id: "cz-post-trip-everything",
    streams: ["transactional", "concierge", "newsletter", "property-recs"],
    phases: ["post-trip"],
    risk: "After checkout: review request + concierge follow-up + newsletter + recs all hit inbox",
    resolution: "Sequence post-trip: day 1 review request, day 3 concierge follow-up, day 7 resume recs, day 14 resume newsletter",
    status: "needs-rules",
  },
];

// ─────────────────────────────────────────
// TOOL METADATA
// ─────────────────────────────────────────

export const TOOLS: Record<ToolId, { label: string; color: string; description: string }> = {
  "customer-io": {
    label: "Customer.io",
    color: "#10b981",
    description: "Marketing automation — campaigns, segments, webhooks",
  },
  outreach: {
    label: "Outreach",
    color: "#f59e0b",
    description: "Sales engagement — BDR sequences, prospect management",
  },
  system: {
    label: "System (Backend)",
    color: "#f43f5e",
    description: "Automated transactional emails from booking system",
  },
  human: {
    label: "Human (Concierge)",
    color: "#ec4899",
    description: "Manual 1:1 communication by concierge team",
  },
};

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

export const PHASE_MAP = Object.fromEntries(PHASES.map((p) => [p.id, p])) as Record<PhaseId, Phase>;
export const STREAM_MAP = Object.fromEntries(STREAMS.map((s) => [s.id, s])) as Record<StreamId, MessageStream>;

export function getActiveStreamsForPhase(phaseId: PhaseId): MessageStream[] {
  return STREAMS.filter((s) => s.activePhases.includes(phaseId));
}

export function getConflictsForPhase(phaseId: PhaseId): ConflictZone[] {
  return CONFLICT_ZONES.filter((c) => c.phases.includes(phaseId));
}

export function getSuppressionsForStream(streamId: StreamId): SuppressionRule[] {
  return SUPPRESSION_RULES.filter((r) => r.dominant === streamId || r.suppressed === streamId);
}
