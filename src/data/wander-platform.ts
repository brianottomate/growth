// ─── Wander Platform Architecture ────────────────────────
// Three surfaces (mobile, web, WanderOS) + shared backend monorepo + satellite repos

export type Platform = "mobile" | "web" | "wanderos" | "backend" | "growth" | "infra";
export type RepoKind = "platform" | "repo" | "service" | "package" | "group";

export interface PlatformNode {
  id: string;
  label: string;
  description?: string;
  kind: RepoKind;
  platform?: Platform;
  tech?: string;
  repo?: string; // GitHub org/repo or local path
  parentGroup?: string;
}

export interface PlatformEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: "depends" | "contains" | "calls" | "deploys" | "shares";
}

// ─── Colors ──────────────────────────────────────────────

export const PLATFORM_COLORS: Record<Platform, string> = {
  mobile: "#f97316",   // orange
  web: "#3b82f6",      // blue
  wanderos: "#8b5cf6", // purple
  backend: "#10b981",  // emerald
  growth: "#f43f5e",   // rose
  infra: "#6b7280",    // gray
};

export const KIND_COLORS: Record<RepoKind, string> = {
  platform: "#e2e8f0",
  repo: "#94a3b8",
  service: "#60a5fa",
  package: "#a78bfa",
  group: "#334155",
};

// ─── Nodes ───────────────────────────────────────────────

export const PLATFORM_NODES: PlatformNode[] = [
  // ── Platform surfaces ────────────────────────────────
  {
    id: "mobile",
    label: "Mobile App",
    description: "Expo / React Native — guest marketplace",
    kind: "platform",
    platform: "mobile",
    tech: "Expo + React Native",
    repo: "wandercom/mobile",
  },
  {
    id: "wander-com",
    label: "wander.com",
    description: "Guest-facing marketplace — Next.js",
    kind: "platform",
    platform: "web",
    tech: "Next.js + pnpm",
    repo: "wandercom/wander.com",
  },
  {
    id: "app-wander-com",
    label: "app.wander.com",
    description: "WanderOS host dashboard — Vite + React",
    kind: "platform",
    platform: "wanderos",
    tech: "Vite + React",
    repo: "wandercom/app.wander.com",
  },

  // ── Shared backend monorepo ──────────────────────────
  {
    id: "monorepo",
    label: "wander (monorepo)",
    description: "Shared backend — Turborepo + Yarn workspaces",
    kind: "platform",
    platform: "backend",
    tech: "Node 22 + Turborepo",
    repo: "wandercom/wander",
  },

  // Monorepo: systems
  { id: "grp-systems", label: "systems/", kind: "group", platform: "backend", parentGroup: "monorepo" },
  { id: "pkg-payment", label: "payment", kind: "service", platform: "backend", parentGroup: "grp-systems", description: "Payment processing" },
  { id: "pkg-pricing", label: "pricing", kind: "service", platform: "backend", parentGroup: "grp-systems", description: "Dynamic pricing engine" },
  { id: "pkg-sync", label: "sync", kind: "service", platform: "backend", parentGroup: "grp-systems", description: "Channel sync (Channex, etc.)" },

  // Monorepo: clients
  { id: "grp-clients", label: "clients/", kind: "group", platform: "backend", parentGroup: "monorepo" },
  { id: "pkg-segment", label: "segment", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-stripe", label: "stripe", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-customerio", label: "customerio", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-amplitude", label: "amplitude", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-slack", label: "slack", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-outreach", label: "outreach (Hubspot)", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-channex", label: "channex", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-bigquery", label: "bigquery", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-aws", label: "aws", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-r2", label: "r2", kind: "package", platform: "backend", parentGroup: "grp-clients" },
  { id: "pkg-temporal", label: "temporal", kind: "package", platform: "backend", parentGroup: "grp-clients" },

  // Monorepo: libraries
  { id: "grp-libs", label: "libraries/", kind: "group", platform: "backend", parentGroup: "monorepo" },
  { id: "pkg-prisma", label: "prisma", kind: "package", platform: "backend", parentGroup: "grp-libs", description: "Shared DB schema" },
  { id: "pkg-common", label: "common", kind: "package", platform: "backend", parentGroup: "grp-libs" },
  { id: "pkg-ai", label: "ai-systems", kind: "package", platform: "backend", parentGroup: "grp-libs" },
  { id: "pkg-cache", label: "cache-utils", kind: "package", platform: "backend", parentGroup: "grp-libs" },
  { id: "pkg-logger", label: "logger", kind: "package", platform: "backend", parentGroup: "grp-libs" },
  { id: "pkg-redis", label: "redis", kind: "package", platform: "backend", parentGroup: "grp-libs" },

  // ── Satellite repos ──────────────────────────────────
  {
    id: "growth",
    label: "growth",
    description: "Growth platform — CIO/Outreach sync, analytics",
    kind: "repo",
    platform: "growth",
    tech: "Next.js + Bun + tRPC",
    repo: "wandercom/growth",
  },
  {
    id: "growth-api",
    label: "wander-growth-api",
    description: "Legacy Python growth API (being ported)",
    kind: "repo",
    platform: "growth",
    tech: "Python + FastAPI",
    repo: "wandercom/wander-growth-api",
  },
  {
    id: "wander-sites",
    label: "wander-sites-website",
    description: "WanderOS direct booking site generator",
    kind: "repo",
    platform: "wanderos",
    tech: "Astro",
    repo: "wandercom/wander-sites-website",
  },
  {
    id: "lead-gen",
    label: "lead-gen",
    description: "Lead generation for WanderOS sales",
    kind: "repo",
    platform: "growth",
  },
  {
    id: "design-system",
    label: "design-system",
    description: "Shared component library",
    kind: "repo",
    platform: "infra",
    repo: "wandercom/design-system",
  },
  {
    id: "wander-mcp",
    label: "wander-mcp",
    description: "MCP server for Wander tooling",
    kind: "repo",
    platform: "infra",
  },
  {
    id: "seo-agent",
    label: "seo-agent",
    description: "SEO automation agent",
    kind: "repo",
    platform: "growth",
  },
];

// ─── Edges ───────────────────────────────────────────────

export const PLATFORM_EDGES: PlatformEdge[] = [
  // Surfaces → monorepo (API calls)
  { id: "e-mobile-mono", source: "mobile", target: "monorepo", label: "API calls", type: "calls" },
  { id: "e-web-mono", source: "wander-com", target: "monorepo", label: "API calls", type: "calls" },
  { id: "e-app-mono", source: "app-wander-com", target: "monorepo", label: "API calls", type: "calls" },

  // Monorepo internal: groups
  { id: "e-mono-sys", source: "monorepo", target: "grp-systems", type: "contains" },
  { id: "e-mono-cli", source: "monorepo", target: "grp-clients", type: "contains" },
  { id: "e-mono-lib", source: "monorepo", target: "grp-libs", type: "contains" },

  // Systems
  { id: "e-sys-pay", source: "grp-systems", target: "pkg-payment", type: "contains" },
  { id: "e-sys-price", source: "grp-systems", target: "pkg-pricing", type: "contains" },
  { id: "e-sys-sync", source: "grp-systems", target: "pkg-sync", type: "contains" },

  // Clients
  { id: "e-cli-seg", source: "grp-clients", target: "pkg-segment", type: "contains" },
  { id: "e-cli-str", source: "grp-clients", target: "pkg-stripe", type: "contains" },
  { id: "e-cli-cio", source: "grp-clients", target: "pkg-customerio", type: "contains" },
  { id: "e-cli-amp", source: "grp-clients", target: "pkg-amplitude", type: "contains" },
  { id: "e-cli-slk", source: "grp-clients", target: "pkg-slack", type: "contains" },
  { id: "e-cli-out", source: "grp-clients", target: "pkg-outreach", type: "contains" },
  { id: "e-cli-chx", source: "grp-clients", target: "pkg-channex", type: "contains" },
  { id: "e-cli-bq", source: "grp-clients", target: "pkg-bigquery", type: "contains" },
  { id: "e-cli-aws", source: "grp-clients", target: "pkg-aws", type: "contains" },
  { id: "e-cli-r2", source: "grp-clients", target: "pkg-r2", type: "contains" },
  { id: "e-cli-tmp", source: "grp-clients", target: "pkg-temporal", type: "contains" },

  // Libraries
  { id: "e-lib-prm", source: "grp-libs", target: "pkg-prisma", type: "contains" },
  { id: "e-lib-com", source: "grp-libs", target: "pkg-common", type: "contains" },
  { id: "e-lib-ai", source: "grp-libs", target: "pkg-ai", type: "contains" },
  { id: "e-lib-cch", source: "grp-libs", target: "pkg-cache", type: "contains" },
  { id: "e-lib-log", source: "grp-libs", target: "pkg-logger", type: "contains" },
  { id: "e-lib-rds", source: "grp-libs", target: "pkg-redis", type: "contains" },

  // Shared prisma dependency
  { id: "e-web-prisma", source: "wander-com", target: "pkg-prisma", label: "imports types", type: "shares" },
  { id: "e-app-prisma", source: "app-wander-com", target: "pkg-prisma", label: "imports types", type: "shares" },

  // Satellite repo relationships
  { id: "e-growth-cio", source: "growth", target: "pkg-customerio", label: "syncs leads", type: "calls" },
  { id: "e-growth-out", source: "growth", target: "pkg-outreach", label: "syncs prospects", type: "calls" },
  { id: "e-growth-seg", source: "growth", target: "pkg-segment", label: "reads events", type: "calls" },
  { id: "e-growth-api", source: "growth", target: "growth-api", label: "replacing", type: "depends" },
  { id: "e-sites-app", source: "wander-sites", target: "app-wander-com", label: "managed via", type: "depends" },
  { id: "e-leadgen-growth", source: "lead-gen", target: "growth", label: "feeds leads", type: "calls" },
  { id: "e-ds-web", source: "design-system", target: "wander-com", label: "used by", type: "shares" },
  { id: "e-ds-app", source: "design-system", target: "app-wander-com", label: "used by", type: "shares" },

  // Mobile shared analytics
  { id: "e-mobile-seg", source: "mobile", target: "pkg-segment", label: "tracks events", type: "calls" },
];

// ─── Lens helpers ────────────────────────────────────────

export type PlatformLens = "full" | "surfaces" | "monorepo" | "growth-stack";

export const LENS_META: Record<PlatformLens, { label: string; description: string }> = {
  full: { label: "Full Map", description: "All platforms, repos, and packages" },
  surfaces: { label: "Surfaces", description: "Mobile, web, and WanderOS frontends + their backend connections" },
  monorepo: { label: "Monorepo", description: "Backend monorepo package breakdown" },
  "growth-stack": { label: "Growth Stack", description: "Growth platform and its dependencies" },
};

const LENS_NODE_IDS: Record<Exclude<PlatformLens, "full">, Set<string>> = {
  surfaces: new Set([
    "mobile", "wander-com", "app-wander-com", "monorepo",
    "design-system", "wander-sites",
  ]),
  monorepo: new Set([
    "monorepo",
    "grp-systems", "pkg-payment", "pkg-pricing", "pkg-sync",
    "grp-clients", "pkg-segment", "pkg-stripe", "pkg-customerio", "pkg-amplitude",
    "pkg-slack", "pkg-outreach", "pkg-channex", "pkg-bigquery", "pkg-aws", "pkg-r2", "pkg-temporal",
    "grp-libs", "pkg-prisma", "pkg-common", "pkg-ai", "pkg-cache", "pkg-logger", "pkg-redis",
  ]),
  "growth-stack": new Set([
    "growth", "growth-api", "lead-gen", "seo-agent",
    "monorepo", "grp-clients", "pkg-customerio", "pkg-outreach", "pkg-segment", "pkg-bigquery", "pkg-slack",
  ]),
};

export function getNodesForLens(lens: PlatformLens): PlatformNode[] {
  if (lens === "full") return PLATFORM_NODES;
  const ids = LENS_NODE_IDS[lens];
  return PLATFORM_NODES.filter((n) => ids.has(n.id));
}

export function getEdgesForLens(lens: PlatformLens): PlatformEdge[] {
  if (lens === "full") return PLATFORM_EDGES;
  const ids = LENS_NODE_IDS[lens];
  return PLATFORM_EDGES.filter((e) => ids.has(e.source) && ids.has(e.target));
}
