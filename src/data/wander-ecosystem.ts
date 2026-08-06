/**
 * Wander Ecosystem — Comprehensive System Map
 *
 * Based on the full whiteboard + existing wander-system.ts data.
 * Every node belongs to a visual group. Edges connect across groups.
 *
 * This is the single source of truth for the Wander command center.
 */

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type GroupId =
  | "sales"
  | "wander-com"
  | "app-wander-com"
  | "os-wander-com"
  | "marketing"
  | "ads"
  | "sites"
  | "social-media"
  | "data-layer"
  | "analytics"
  | "rouge-services"
  | "growth-platform";

export type NodeCategory =
  | "surface" // user-facing apps/pages
  | "hub" // central data/routing layer
  | "destination" // data destinations
  | "tool" // internal ops tools
  | "team" // people / teams
  | "external" // external platforms
  | "storage" // databases
  | "cms" // content management
  | "service" // backend services
  | "page" // specific pages/routes
  | "integration"; // 3rd-party integrations

export type EdgeKind =
  | "events"
  | "webhook"
  | "api"
  | "sync"
  | "human"
  | "content"
  | "data"
  | "traffic";

export type Lens =
  | "full"
  | "data-spine"
  | "guest-journey"
  | "sales-motion"
  | "attribution"
  | "host-journey"
  | "content-flow";

export interface EcoGroup {
  id: GroupId;
  label: string;
  description: string;
  color: string; // brand color for the group
}

export interface EcoNode {
  id: string;
  label: string;
  group: GroupId;
  category: NodeCategory;
  lenses: Lens[];
  description?: string;
  owner?: string;
  url?: string;
  notes?: string;
  status?: "active" | "legacy" | "planned" | "issue";
}

export interface EcoEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: EdgeKind;
  lenses: Lens[];
  notes?: string;
  animated?: boolean;
}

// ─────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────

export const GROUPS: EcoGroup[] = [
  {
    id: "sales",
    label: "Sales",
    description: "Demand & Supply BDR teams, engagement tools",
    color: "#f59e0b",
  },
  {
    id: "wander-com",
    label: "wander.com",
    description: "Guest marketplace — search, listings, checkout",
    color: "#3b82f6",
  },
  {
    id: "app-wander-com",
    label: "app.wander.com",
    description: "WanderOS host dashboard — sites, deployments, builder",
    color: "#8b5cf6",
  },
  {
    id: "os-wander-com",
    label: "os.wander.com",
    description: "Wander OS backend — PMS, DB, marketplace backend",
    color: "#6366f1",
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Lifecycle marketing & CRM",
    color: "#10b981",
  },
  {
    id: "ads",
    label: "Ads",
    description: "Paid acquisition channels",
    color: "#f43f5e",
  },
  {
    id: "sites",
    label: "Sites.wander.com",
    description: "Programmatic property landing pages",
    color: "#14b8a6",
  },
  {
    id: "social-media",
    label: "Social Media",
    description: "Organic social channels & creator tools",
    color: "#ec4899",
  },
  {
    id: "data-layer",
    label: "Data Layer",
    description: "Segment, DatoCMS, BigQuery — central routing & storage",
    color: "#f97316",
  },
  {
    id: "analytics",
    label: "Analytics & Flags",
    description: "Product analytics, feature flags, monitoring",
    color: "#06b6d4",
  },
  {
    id: "rouge-services",
    label: "Rouge Services",
    description: "Standalone services not yet integrated into main platform",
    color: "#64748b",
  },
  {
    id: "growth-platform",
    label: "Growth Platform",
    description: "growth.wander.com — CIO sync, recs, Outreach integration",
    color: "#84cc16",
  },
];

export const GROUP_MAP = Object.fromEntries(
  GROUPS.map((g) => [g.id, g]),
) as Record<GroupId, EcoGroup>;

// ─────────────────────────────────────────
// NODES
// ─────────────────────────────────────────

export const NODES: EcoNode[] = [
  // ── Sales ──
  {
    id: "outreach",
    label: "Outreach",
    group: "sales",
    category: "tool",
    lenses: ["full", "sales-motion"],
    description: "Sales engagement — sequences, prospect management",
    owner: "Sales / BDRs",
  },
  {
    id: "team-demand",
    label: "Demand BDRs",
    group: "sales",
    category: "team",
    lenses: ["full", "sales-motion"],
    description: "Guest-side sales reps — work inbound leads",
    owner: "Sales",
  },
  {
    id: "team-supply",
    label: "Supply BDRs",
    group: "sales",
    category: "team",
    lenses: ["full", "sales-motion"],
    description: "Host-side sales reps — property acquisition",
    owner: "Sales",
  },
  {
    id: "hubspot",
    label: "HubSpot",
    group: "sales",
    category: "tool",
    lenses: ["full", "sales-motion"],
    description: "CRM for supply-side deals",
    owner: "Sales",
    status: "active",
  },
  {
    id: "gong",
    label: "Gong",
    group: "sales",
    category: "tool",
    lenses: ["full", "sales-motion"],
    description: "Call recording & conversation intelligence",
    owner: "Sales",
  },
  {
    id: "clay",
    label: "Clay",
    group: "sales",
    category: "tool",
    lenses: ["full", "sales-motion"],
    description: "Lead enrichment & prospecting automation",
    owner: "Sales / Growth",
  },
  {
    id: "cold-calling",
    label: "Cold Calling / VOIP",
    group: "sales",
    category: "tool",
    lenses: ["full", "sales-motion"],
    description: "Outbound calling infrastructure",
    owner: "Sales",
  },

  // ── wander.com ──
  {
    id: "wander-com",
    label: "wander.com",
    group: "wander-com",
    category: "surface",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    description: "Main marketplace — search, listings, checkout",
    owner: "Product / Engineering",
    url: "https://wander.com",
  },
  {
    id: "marketplace-frontend",
    label: "Marketplace Frontend",
    group: "wander-com",
    category: "service",
    lenses: ["full", "data-spine", "guest-journey"],
    description: "Next.js frontend — property pages, search, checkout flow",
    owner: "Engineering",
  },
  {
    id: "sites-frontend",
    label: "/sites Frontend",
    group: "wander-com",
    category: "page",
    lenses: ["full", "host-journey"],
    description: "Wander Sites marketing pages within wander.com",
    owner: "Growth Engineering",
  },
  {
    id: "mobile-app",
    label: "iOS / Android App",
    group: "wander-com",
    category: "surface",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    description: "React Native guest app",
    owner: "Mobile Engineering",
  },
  {
    id: "page-california",
    label: "/california",
    group: "wander-com",
    category: "page",
    lenses: ["full", "content-flow", "guest-journey"],
    description: "Destination landing page",
  },
  {
    id: "page-evergreen",
    label: "/evergreen",
    group: "wander-com",
    category: "page",
    lenses: ["full", "content-flow", "guest-journey"],
    description: "Evergreen content pages",
  },
  {
    id: "page-events",
    label: "/events",
    group: "wander-com",
    category: "page",
    lenses: ["full", "content-flow", "guest-journey"],
    description: "Events pages",
    notes: "Status unclear — may be planned",
    status: "planned",
  },
  {
    id: "page-blog",
    label: "/blog",
    group: "wander-com",
    category: "page",
    lenses: ["full", "content-flow", "guest-journey"],
    description: "Blog / travel guides",
  },

  // ── app.wander.com ──
  {
    id: "app-wander-com",
    label: "app.wander.com",
    group: "app-wander-com",
    category: "surface",
    lenses: ["full", "data-spine", "host-journey"],
    description: "WanderOS host/operator dashboard",
    owner: "WanderOS Engineering",
    url: "https://app.wander.com",
  },
  {
    id: "site-deployments",
    label: "Site Deployments",
    group: "app-wander-com",
    category: "service",
    lenses: ["full", "host-journey"],
    description: "Deployment pipeline for Wander Sites",
    owner: "WanderOS Engineering",
  },
  {
    id: "site-builder",
    label: "Site Builder",
    group: "app-wander-com",
    category: "service",
    lenses: ["full", "host-journey"],
    description: "Visual site builder for hosts",
    owner: "WanderOS Engineering",
  },
  {
    id: "new-wander-os",
    label: "New WanderOS",
    group: "app-wander-com",
    category: "service",
    lenses: ["full", "host-journey"],
    description: "Next-gen WanderOS platform (in progress)",
    owner: "WanderOS Engineering",
    status: "planned",
    notes: "Major rebuild — unclear scope",
  },

  // ── os.wander.com (Backend) ──
  {
    id: "wander-backend",
    label: "Marketplace Backend",
    group: "os-wander-com",
    category: "service",
    lenses: ["full", "data-spine", "attribution"],
    description:
      "Core API + Wander DB — booking logic, property data, user accounts",
    owner: "Engineering",
    notes: "Canonical emitter for Order Completed to Impact.com",
  },
  {
    id: "wander-db",
    label: "Wander DB",
    group: "os-wander-com",
    category: "storage",
    lenses: ["full", "data-spine"],
    description: "Primary PostgreSQL — users, bookings, properties, units",
    owner: "Engineering",
  },
  {
    id: "pms-system",
    label: "PMS System",
    group: "os-wander-com",
    category: "integration",
    lenses: ["full", "host-journey"],
    description:
      "Property Management System integrations (Guesty, Hostaway, etc.)",
    owner: "Engineering",
  },

  // ── Marketing ──
  {
    id: "customer-io",
    label: "Customer.io",
    group: "marketing",
    category: "destination",
    lenses: ["full", "data-spine", "guest-journey", "sales-motion"],
    description: "Lifecycle marketing — campaigns, newsletters, BDR lead sync",
    owner: "Growth Engineering",
    url: "https://fly.customer.io/workspaces/142511",
  },
  {
    id: "attentive",
    label: "Attentive",
    group: "marketing",
    category: "tool",
    lenses: ["full", "guest-journey"],
    description: "SMS marketing platform",
    owner: "Marketing",
  },
  {
    id: "team-marketing",
    label: "Marketing Team",
    group: "marketing",
    category: "team",
    lenses: ["full", "guest-journey"],
    description: "Brand, content, email campaigns",
    owner: "Marketing",
  },

  // ── Ads ──
  {
    id: "google-ads",
    label: "Google Ads",
    group: "ads",
    category: "external",
    lenses: ["full", "attribution"],
    description: "Paid search + display + YouTube",
  },
  {
    id: "meta-ads",
    label: "Meta Ads",
    group: "ads",
    category: "external",
    lenses: ["full", "attribution"],
    description: "Facebook + Instagram ads, FB lead gen",
  },
  {
    id: "tiktok-ads",
    label: "TikTok Ads",
    group: "ads",
    category: "external",
    lenses: ["full", "attribution"],
    description: "TikTok paid ads",
  },
  {
    id: "linkedin-ads",
    label: "LinkedIn Ads",
    group: "ads",
    category: "external",
    lenses: ["full", "attribution"],
    description: "LinkedIn B2B campaigns (supply-side)",
  },
  {
    id: "team-ads",
    label: "Paid Ads Team",
    group: "ads",
    category: "team",
    lenses: ["full", "attribution"],
    description: "Manages all paid acquisition channels",
    owner: "Growth / Marketing",
  },
  {
    id: "other-ad-platforms",
    label: "Other Ad Platforms",
    group: "ads",
    category: "external",
    lenses: ["full", "attribution"],
    description: "Bing, Pinterest, affiliate networks, etc.",
    notes: "Office ad platform, attribution results",
  },

  // ── Sites.wander.com ──
  {
    id: "sites-wander-com",
    label: "sites.wander.com",
    group: "sites",
    category: "surface",
    lenses: ["full", "host-journey"],
    description: "Programmatic property landing pages",
    owner: "Growth Engineering",
    url: "https://sites.wander.com",
  },
  {
    id: "wander-growth-api",
    label: "Wander Growth API",
    group: "sites",
    category: "service",
    lenses: ["full", "sales-motion", "host-journey"],
    description: "Python/FastAPI — CIO sync, recs, BDR assignment (legacy)",
    owner: "Growth Engineering",
    notes: "Being replaced by growth.wander.com (this app)",
    status: "legacy",
  },
  {
    id: "sites-templates",
    label: "Templates",
    group: "sites",
    category: "service",
    lenses: ["full", "host-journey"],
    description: "Site templates for programmatic generation",
    owner: "Growth Engineering",
  },

  // ── Social Media ──
  {
    id: "instagram",
    label: "Instagram",
    group: "social-media",
    category: "external",
    lenses: ["full", "content-flow"],
    description: "Organic social — property showcases, reels",
  },
  {
    id: "twitter-x",
    label: "X (Twitter)",
    group: "social-media",
    category: "external",
    lenses: ["full", "content-flow"],
    description: "Brand presence & engagement",
  },
  {
    id: "tiktok-organic",
    label: "TikTok (Organic)",
    group: "social-media",
    category: "external",
    lenses: ["full", "content-flow"],
    description: "Organic TikTok / Reels content",
  },
  {
    id: "canva",
    label: "Canva",
    group: "social-media",
    category: "tool",
    lenses: ["full", "content-flow"],
    description: "Design tool for social assets",
  },
  {
    id: "impact",
    label: "Impact.com",
    group: "social-media",
    category: "destination",
    lenses: ["full", "attribution", "data-spine"],
    description: "Affiliate / partnership attribution — commission payouts",
    notes:
      "3 active instances. Only backend should route Order Completed — triple commission risk",
    status: "issue",
  },
  {
    id: "giftly",
    label: "Giftly",
    group: "social-media",
    category: "external",
    lenses: ["full"],
    description: "Gift card platform integration",
  },

  // ── Data Layer ──
  {
    id: "segment",
    label: "Segment",
    group: "data-layer",
    category: "hub",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    description: "Central event router — 11 sources, fans out to destinations",
    notes: "Order Completed fires 3x (web + mobile + backend) — dedup risk",
    status: "issue",
  },
  {
    id: "dato-cms",
    label: "DatoCMS",
    group: "data-layer",
    category: "cms",
    lenses: ["full", "data-spine", "content-flow"],
    description: "Headless CMS — property content, travel guides, blog",
    owner: "Marketing / Content",
  },
  {
    id: "bigquery",
    label: "BigQuery",
    group: "data-layer",
    category: "storage",
    lenses: ["full", "data-spine", "sales-motion", "attribution"],
    description: "Data lake — production dumps, bookings, enrichment",
    owner: "Data / Analytics",
    notes: "bq query, guest profile, booking, properties",
  },
  {
    id: "kafka",
    label: "Kafka",
    group: "data-layer",
    category: "hub",
    lenses: ["full", "data-spine"],
    description: "Event streaming — search analytics topic",
    notes: "Search tracking only goes here, invisible in CIO pipeline",
  },

  // ── Analytics ──
  {
    id: "amplitude",
    label: "Amplitude",
    group: "analytics",
    category: "destination",
    lenses: ["full", "data-spine"],
    description: "Product analytics — funnels, pathing, retention",
    owner: "Product / Analytics",
  },
  {
    id: "posthog",
    label: "PostHog",
    group: "analytics",
    category: "destination",
    lenses: ["full", "data-spine"],
    description: "Feature flags + session replay",
    owner: "Engineering",
  },
  {
    id: "mixpanel",
    label: "Mixpanel",
    group: "analytics",
    category: "destination",
    lenses: ["full"],
    description: "Legacy analytics — still on wander.com web source",
    status: "legacy",
    notes: "Consider deprecating",
  },
  {
    id: "linear",
    label: "Linear",
    group: "analytics",
    category: "tool",
    lenses: ["full"],
    description: "Issue tracking & project management",
    owner: "Engineering",
  },
  {
    id: "dbt",
    label: "dbt",
    group: "analytics",
    category: "tool",
    lenses: ["full", "data-spine"],
    description: "Data transformation layer for BigQuery",
    owner: "Data / Analytics",
  },

  // ── Rouge Services ──
  {
    id: "twilio",
    label: "Twilio",
    group: "rouge-services",
    category: "integration",
    lenses: ["full"],
    description: "SMS & voice — used for guest notifications",
    status: "active",
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    group: "rouge-services",
    category: "integration",
    lenses: ["full"],
    description: "Web scraping API — property data enrichment",
  },
  {
    id: "render",
    label: "Render",
    group: "rouge-services",
    category: "integration",
    lenses: ["full"],
    description: "Hosting for standalone services",
    notes: "What is running here?",
    status: "issue",
  },
  {
    id: "rapidmail",
    label: "Rapidmail",
    group: "rouge-services",
    category: "integration",
    lenses: ["full"],
    description: "Email sending service",
    notes: "Why not just use CIO?",
    status: "issue",
  },

  // ── Growth Platform ──
  {
    id: "growth-app",
    label: "growth.wander.com",
    group: "growth-platform",
    category: "surface",
    lenses: ["full", "sales-motion", "data-spine"],
    description: "This app — CIO sync, recs pipeline, Outreach integration",
    owner: "Growth Engineering",
    notes: "TypeScript successor to wander-growth-api",
  },
  {
    id: "make-com",
    label: "Make.com",
    group: "growth-platform",
    category: "tool",
    lenses: ["full", "sales-motion"],
    description: "Workflow automation — glue between systems",
    owner: "Growth / RevOps",
    notes: "Connects to CIO, Outreach, various webhooks",
  },
];

// ─────────────────────────────────────────
// EDGES
// ─────────────────────────────────────────

export const EDGES: EcoEdge[] = [
  // ── Surfaces → Segment ──
  {
    id: "e-wander-seg",
    source: "wander-com",
    target: "segment",
    label: "events",
    kind: "events",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    animated: true,
  },
  {
    id: "e-mobile-seg",
    source: "mobile-app",
    target: "segment",
    label: "events",
    kind: "events",
    lenses: ["full", "data-spine", "guest-journey", "attribution"],
    animated: true,
  },
  {
    id: "e-appwander-seg",
    source: "app-wander-com",
    target: "segment",
    label: "events",
    kind: "events",
    lenses: ["full", "data-spine", "host-journey"],
    animated: true,
  },
  {
    id: "e-backend-seg",
    source: "wander-backend",
    target: "segment",
    label: "server events",
    kind: "events",
    lenses: ["full", "data-spine", "attribution"],
    notes: "Canonical for Order Completed",
    animated: true,
  },

  // ── Segment → Destinations ──
  {
    id: "e-seg-cio",
    source: "segment",
    target: "customer-io",
    label: "events",
    kind: "events",
    lenses: ["full", "data-spine", "guest-journey", "sales-motion"],
    animated: true,
  },
  {
    id: "e-seg-amp",
    source: "segment",
    target: "amplitude",
    label: "events",
    kind: "events",
    lenses: ["full", "data-spine"],
    animated: true,
  },
  {
    id: "e-seg-bq",
    source: "segment",
    target: "bigquery",
    label: "events",
    kind: "events",
    lenses: ["full", "data-spine", "attribution"],
    animated: true,
  },
  {
    id: "e-seg-impact",
    source: "segment",
    target: "impact",
    label: "Order Completed",
    kind: "events",
    lenses: ["full", "data-spine", "attribution"],
    notes: "Should only fire from backend source",
    animated: true,
  },
  {
    id: "e-seg-mix",
    source: "segment",
    target: "mixpanel",
    label: "events (legacy)",
    kind: "events",
    lenses: ["full"],
  },
  {
    id: "e-seg-ph",
    source: "segment",
    target: "posthog",
    label: "events",
    kind: "events",
    lenses: ["full", "data-spine"],
    animated: true,
  },

  // ── CMS → Surfaces ──
  {
    id: "e-dato-wander",
    source: "dato-cms",
    target: "wander-com",
    label: "content",
    kind: "content",
    lenses: ["full", "data-spine", "content-flow"],
  },
  {
    id: "e-dato-sites",
    source: "dato-cms",
    target: "sites-wander-com",
    label: "content",
    kind: "content",
    lenses: ["full", "content-flow"],
  },
  {
    id: "e-dato-app",
    source: "dato-cms",
    target: "app-wander-com",
    label: "content",
    kind: "content",
    lenses: ["full", "content-flow"],
  },

  // ── Backend → Surfaces ──
  {
    id: "e-be-wander",
    source: "wander-backend",
    target: "wander-com",
    label: "API",
    kind: "api",
    lenses: ["full", "data-spine"],
  },
  {
    id: "e-be-mobile",
    source: "wander-backend",
    target: "mobile-app",
    label: "API",
    kind: "api",
    lenses: ["full", "data-spine"],
  },
  {
    id: "e-be-app",
    source: "wander-backend",
    target: "app-wander-com",
    label: "API",
    kind: "api",
    lenses: ["full", "data-spine", "host-journey"],
  },
  {
    id: "e-db-be",
    source: "wander-db",
    target: "wander-backend",
    label: "data",
    kind: "data",
    lenses: ["full", "data-spine"],
  },

  // ── PMS ──
  {
    id: "e-pms-be",
    source: "pms-system",
    target: "wander-backend",
    label: "sync",
    kind: "sync",
    lenses: ["full", "host-journey"],
  },
  {
    id: "e-pms-app",
    source: "pms-system",
    target: "app-wander-com",
    label: "integration",
    kind: "api",
    lenses: ["full", "host-journey"],
  },

  // ── BigQuery → Growth ──
  {
    id: "e-bq-growth",
    source: "bigquery",
    target: "growth-app",
    label: "lead enrichment",
    kind: "api",
    lenses: ["full", "data-spine", "sales-motion"],
  },
  {
    id: "e-growth-cio",
    source: "growth-app",
    target: "customer-io",
    label: "recs + BDR sync",
    kind: "api",
    lenses: ["full", "sales-motion", "guest-journey"],
  },
  {
    id: "e-growth-outreach",
    source: "growth-app",
    target: "outreach",
    label: "prospect sync",
    kind: "api",
    lenses: ["full", "sales-motion"],
  },

  // ── CIO → Sales pipeline ──
  {
    id: "e-cio-outreach",
    source: "customer-io",
    target: "outreach",
    label: "leads (webhook)",
    kind: "webhook",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-outreach-cio",
    source: "outreach",
    target: "customer-io",
    label: "BDR assignment",
    kind: "webhook",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-outreach-demand",
    source: "outreach",
    target: "team-demand",
    label: "sequences",
    kind: "human",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-outreach-supply",
    source: "outreach",
    target: "team-supply",
    label: "sequences",
    kind: "human",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-gong-outreach",
    source: "gong",
    target: "outreach",
    label: "call data",
    kind: "sync",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-clay-outreach",
    source: "clay",
    target: "outreach",
    label: "enriched leads",
    kind: "api",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-hubspot-supply",
    source: "hubspot",
    target: "team-supply",
    label: "deals",
    kind: "human",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-cold-demand",
    source: "cold-calling",
    target: "team-demand",
    label: "calls",
    kind: "human",
    lenses: ["full", "sales-motion"],
  },

  // ── Ads → Surfaces ──
  {
    id: "e-google-wander",
    source: "google-ads",
    target: "wander-com",
    label: "traffic",
    kind: "traffic",
    lenses: ["full", "attribution"],
  },
  {
    id: "e-meta-wander",
    source: "meta-ads",
    target: "wander-com",
    label: "traffic",
    kind: "traffic",
    lenses: ["full", "attribution"],
  },
  {
    id: "e-tiktok-wander",
    source: "tiktok-ads",
    target: "wander-com",
    label: "traffic",
    kind: "traffic",
    lenses: ["full", "attribution"],
  },
  {
    id: "e-linkedin-wander",
    source: "linkedin-ads",
    target: "wander-com",
    label: "traffic",
    kind: "traffic",
    lenses: ["full", "attribution"],
  },
  {
    id: "e-team-google",
    source: "team-ads",
    target: "google-ads",
    kind: "human",
    lenses: ["full", "attribution"],
  },
  {
    id: "e-team-meta",
    source: "team-ads",
    target: "meta-ads",
    kind: "human",
    lenses: ["full", "attribution"],
  },
  {
    id: "e-team-tiktok",
    source: "team-ads",
    target: "tiktok-ads",
    kind: "human",
    lenses: ["full", "attribution"],
  },
  {
    id: "e-team-linkedin",
    source: "team-ads",
    target: "linkedin-ads",
    kind: "human",
    lenses: ["full", "attribution"],
  },

  // ── Marketing ──
  {
    id: "e-cio-marketing",
    source: "customer-io",
    target: "team-marketing",
    label: "campaigns",
    kind: "human",
    lenses: ["full", "guest-journey"],
  },
  {
    id: "e-marketing-cio",
    source: "team-marketing",
    target: "customer-io",
    label: "newsletters",
    kind: "human",
    lenses: ["full", "guest-journey"],
  },
  {
    id: "e-attentive-wander",
    source: "attentive",
    target: "wander-com",
    label: "SMS traffic",
    kind: "traffic",
    lenses: ["full", "guest-journey"],
  },

  // ── Feature Flags ──
  {
    id: "e-ph-wander",
    source: "posthog",
    target: "wander-com",
    label: "feature flags",
    kind: "api",
    lenses: ["full"],
  },
  {
    id: "e-ph-mobile",
    source: "posthog",
    target: "mobile-app",
    label: "feature flags",
    kind: "api",
    lenses: ["full"],
  },

  // ── Make.com ──
  {
    id: "e-make-cio",
    source: "make-com",
    target: "customer-io",
    label: "automation",
    kind: "webhook",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-make-outreach",
    source: "make-com",
    target: "outreach",
    label: "automation",
    kind: "webhook",
    lenses: ["full", "sales-motion"],
  },

  // ── Sites ──
  {
    id: "e-app-deploy",
    source: "app-wander-com",
    target: "site-deployments",
    label: "triggers",
    kind: "api",
    lenses: ["full", "host-journey"],
  },
  {
    id: "e-deploy-sites",
    source: "site-deployments",
    target: "sites-wander-com",
    label: "deploys",
    kind: "api",
    lenses: ["full", "host-journey"],
  },
  {
    id: "e-builder-deploy",
    source: "site-builder",
    target: "site-deployments",
    label: "builds",
    kind: "api",
    lenses: ["full", "host-journey"],
  },

  // ── Social ──
  {
    id: "e-canva-social",
    source: "canva",
    target: "instagram",
    label: "assets",
    kind: "content",
    lenses: ["full", "content-flow"],
  },
  {
    id: "e-canva-tiktok",
    source: "canva",
    target: "tiktok-organic",
    label: "assets",
    kind: "content",
    lenses: ["full", "content-flow"],
  },
  {
    id: "e-impact-seg",
    source: "impact",
    target: "segment",
    label: "conversions",
    kind: "events",
    lenses: ["full", "attribution"],
  },

  // ── dbt / BigQuery ──
  {
    id: "e-dbt-bq",
    source: "dbt",
    target: "bigquery",
    label: "transforms",
    kind: "data",
    lenses: ["full", "data-spine"],
  },

  // ── Kafka ──
  {
    id: "e-be-kafka",
    source: "wander-backend",
    target: "kafka",
    label: "search events",
    kind: "events",
    lenses: ["full", "data-spine"],
    notes: "Search analytics bypass Segment",
  },

  // ── Growth API (legacy) ──
  {
    id: "e-growthapi-cio",
    source: "wander-growth-api",
    target: "customer-io",
    label: "sync",
    kind: "api",
    lenses: ["full", "sales-motion"],
  },
  {
    id: "e-growthapi-outreach",
    source: "wander-growth-api",
    target: "outreach",
    label: "sync",
    kind: "api",
    lenses: ["full", "sales-motion"],
  },

  // ── Inner wander.com pages ──
  {
    id: "e-mkt-pages",
    source: "marketplace-frontend",
    target: "page-california",
    kind: "content",
    lenses: ["full", "content-flow"],
  },
  {
    id: "e-mkt-blog",
    source: "marketplace-frontend",
    target: "page-blog",
    kind: "content",
    lenses: ["full", "content-flow"],
  },
];

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

export function getNodesForLens(lens: Lens): EcoNode[] {
  return NODES.filter((n) => n.lenses.includes(lens));
}

export function getEdgesForLens(lens: Lens): EcoEdge[] {
  const nodeIds = new Set(getNodesForLens(lens).map((n) => n.id));
  return EDGES.filter(
    (e) =>
      e.lenses.includes(lens) && nodeIds.has(e.source) && nodeIds.has(e.target),
  );
}

export function getNodesForGroup(groupId: GroupId): EcoNode[] {
  return NODES.filter((n) => n.group === groupId);
}

export const LENS_META: Record<Lens, { label: string; description: string }> = {
  full: {
    label: "Full System",
    description: "Every node and connection in the Wander ecosystem",
  },
  "data-spine": {
    label: "Data Spine",
    description: "Events flow from surfaces through Segment to destinations",
  },
  "guest-journey": {
    label: "Guest Journey",
    description: "Guest-facing touchpoints from discovery through post-trip",
  },
  "sales-motion": {
    label: "Sales Motion",
    description: "Leads from CIO through Outreach to BDRs",
  },
  attribution: {
    label: "Attribution",
    description: "How bookings get credited — Impact, UTM, ad platforms",
  },
  "host-journey": {
    label: "Host Journey",
    description: "Host onboarding, PMS integration, site building",
  },
  "content-flow": {
    label: "Content Flow",
    description: "CMS → surfaces, social media → organic traffic",
  },
};

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  surface: "#3b82f6",
  hub: "#f59e0b",
  destination: "#10b981",
  tool: "#8b5cf6",
  team: "#64748b",
  external: "#f43f5e",
  storage: "#f97316",
  cms: "#14b8a6",
  service: "#6366f1",
  page: "#a78bfa",
  integration: "#ec4899",
};

export const EDGE_COLORS: Record<EdgeKind, string> = {
  events: "#60a5fa",
  webhook: "#a78bfa",
  api: "#6b7280",
  sync: "#f59e0b",
  human: "#94a3b8",
  content: "#2dd4bf",
  data: "#f97316",
  traffic: "#f43f5e",
};

// ─────────────────────────────────────────
// ISSUES & WARNINGS (from tracking plan)
// ─────────────────────────────────────────

export interface SystemIssue {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  affectedNodes: string[];
  category: "dedup" | "attribution" | "schema" | "deprecation" | "unknown";
}

export const SYSTEM_ISSUES: SystemIssue[] = [
  {
    id: "issue-triple-fire",
    severity: "critical",
    title: "Order Completed triple-fires",
    description:
      "wander.com (client), mobile (client), AND backend (server) all fire Order Completed. Without dedup, CIO and Impact see 2-3x booking events. If Impact destination is ever enabled on web/mobile sources, affiliates get paid 3x per booking.",
    affectedNodes: [
      "wander-com",
      "mobile-app",
      "wander-backend",
      "segment",
      "impact",
      "customer-io",
    ],
    category: "dedup",
  },
  {
    id: "issue-impact-instances",
    severity: "critical",
    title: "3 active Impact.com instances",
    description:
      "Multiple Impact destination instances configured in Segment. Only backend should route Order Completed to Impact. Verify web/mobile destinations are disabled.",
    affectedNodes: ["impact", "segment"],
    category: "attribution",
  },
  {
    id: "issue-im-ref-cookie",
    severity: "critical",
    title: "im_ref cookie persistence unknown",
    description:
      "Affiliate attribution chain depends on im_ref cookie surviving multi-day consideration periods. Cookie lifetime, checkout redirect survival, and server propagation need audit.",
    affectedNodes: ["impact", "wander-com", "wander-backend"],
    category: "attribution",
  },
  {
    id: "issue-revenue-field",
    severity: "warning",
    title: "Revenue field definition unclear",
    description:
      "Three fields exist on Order Completed: revenue (net), value (cart total), total (with tax). Impact commission base must be explicitly defined.",
    affectedNodes: ["impact", "wander-backend", "segment"],
    category: "attribution",
  },
  {
    id: "issue-domain-dedup",
    severity: "warning",
    title: "Domain Connected double-fires",
    description:
      "app.wander.com fires client-side + backend fires server-side, both to WANDER_OS. Likely duplicated.",
    affectedNodes: ["app-wander-com", "wander-backend"],
    category: "dedup",
  },
  {
    id: "issue-mobile-types",
    severity: "warning",
    title: "Mobile has zero type safety",
    description:
      "trackEvent(eventName: string, payload?: object) — any string is valid. All other surfaces have at least wrapper functions.",
    affectedNodes: ["mobile-app"],
    category: "schema",
  },
  {
    id: "issue-mixpanel-legacy",
    severity: "info",
    title: "Mixpanel still active (legacy)",
    description:
      "Still configured on wander.com web source. Consider deprecating to reduce noise and costs.",
    affectedNodes: ["mixpanel"],
    category: "deprecation",
  },
  {
    id: "issue-search-kafka",
    severity: "info",
    title: "Search analytics bypass Segment",
    description:
      "Search events go to Kafka topic only, never reaching CIO or standard analytics. Search behavior is invisible in CIO segments.",
    affectedNodes: ["kafka", "wander-backend"],
    category: "schema",
  },
  {
    id: "issue-deprecated-source",
    severity: "info",
    title: "Deprecated Segment source exists",
    description:
      "Wander Server-Side API Production is deprecated and should be deleted.",
    affectedNodes: ["segment"],
    category: "deprecation",
  },
  {
    id: "issue-render-unknown",
    severity: "warning",
    title: "Unknown service on Render",
    description:
      "Render is listed in rouge services but unclear what runs there.",
    affectedNodes: ["render"],
    category: "unknown",
  },
  {
    id: "issue-rapidmail",
    severity: "warning",
    title: "Rapidmail usage unclear",
    description:
      "Why use Rapidmail when Customer.io handles email? Possible duplication of effort.",
    affectedNodes: ["rapidmail", "customer-io"],
    category: "unknown",
  },
];

// ─────────────────────────────────────────
// TRACKING PLAN STATS
// ─────────────────────────────────────────

export const TRACKING_STATS = {
  surfaces: [
    {
      name: "wander.com",
      eventCount: 44,
      workspace: "WANDER_COM",
      type: "Website" as const,
    },
    {
      name: "app.wander.com",
      eventCount: 100,
      workspace: "WANDER_OS",
      type: "Website" as const,
    },
    {
      name: "Backend",
      eventCount: 8,
      workspace: "WANDER_COM + WANDER_OS",
      type: "Server" as const,
    },
    {
      name: "Mobile",
      eventCount: 20,
      workspace: "WANDER_COM",
      type: "Mobile" as const,
    },
  ],
  totalEvents: 172,
  crossSurfaceEvents: 11,
  segmentSources: 11,
  funnels: [
    { name: "Booking Conversion", steps: 5, workspace: "WANDER_COM" },
    { name: "Checkout Completion", steps: 3, workspace: "WANDER_COM" },
    { name: "Search Quality", steps: 3, workspace: "WANDER_COM" },
    { name: "Wishlist to Booking", steps: 3, workspace: "WANDER_COM" },
    { name: "Post-Booking Health", steps: 3, workspace: "WANDER_COM" },
    { name: "Host Activation", steps: 4, workspace: "WANDER_OS" },
    { name: "Inventory Readiness", steps: 3, workspace: "WANDER_OS" },
    { name: "Marketing to Booking", steps: 4, workspace: "WANDER_COM" },
  ],
};
