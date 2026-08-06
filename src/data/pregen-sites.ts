// ─── Pre-Generated Sites Pipeline ───────────────────────
//
// 5 stages: Build List → Qualify → Pre-Generate → Outreach → Claim & Publish
//

export type NodeKind =
  | "source" // data entry points
  | "database" // storage systems (Instantly, HubSpot, etc.)
  | "process" // qualify, rank, build steps
  | "channel" // outreach channels
  | "touchpoint" // pregen site, tracked URL
  | "conversion"; // claim, signup, editor

export interface PregenNode {
  id: string;
  label: string;
  description?: string;
  kind: NodeKind;
  stage: 1 | 2 | 3 | 4 | 5;
  parent?: string; // for grouping (e.g. nodes inside "Instantly")
}

export interface PregenEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: "data" | "action" | "webhook" | "user";
}

// ─── Colors ─────────────────────────────────────────────

export const KIND_COLORS: Record<NodeKind, string> = {
  source: "#64748b", // slate
  database: "#8b5cf6", // violet
  process: "#f59e0b", // amber
  channel: "#3b82f6", // blue
  touchpoint: "#10b981", // emerald
  conversion: "#ef4444", // red
};

export const STAGE_LABELS: Record<number, string> = {
  1: "1. Build the List",
  2: "2. Qualify & Rank",
  3: "3. Pre-Generate Sites",
  4: "4. Outreach & Marketing",
  5: "5. Claim & Publish",
};

export const STAGE_COLORS: Record<number, string> = {
  1: "#64748b",
  2: "#f59e0b",
  3: "#10b981",
  4: "#3b82f6",
  5: "#ef4444",
};

// ─── Stage 1: Build the List ────────────────────────────

const STAGE_1_NODES: PregenNode[] = [
  // Data entry points
  {
    id: "src-google-site",
    label: "Google Site Search",
    kind: "source",
    stage: 1,
  },
  {
    id: "src-google-maps",
    label: "Google Maps (Rubi)",
    kind: "source",
    stage: 1,
  },
  { id: "src-cam-doc", label: "Cam's Google Doc", kind: "source", stage: 1 },
  { id: "src-hubspot-list", label: "HubSpot List", kind: "source", stage: 1 },
  { id: "src-luigi", label: "Luigi Hawkeye", kind: "source", stage: 1 },
  { id: "src-airdna", label: "AirDNA Scraped", kind: "source", stage: 1 },
  { id: "src-airdata", label: "AirData", kind: "source", stage: 1 },
  { id: "src-minerva", label: "Minerva (Brian)", kind: "source", stage: 1 },
  { id: "src-brooks", label: "Brooks List (50)", kind: "source", stage: 1 },
  { id: "src-typeform", label: "Typeform Inbound", kind: "source", stage: 1 },

  // CSV aggregation
  {
    id: "csv-import",
    label: "CSV Import",
    description: "Merge & dedupe sources",
    kind: "process",
    stage: 1,
  },

  // Instantly as the central database
  {
    id: "instantly-db",
    label: "Instantly.ai",
    description: "Central prospect database",
    kind: "database",
    stage: 1,
  },
];

// ─── Stage 2: Qualify & Rank ────────────────────────────

const STAGE_2_NODES: PregenNode[] = [
  {
    id: "enrich",
    label: "Enrich",
    description: "Clay, Minerva, site crawl",
    kind: "process",
    stage: 2,
  },
  {
    id: "ai-score",
    label: "AI Score",
    description: "Evaluate site quality & fit",
    kind: "process",
    stage: 2,
  },
  {
    id: "rank",
    label: "Rank & Segment",
    description: "Tier prospects by score",
    kind: "process",
    stage: 2,
  },
];

// ─── Stage 3: Pre-Generate Sites ────────────────────────

const STAGE_3_NODES: PregenNode[] = [
  {
    id: "page-builder",
    label: "Page Builder",
    description: "WOS-2297",
    kind: "process",
    stage: 3,
  },
  {
    id: "site-builder",
    label: "Site Builder",
    description: "Assemble full site",
    kind: "process",
    stage: 3,
  },
  {
    id: "block-regen",
    label: "Block Regenerator",
    description: "Regenerate sections",
    kind: "process",
    stage: 3,
  },
  {
    id: "pregen-site",
    label: "Pre-Generated Site",
    description: "wander.com/os/preview?siteId=123",
    kind: "touchpoint",
    stage: 3,
  },
];

// ─── Stage 4: Outreach & Marketing ──────────────────────

const STAGE_4_NODES: PregenNode[] = [
  {
    id: "cohort-split",
    label: "Cohort Split",
    description: "Route to channels",
    kind: "process",
    stage: 4,
  },
  {
    id: "ch-cold-email",
    label: "Cold Email",
    description: "Instantly.ai sequences",
    kind: "channel",
    stage: 4,
  },
  {
    id: "ch-direct-mail",
    label: "Direct Mail",
    description: "Physical mailers",
    kind: "channel",
    stage: 4,
  },
  {
    id: "ch-paid-ads",
    label: "Paid Ads",
    description: "Meta, Google retargeting",
    kind: "channel",
    stage: 4,
  },
  {
    id: "ch-resend",
    label: "Resend Email",
    description: "Transactional + nurture",
    kind: "channel",
    stage: 4,
  },
  {
    id: "ch-ai-agent",
    label: "AI Agent",
    description: "Browserbase outreach",
    kind: "channel",
    stage: 4,
  },
  {
    id: "tracked-url",
    label: "Tracked URL",
    description: "wander.com/os/preview?siteId=…",
    kind: "touchpoint",
    stage: 4,
  },
  {
    id: "write-back",
    label: "Write Back",
    description: "Update Instantly + HubSpot",
    kind: "process",
    stage: 4,
  },
];

// ─── Stage 5: Claim & Publish ───────────────────────────

const STAGE_5_NODES: PregenNode[] = [
  {
    id: "claim-cta",
    label: "Claim Site",
    description: "CTA on pre-gen preview",
    kind: "conversion",
    stage: 5,
  },
  {
    id: "app-signup",
    label: "app.wander.com",
    description: "Complete signup flow",
    kind: "conversion",
    stage: 5,
  },
  {
    id: "pms-keys",
    label: "Upload PMS Keys",
    description: "Connect property system",
    kind: "conversion",
    stage: 5,
  },
  {
    id: "agentic-editor",
    label: "Agentic Editor",
    description: "AI website editor",
    kind: "conversion",
    stage: 5,
  },
  {
    id: "published",
    label: "Published Site",
    description: "Live Wander Site",
    kind: "touchpoint",
    stage: 5,
  },
];

export const NODES: PregenNode[] = [
  ...STAGE_1_NODES,
  ...STAGE_2_NODES,
  ...STAGE_3_NODES,
  ...STAGE_4_NODES,
  ...STAGE_5_NODES,
];

// ─── Edges ──────────────────────────────────────────────

export const EDGES: PregenEdge[] = [
  // Stage 1: Sources → CSV → Instantly
  { id: "e-gs-csv", source: "src-google-site", target: "csv-import" },
  { id: "e-gm-csv", source: "src-google-maps", target: "csv-import" },
  { id: "e-cam-csv", source: "src-cam-doc", target: "csv-import" },
  { id: "e-hs-csv", source: "src-hubspot-list", target: "csv-import" },
  { id: "e-luigi-csv", source: "src-luigi", target: "csv-import" },
  { id: "e-airdna-csv", source: "src-airdna", target: "csv-import" },
  { id: "e-airdata-csv", source: "src-airdata", target: "csv-import" },
  { id: "e-minerva-csv", source: "src-minerva", target: "csv-import" },
  { id: "e-brooks-csv", source: "src-brooks", target: "csv-import" },
  { id: "e-typeform-csv", source: "src-typeform", target: "csv-import" },
  {
    id: "e-csv-instantly",
    source: "csv-import",
    target: "instantly-db",
    label: "import",
    type: "data",
  },

  // Stage 1→2: Instantly → Enrich
  {
    id: "e-inst-enrich",
    source: "instantly-db",
    target: "enrich",
    label: "prospects",
    type: "data",
  },

  // Stage 2: Enrich → Score → Rank
  {
    id: "e-enrich-score",
    source: "enrich",
    target: "ai-score",
    label: "enriched data",
    type: "data",
  },
  {
    id: "e-score-rank",
    source: "ai-score",
    target: "rank",
    label: "scored",
    type: "data",
  },

  // Stage 2→3: Rank → Page Builder
  {
    id: "e-rank-builder",
    source: "rank",
    target: "page-builder",
    label: "qualified prospects",
    type: "action",
  },

  // Stage 3: Build pipeline
  {
    id: "e-page-site",
    source: "page-builder",
    target: "site-builder",
    type: "action",
  },
  {
    id: "e-site-block",
    source: "site-builder",
    target: "block-regen",
    type: "action",
  },
  {
    id: "e-block-pregen",
    source: "block-regen",
    target: "pregen-site",
    label: "generated",
    type: "action",
  },

  // Stage 3→4: Pre-gen site → Cohort split
  {
    id: "e-pregen-cohort",
    source: "pregen-site",
    target: "cohort-split",
    label: "unique URLs",
    type: "data",
  },

  // Stage 4: Cohort → Channels
  {
    id: "e-cohort-cold",
    source: "cohort-split",
    target: "ch-cold-email",
    type: "action",
  },
  {
    id: "e-cohort-mail",
    source: "cohort-split",
    target: "ch-direct-mail",
    type: "action",
  },
  {
    id: "e-cohort-ads",
    source: "cohort-split",
    target: "ch-paid-ads",
    type: "action",
  },
  {
    id: "e-cohort-resend",
    source: "cohort-split",
    target: "ch-resend",
    type: "action",
  },
  {
    id: "e-cohort-agent",
    source: "cohort-split",
    target: "ch-ai-agent",
    type: "action",
  },

  // Channels → Tracked URL
  {
    id: "e-cold-url",
    source: "ch-cold-email",
    target: "tracked-url",
    label: "unique link",
    type: "data",
  },
  {
    id: "e-mail-url",
    source: "ch-direct-mail",
    target: "tracked-url",
    label: "QR code",
    type: "data",
  },
  {
    id: "e-ads-url",
    source: "ch-paid-ads",
    target: "tracked-url",
    label: "ad click",
    type: "data",
  },
  {
    id: "e-resend-url",
    source: "ch-resend",
    target: "tracked-url",
    label: "email link",
    type: "data",
  },
  {
    id: "e-agent-url",
    source: "ch-ai-agent",
    target: "tracked-url",
    label: "shared link",
    type: "data",
  },

  // Write back loop
  {
    id: "e-url-wb",
    source: "tracked-url",
    target: "write-back",
    label: "click events",
    type: "webhook",
  },
  {
    id: "e-wb-instantly",
    source: "write-back",
    target: "instantly-db",
    label: "update status",
    type: "webhook",
  },

  // Stage 4→5: Tracked URL → Claim
  {
    id: "e-url-claim",
    source: "tracked-url",
    target: "claim-cta",
    label: "prospect clicks",
    type: "user",
  },

  // Stage 5: Claim → Publish
  {
    id: "e-claim-signup",
    source: "claim-cta",
    target: "app-signup",
    type: "user",
  },
  {
    id: "e-signup-pms",
    source: "app-signup",
    target: "pms-keys",
    type: "user",
  },
  {
    id: "e-pms-editor",
    source: "pms-keys",
    target: "agentic-editor",
    type: "user",
  },
  {
    id: "e-editor-pub",
    source: "agentic-editor",
    target: "published",
    label: "go live",
    type: "action",
  },
];
