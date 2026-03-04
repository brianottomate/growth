/**
 * Wander System Map — Source of Truth
 *
 * This file defines the canonical nodes and edges for the Wander tech ecosystem.
 * Multiple views (lenses) are derived from this single data model.
 *
 * Lens options:
 *   full          — everything
 *   data-spine    — how data flows: surfaces → Segment → destinations
 *   guest-journey — guest-facing touchpoints + messaging
 *   sales-motion  — lead flow: CIO → Outreach → BDRs
 *   attribution   — how bookings get credited (Impact, Segment ownership)
 */

export type NodeType =
  | "surface" // user-facing apps
  | "hub" // central data/routing layer
  | "destination" // data destinations
  | "tool" // internal ops tools
  | "team" // people / teams
  | "external" // external platforms (ads, social)
  | "storage" // databases
  | "cms"; // content management

export type Lens =
  | "full"
  | "data-spine"
  | "guest-journey"
  | "sales-motion"
  | "attribution";

export type EdgeType = "events" | "webhook" | "api" | "sync" | "human" | "content";

export interface WanderNode {
  id: string;
  label: string;
  type: NodeType;
  lenses: Lens[];
  description?: string;
  owner?: string;
  url?: string;
  notes?: string;
}

export interface WanderEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: EdgeType;
  lenses: Lens[];
  notes?: string;
}

// ─────────────────────────────────────────
// NODES
// ─────────────────────────────────────────

export const NODES: WanderNode[] = [
  // ── User-facing surfaces ──
  {
    id: "wander-com",
    label: "wander.com",
    type: "surface",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    description: "Main marketplace — search, listings, checkout",
    owner: "Product / Engineering",
    url: "https://wander.com",
  },
  {
    id: "mobile-app",
    label: "iOS / Android App",
    type: "surface",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    description: "React Native guest app",
    owner: "Mobile Engineering",
  },
  {
    id: "app-wander-com",
    label: "app.wander.com",
    type: "surface",
    lenses: ["full", "data-spine"],
    description: "WanderOS host/operator dashboard",
    owner: "WanderOS Engineering",
    url: "https://app.wander.com",
  },
  {
    id: "sites-wander-com",
    label: "sites.wander.com",
    type: "surface",
    lenses: ["full"],
    description: "Programmatic property landing pages",
    owner: "Growth Engineering",
    url: "https://sites.wander.com",
  },
  {
    id: "growth-app",
    label: "growth.wander.com",
    type: "surface",
    lenses: ["full", "sales-motion"],
    description: "Growth platform — CIO sync, recs pipeline, Outreach integration",
    owner: "Growth Engineering",
    notes: "This app (wander/growth)",
  },

  // ── Data hubs ──
  {
    id: "segment",
    label: "Segment",
    type: "hub",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    description: "Central event router — collects from all surfaces, fans out to destinations",
    notes: "11 active sources. Order Completed fires 3x (web + mobile + backend) — dedup risk",
  },
  {
    id: "bigquery",
    label: "BigQuery",
    type: "storage",
    lenses: ["full", "data-spine", "sales-motion", "attribution"],
    description: "Wander data lake — production DB dumps, booking data, enrichment",
    owner: "Data / Analytics",
  },

  // ── Content ──
  {
    id: "dato-cms",
    label: "DatoCMS",
    type: "cms",
    lenses: ["full", "data-spine"],
    description: "Headless CMS — property content, travel guides, blog",
    owner: "Marketing / Content",
  },

  // ── Data destinations ──
  {
    id: "customer-io",
    label: "Customer.io",
    type: "destination",
    lenses: ["full", "data-spine", "guest-journey", "sales-motion"],
    description: "Lifecycle marketing — campaigns, newsletters, BDR lead sync",
    owner: "Growth Engineering",
    url: "https://fly.customer.io/workspaces/142511",
  },
  {
    id: "amplitude",
    label: "Amplitude",
    type: "destination",
    lenses: ["full", "data-spine"],
    description: "Product analytics + feature flags (via PostHog)",
    owner: "Product / Analytics",
  },
  {
    id: "impact",
    label: "Impact.com",
    type: "destination",
    lenses: ["full", "data-spine", "attribution"],
    description: "Affiliate / partnership attribution — commission payouts on Order Completed",
    notes: "⚠️ 3 active instances. Only backend should route Order Completed to Impact — web/mobile routing causes triple commission",
  },
  {
    id: "mixpanel",
    label: "Mixpanel",
    type: "destination",
    lenses: ["full"],
    description: "Legacy analytics — still configured on wander.com web source",
    notes: "Legacy — consider deprecating",
  },
  {
    id: "posthog",
    label: "PostHog",
    type: "destination",
    lenses: ["full", "data-spine"],
    description: "Feature flags + session replay",
    owner: "Engineering",
  },

  // ── Tools / integrations ──
  {
    id: "outreach",
    label: "Outreach",
    type: "tool",
    lenses: ["full", "sales-motion"],
    description: "Sales engagement platform — BDR sequences, prospect management",
    owner: "Sales / BDRs",
  },
  {
    id: "make-com",
    label: "Make.com",
    type: "tool",
    lenses: ["full", "sales-motion"],
    description: "Workflow automation — glue between systems",
    owner: "Growth / RevOps",
  },

  // ── Backend ──
  {
    id: "wander-backend",
    label: "Marketplace Backend",
    type: "storage",
    lenses: ["full", "data-spine", "attribution"],
    description: "Core API + Wander DB — booking logic, property data, user accounts",
    notes: "Canonical emitter for Order Completed to Impact.com",
  },

  // ── Teams ──
  {
    id: "team-sales",
    label: "Sales (BDRs)",
    type: "team",
    lenses: ["full", "sales-motion"],
    description: "Demand + Supply BDRs — work leads from Outreach",
    owner: "Sales",
  },
  {
    id: "team-marketing",
    label: "Marketing",
    type: "team",
    lenses: ["full", "guest-journey"],
    description: "Brand, content, email campaigns",
    owner: "Marketing",
  },
  {
    id: "team-ads",
    label: "Paid Ads",
    type: "team",
    lenses: ["full", "attribution"],
    description: "Manages Google, Meta, TikTok, LinkedIn campaigns",
    owner: "Growth / Marketing",
  },

  // ── External ad platforms ──
  {
    id: "google-ads",
    label: "Google Ads",
    type: "external",
    lenses: ["full", "attribution"],
    description: "Paid search + display",
  },
  {
    id: "meta-ads",
    label: "Meta Ads",
    type: "external",
    lenses: ["full", "attribution"],
    description: "Facebook + Instagram ads — FB lead gen campaigns",
  },
  {
    id: "tiktok-ads",
    label: "TikTok Ads",
    type: "external",
    lenses: ["full", "attribution"],
  },
  {
    id: "attentive",
    label: "Attentive",
    type: "tool",
    lenses: ["full", "guest-journey"],
    description: "SMS marketing",
  },
];

// ─────────────────────────────────────────
// EDGES
// ─────────────────────────────────────────

export const EDGES: WanderEdge[] = [
  // Surfaces → Segment
  {
    id: "wander-com-segment",
    source: "wander-com",
    target: "segment",
    label: "events",
    type: "events",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
  },
  {
    id: "mobile-app-segment",
    source: "mobile-app",
    target: "segment",
    label: "events",
    type: "events",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
  },
  {
    id: "app-wander-com-segment",
    source: "app-wander-com",
    target: "segment",
    label: "events",
    type: "events",
    lenses: ["full", "data-spine"],
  },
  {
    id: "backend-segment",
    source: "wander-backend",
    target: "segment",
    label: "server events",
    type: "events",
    lenses: ["full", "data-spine", "attribution"],
    notes: "Backend is canonical source for Order Completed",
  },

  // Segment → destinations
  {
    id: "segment-cio",
    source: "segment",
    target: "customer-io",
    label: "events",
    type: "events",
    lenses: ["full", "data-spine", "guest-journey", "sales-motion"],
  },
  {
    id: "segment-amplitude",
    source: "segment",
    target: "amplitude",
    label: "events",
    type: "events",
    lenses: ["full", "data-spine"],
  },
  {
    id: "segment-bigquery",
    source: "segment",
    target: "bigquery",
    label: "events",
    type: "events",
    lenses: ["full", "data-spine", "attribution"],
  },
  {
    id: "segment-impact",
    source: "segment",
    target: "impact",
    label: "Order Completed",
    type: "events",
    lenses: ["full", "data-spine", "attribution"],
    notes: "⚠️ Should only fire from backend source",
  },
  {
    id: "segment-mixpanel",
    source: "segment",
    target: "mixpanel",
    label: "events (legacy)",
    type: "events",
    lenses: ["full"],
  },
  {
    id: "segment-posthog",
    source: "segment",
    target: "posthog",
    label: "events",
    type: "events",
    lenses: ["full", "data-spine"],
  },

  // CMS → Surfaces
  {
    id: "dato-wander-com",
    source: "dato-cms",
    target: "wander-com",
    label: "property content",
    type: "content",
    lenses: ["full", "data-spine"],
  },
  {
    id: "dato-sites",
    source: "dato-cms",
    target: "sites-wander-com",
    label: "content",
    type: "content",
    lenses: ["full"],
  },

  // BigQuery → Growth / CIO
  {
    id: "bigquery-growth",
    source: "bigquery",
    target: "growth-app",
    label: "lead enrichment",
    type: "api",
    lenses: ["full", "data-spine", "sales-motion"],
  },
  {
    id: "growth-cio",
    source: "growth-app",
    target: "customer-io",
    label: "recs + BDR sync",
    type: "api",
    lenses: ["full", "sales-motion", "guest-journey"],
  },

  // CIO → Outreach
  {
    id: "cio-outreach",
    source: "customer-io",
    target: "outreach",
    label: "leads (webhook)",
    type: "webhook",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "outreach-cio",
    source: "outreach",
    target: "customer-io",
    label: "BDR assignment",
    type: "webhook",
    lenses: ["full", "sales-motion"],
  },

  // Outreach → Sales team
  {
    id: "outreach-sales",
    source: "outreach",
    target: "team-sales",
    label: "sequences",
    type: "human",
    lenses: ["full", "sales-motion"],
  },

  // Ads → surfaces (traffic)
  {
    id: "google-wander",
    source: "google-ads",
    target: "wander-com",
    label: "traffic",
    type: "human",
    lenses: ["full", "attribution"],
  },
  {
    id: "meta-wander",
    source: "meta-ads",
    target: "wander-com",
    label: "traffic",
    type: "human",
    lenses: ["full", "attribution"],
  },
  {
    id: "tiktok-wander",
    source: "tiktok-ads",
    target: "wander-com",
    label: "traffic",
    type: "human",
    lenses: ["full", "attribution"],
  },
  {
    id: "ads-team-google",
    source: "team-ads",
    target: "google-ads",
    type: "human",
    lenses: ["full", "attribution"],
  },
  {
    id: "ads-team-meta",
    source: "team-ads",
    target: "meta-ads",
    type: "human",
    lenses: ["full", "attribution"],
  },

  // CIO → guests (campaigns)
  {
    id: "cio-guest",
    source: "customer-io",
    target: "team-marketing",
    label: "campaigns",
    type: "human",
    lenses: ["full", "guest-journey"],
  },

  // Marketing → CIO
  {
    id: "marketing-cio",
    source: "team-marketing",
    target: "customer-io",
    label: "newsletters",
    type: "human",
    lenses: ["full", "guest-journey"],
  },

  // Make.com
  {
    id: "make-cio",
    source: "make-com",
    target: "customer-io",
    label: "automation",
    type: "webhook",
    lenses: ["full", "sales-motion"],
  },

  // PostHog → surfaces (feature flags)
  {
    id: "posthog-wander",
    source: "posthog",
    target: "wander-com",
    label: "feature flags",
    type: "api",
    lenses: ["full"],
  },
  {
    id: "posthog-mobile",
    source: "posthog",
    target: "mobile-app",
    label: "feature flags",
    type: "api",
    lenses: ["full"],
  },

  // Backend → wander.com (serves the app)
  {
    id: "backend-wander-com",
    source: "wander-backend",
    target: "wander-com",
    label: "API",
    type: "api",
    lenses: ["full", "data-spine"],
  },
  {
    id: "backend-mobile",
    source: "wander-backend",
    target: "mobile-app",
    label: "API",
    type: "api",
    lenses: ["full", "data-spine"],
  },
];

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

export function getNodesForLens(lens: Lens): WanderNode[] {
  return NODES.filter((n) => n.lenses.includes(lens));
}

export function getEdgesForLens(lens: Lens): WanderEdge[] {
  const nodeIds = new Set(getNodesForLens(lens).map((n) => n.id));
  return EDGES.filter(
    (e) => e.lenses.includes(lens) && nodeIds.has(e.source) && nodeIds.has(e.target),
  );
}

export const LENS_LABELS: Record<Lens, string> = {
  full: "Full System",
  "data-spine": "Data Spine",
  "guest-journey": "Guest Journey",
  "sales-motion": "Sales Motion",
  attribution: "Attribution",
};

export const LENS_DESCRIPTIONS: Record<Lens, string> = {
  full: "Every node and connection in the Wander ecosystem",
  "data-spine": "How events flow from surfaces through Segment to destinations",
  "guest-journey": "Guest-facing touchpoints from discovery through post-trip",
  "sales-motion": "How leads move from CIO through Outreach to BDRs",
  attribution: "How bookings get credited — Impact.com, UTM, ad platforms",
};

export const NODE_COLORS: Record<NodeType, string> = {
  surface: "#3b82f6", // blue
  hub: "#f59e0b", // amber
  destination: "#10b981", // emerald
  tool: "#8b5cf6", // violet
  team: "#64748b", // slate
  external: "#f43f5e", // rose
  storage: "#f97316", // orange
  cms: "#14b8a6", // teal
};
