/**
 * tracking-audit — event registry mirrored from tracking/packages/core
 * for matrix visualization at /flow/tracking-audit.
 *
 * Source: ../../tracking/packages/core/src/events-{marketing,marketplace,os}.ts
 * Keep in sync manually for now.
 *
 * Each event declares which surfaces it is *expected* to fire from.
 * The audit's job is to compare expectation against reality (callsite
 * greps + Amplitude live volume).
 *
 * TODO — migrate to the published tracking plan yml:
 *   `@wandercom/tracking-core/plan` → `tracking/packages/core/plans/wander-tracking-plan.v0.yml`
 *
 * The yml is already exported as a package subpath (since tracking-core
 * v0.23.0) and has the right shape: top-level `surfaces:` and `workspaces:`
 * match this file's columns/badges, and per-event `status` / `reason` fields
 * cover what `notes` does here.
 *
 * Two things to resolve before flipping:
 *   1. Coverage gap — yml is the curated Segment/partner spec (~90 events);
 *      events-*.ts has the full typed-track inventory (~175). Decide whether
 *      the audit page wants the curated set or the full inventory.
 *   2. Per-event surfaces — the top-level `surfaces:` block exists in the
 *      yml, but verify each event entry actually carries a `surfaces:` array.
 *      If not, surface attribution still needs a separate source (callsite
 *      grep, Amplitude live volume).
 */

export type Surface =
  | "wander.com"
  | "app.wander.com"
  | "mobile"
  | "backend";

export type Workspace = "marketplace" | "os" | "marketing";

export type EventCategory =
  // marketplace
  | "Auth"
  | "Search & discovery"
  | "Wishlist"
  | "Booking funnel"
  | "Post-booking"
  | "Property page"
  | "Payment"
  | "AI"
  | "Growth / content"
  | "Mobile-only"
  | "Comms"
  // os
  | "OS acquisition"
  | "Supply acquisition"
  | "Onboarding & PMS"
  | "Listings"
  | "Domains & branding"
  | "Billing & subscription"
  | "Team & settings"
  | "Campaigns"
  | "Navigation"
  | "Host activation"
  | "Influencer"
  | "Org management"
  // marketing
  | "Marketing acquisition";

export type TrackedEvent = {
  name: string;
  workspace: Workspace;
  category: EventCategory;
  surfaces: Surface[];
  notes?: string;
};

export const SURFACES: Surface[] = [
  "wander.com",
  "mobile",
  "app.wander.com",
  "backend",
];

// ---------------------------------------------------------------------------
// Marketplace — wander.com (web) + mobile + backend
// ---------------------------------------------------------------------------
const MARKETPLACE_EVENTS: TrackedEvent[] = [
  // Auth
  { name: "User Signed Up", workspace: "marketplace", category: "Auth", surfaces: ["wander.com", "mobile"] },
  { name: "User Signed In", workspace: "marketplace", category: "Auth", surfaces: ["wander.com", "mobile"] },
  { name: "User Signed Out", workspace: "marketplace", category: "Auth", surfaces: ["wander.com", "mobile"] },

  // Search & discovery
  { name: "Search Started", workspace: "marketplace", category: "Search & discovery", surfaces: ["wander.com", "mobile"] },
  { name: "Search Clicked Once", workspace: "marketplace", category: "Search & discovery", surfaces: ["wander.com", "mobile"] },
  { name: "Search Results Viewed", workspace: "marketplace", category: "Search & discovery", surfaces: ["wander.com", "mobile"] },
  { name: "Products Searched", workspace: "marketplace", category: "Search & discovery", surfaces: ["wander.com", "mobile"] },
  { name: "Product List Viewed", workspace: "marketplace", category: "Search & discovery", surfaces: ["wander.com", "mobile"] },
  { name: "Product Viewed", workspace: "marketplace", category: "Search & discovery", surfaces: ["wander.com", "mobile"] },

  // Wishlist
  { name: "Product Added To Wishlist", workspace: "marketplace", category: "Wishlist", surfaces: ["wander.com", "mobile"] },
  { name: "Product Removed From Wishlist", workspace: "marketplace", category: "Wishlist", surfaces: ["wander.com", "mobile"] },

  // Booking funnel
  { name: "Product Added", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile"] },
  { name: "Checkout Previewed", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile"] },
  { name: "Checkout Started", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile", "backend"], notes: "Server is authoritative for Impact.com" },
  { name: "Checkout Step Viewed", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile"] },
  { name: "Checkout Step Completed", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile"] },
  { name: "Payment Info Entered", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile"] },
  { name: "Coupon Entered", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile"] },
  { name: "Order Completed", workspace: "marketplace", category: "Booking funnel", surfaces: ["wander.com", "mobile", "backend"], notes: "Client fires for Amplitude/CIO; server-only to Impact.com" },

  // Post-booking
  { name: "Order Cancelled", workspace: "marketplace", category: "Post-booking", surfaces: ["wander.com", "mobile", "backend"], notes: "Client fires from CancelTripModal; server authoritative" },
  { name: "Order Refunded", workspace: "marketplace", category: "Post-booking", surfaces: ["backend"] },
  { name: "Trip Extended", workspace: "marketplace", category: "Post-booking", surfaces: ["backend"], notes: "Client reserved for future self-serve reschedule UI" },
  { name: "Cancellation Reason Selected", workspace: "marketplace", category: "Post-booking", surfaces: ["wander.com", "mobile"] },
  { name: "Cancellation Abandoned", workspace: "marketplace", category: "Post-booking", surfaces: ["wander.com", "mobile"] },

  // Property page
  { name: "Property Dates Selected", workspace: "marketplace", category: "Property page", surfaces: ["wander.com", "mobile"] },
  { name: "Property Dates Updated", workspace: "marketplace", category: "Property page", surfaces: ["wander.com", "mobile"] },
  { name: "Property Reserve Clicked", workspace: "marketplace", category: "Property page", surfaces: ["wander.com", "mobile"] },
  { name: "Property Guests Updated", workspace: "marketplace", category: "Property page", surfaces: ["wander.com", "mobile"] },

  // Payment
  { name: "Payment Split Selected", workspace: "marketplace", category: "Payment", surfaces: ["wander.com", "mobile"] },
  { name: "Payment Submit Clicked", workspace: "marketplace", category: "Payment", surfaces: ["wander.com", "mobile"] },

  // AI
  { name: "AI Search Started", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },
  { name: "AI Filter Search Started", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },
  { name: "AI Search Follow Up Sent", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },
  { name: "AI Search Typed", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },
  { name: "AI Autocomplete Suggestion Clicked", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },
  { name: "AI Trip Planner Property Card Clicked", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },
  { name: "AI Trip Planner Chat List Toggled", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },
  { name: "AI Trip Planner See More Search Results Clicked", workspace: "marketplace", category: "AI", surfaces: ["wander.com", "mobile"] },

  // Growth / content
  { name: "Blog Post Viewed", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com"] },
  { name: "Property Group Viewed", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com", "mobile"] },
  { name: "Wander Guarantee Viewed", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com", "mobile"] },
  { name: "Book Live Clicked", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com", "mobile"] },
  { name: "Chat Opened", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com", "mobile"] },
  { name: "App Attribution Flow Started", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com"] },
  { name: "App Attribution Flow Completed", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com"] },
  { name: "Theme Changed", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com", "mobile"] },
  { name: "Share Button Clicked", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com", "mobile"] },
  { name: "Referral Code Copied", workspace: "marketplace", category: "Growth / content", surfaces: ["wander.com", "mobile"] },
  { name: "Referral Rewarded", workspace: "marketplace", category: "Growth / content", surfaces: ["backend"] },
  { name: "Influencer Booking 48h Reminder", workspace: "marketplace", category: "Growth / content", surfaces: ["backend"] },

  // Mobile-only
  { name: "Product Shared", workspace: "marketplace", category: "Mobile-only", surfaces: ["mobile"] },
  { name: "Product Reviewed", workspace: "marketplace", category: "Mobile-only", surfaces: ["mobile"] },
  { name: "Review Dismissed", workspace: "marketplace", category: "Mobile-only", surfaces: ["mobile"] },
  { name: "Deep Link Opened", workspace: "marketplace", category: "Mobile-only", surfaces: ["mobile"] },
  { name: "Push Notification Tapped", workspace: "marketplace", category: "Mobile-only", surfaces: ["mobile"] },
  { name: "Application Crashed", workspace: "marketplace", category: "Mobile-only", surfaces: ["mobile"] },

  // Comms (server)
  { name: "Email Opened", workspace: "marketplace", category: "Comms", surfaces: ["backend"] },
  { name: "Email Link Clicked", workspace: "marketplace", category: "Comms", surfaces: ["backend"] },
];

// ---------------------------------------------------------------------------
// WanderOS — wander.com (acquisition) + app.wander.com (product) + backend
// ---------------------------------------------------------------------------
const OS_EVENTS: TrackedEvent[] = [
  // Supply acquisition (wander.com/listed)
  { name: "List Apply Clicked", workspace: "os", category: "Supply acquisition", surfaces: ["wander.com"] },
  { name: "List Apply Submitted", workspace: "os", category: "Supply acquisition", surfaces: ["wander.com"] },
  { name: "Listing Application Step Completed", workspace: "os", category: "Supply acquisition", surfaces: ["wander.com"] },

  // OS acquisition (wander.com/os, /wander-sites)
  { name: "WanderOS Inbound Clicked", workspace: "os", category: "OS acquisition", surfaces: ["wander.com"] },
  { name: "WanderOS Inbound Submitted", workspace: "os", category: "OS acquisition", surfaces: ["wander.com"] },
  { name: "WanderOS Demo Booked", workspace: "os", category: "OS acquisition", surfaces: ["wander.com"] },
  { name: "WanderOS PMS Request Clicked", workspace: "os", category: "OS acquisition", surfaces: ["wander.com"] },
  { name: "WanderOS PMS Request Submitted", workspace: "os", category: "OS acquisition", surfaces: ["wander.com"] },
  { name: "WanderOS Audit Clicked", workspace: "os", category: "OS acquisition", surfaces: ["wander.com"] },

  // OS product — app.wander.com client
  { name: "Logged In", workspace: "os", category: "Auth", surfaces: ["app.wander.com"] },
  { name: "Logged Out", workspace: "os", category: "Auth", surfaces: ["app.wander.com"] },
  { name: "Auth Viewed", workspace: "os", category: "Navigation", surfaces: ["app.wander.com"] },
  { name: "OTP Requested", workspace: "os", category: "Navigation", surfaces: ["app.wander.com"] },

  { name: "Intent Selected", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "Auto List Decided", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "PMS Selected", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "PMS Credentials Submitted", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "PMS Connection Success", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "PMS Connection Failure", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "PMS Integration Changed", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "PMS Sync Complete", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "Identity Verification Started", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "Identity Verification Failed", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "Onboarding Completed", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "Organization Created", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },
  { name: "Organization Creation Error", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"], notes: "Typed but never fired — see events-os.ts cleanup TODO" },
  { name: "Organization Name Updated", workspace: "os", category: "Onboarding & PMS", surfaces: ["app.wander.com"] },

  // Listings
  { name: "Listing Selected", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Listing Overview Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Listing Settings Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Listing Viewed on Site", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Listing Relisted", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Listing Delisted", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Listing Removed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Submit For Review", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Action Required Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Issue Clicked", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Overview Saved", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Title And Description Tab Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Amenities Tab Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Amenity Added", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Amenity Removed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Photos Tab Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Photo Uploaded", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Photo Deleted", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Photo Reordered", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Location Tab Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Permit Number Updated", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Reservations Tab Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Reservations Filter Changed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Reservation Opened", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Reviews Tab Viewed", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },
  { name: "Review Replied", workspace: "os", category: "Listings", surfaces: ["app.wander.com"] },

  // Domains & branding
  { name: "Domain Settings Opened", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Domain Connection Started", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Domain Connected", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com", "backend"], notes: "Fires from both — dedup needed" },
  { name: "Domain Verified", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Domain Connection Failed", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Domain Removed", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Brand Settings Opened", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Brand Settings Saved", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Brand Title Updated", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Brand Colors Updated", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Button Colors Updated", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Color Palette Updated", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Color Preset Selected", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Logo Uploaded", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Favicon Uploaded", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Font Preset Updated", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Fonts Updated", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Social Links Opened", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Social Links Saved", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },
  { name: "Social Link Updated", workspace: "os", category: "Domains & branding", surfaces: ["app.wander.com"] },

  // Billing
  { name: "Billing Details Viewed", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Subscription Activation Started", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Subscription Activation Failed", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Subscription Modified", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Subscription Cancelled", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Invoice Viewed", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Invoices Page Visited", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Payment Viewed", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Payments Page Visited", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Payout Viewed", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },
  { name: "Payouts Page Visited", workspace: "os", category: "Billing & subscription", surfaces: ["app.wander.com"] },

  // Team & settings
  { name: "Team Member Added", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Team Member Removed", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Contact Info Opened", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Contact Info Saved", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Support Email Updated", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Support Phone Updated", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Property Manager Address Opened", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Property Manager Address Saved", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Property Manager Address Updated", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Preferences Viewed", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Preferences Updated", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Account Settings Viewed", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Profile Viewed", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Profile Updated", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },
  { name: "Profile Submitted", workspace: "os", category: "Team & settings", surfaces: ["app.wander.com"] },

  // Campaigns
  { name: "Campaign Enabled", workspace: "os", category: "Campaigns", surfaces: ["app.wander.com"] },
  { name: "Campaign Disabled", workspace: "os", category: "Campaigns", surfaces: ["app.wander.com"] },

  // Navigation
  { name: "Reservations Visited", workspace: "os", category: "Navigation", surfaces: ["app.wander.com"] },
  { name: "Timeline Visited", workspace: "os", category: "Navigation", surfaces: ["app.wander.com"] },

  // OS server
  { name: "Signed Up", workspace: "os", category: "Host activation", surfaces: ["backend"], notes: "Cleanup TODO: move to client (events-os.ts)" },
  { name: "User Set Organizations", workspace: "os", category: "Host activation", surfaces: ["backend"], notes: "Cleanup TODO: reframe or drop" },
  { name: "Site Published", workspace: "os", category: "Host activation", surfaces: ["backend"] },
  { name: "New Influencer Booking", workspace: "os", category: "Influencer", surfaces: ["backend"] },
  { name: "Influencer Booking Approved", workspace: "os", category: "Influencer", surfaces: ["backend"] },
  { name: "Influencer Booking Auto Approved", workspace: "os", category: "Influencer", surfaces: ["backend"] },
  { name: "Influencer Booking Cancelled", workspace: "os", category: "Influencer", surfaces: ["backend"] },
  { name: "Invite Renewed", workspace: "os", category: "Org management", surfaces: ["backend"] },
  { name: "Org Owner Invited", workspace: "os", category: "Org management", surfaces: ["backend"] },
];

// ---------------------------------------------------------------------------
// Marketing — wander.com only
// ---------------------------------------------------------------------------
const MARKETING_EVENTS: TrackedEvent[] = [
  { name: "Ambassador Apply Clicked", workspace: "marketing", category: "Marketing acquisition", surfaces: ["wander.com"] },
  { name: "Ambassador Agency Apply Clicked", workspace: "marketing", category: "Marketing acquisition", surfaces: ["wander.com"] },
  { name: "Travel Agent Signup Clicked", workspace: "marketing", category: "Marketing acquisition", surfaces: ["wander.com"] },
  { name: "Events Contact Clicked", workspace: "marketing", category: "Marketing acquisition", surfaces: ["wander.com"] },
  { name: "Event Link Clicked", workspace: "marketing", category: "Marketing acquisition", surfaces: ["wander.com"] },
];

// Order matters — drives the row order in /flow/tracking-audit.
// Flow: marketplace client (web+mobile) → marketing (web) →
// supply/OS acquisition (web → bridge) → OS product (app.wander.com) →
// OS server (backend).
export const ALL_EVENTS: TrackedEvent[] = [
  ...MARKETPLACE_EVENTS,
  ...MARKETING_EVENTS,
  ...OS_EVENTS,
];

export const WORKSPACES: Workspace[] = ["marketplace", "os", "marketing"];
