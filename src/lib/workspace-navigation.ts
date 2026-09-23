import { getSafeInternalPath } from "./auth-utils";

export const WORKSPACE_SURFACES = [
  "performance",
  "performance_clients",
  "performance_campaigns",
  "performance_prospects",
  "performance_accounts",
  "overview",
  "next",
  "review",
  "brands",
  "brand_map",
  "channels",
  "website",
  "product_atlas",
  "storefronts",
  "audiences",
  "plan",
  "create",
  "studio",
  "content",
  "series",
  "calendar",
  "campaigns",
  "timeline",
  "feed",
  "blog",
  "newsletters",
  "transactional",
  "ads",
  "inbox",
  "listen",
  "lifecycle",
  "media",
  "compositions",
  "pillars",
  "people",
  "affiliate",
  "leads",
  "spend",
  "path",
] as const;

export type WorkspaceSurface = (typeof WORKSPACE_SURFACES)[number];

export const WORKSPACE_ROUTES = {
  performance: "/app/performance",
  performance_clients: "/app/performance/clients",
  performance_campaigns: "/app/performance/campaigns",
  performance_prospects: "/app/performance/prospects",
  performance_accounts: "/app/performance/accounts",
  overview: "/app/next",
  next: "/app/next",
  review: "/app/review",
  brands: "/app/brands",
  channels: "/app/channels",
  website: "/app/website",
  product_atlas: "/app/product-atlas",
  storefronts: "/app/apps",
  audiences: "/app/audiences",
  plan: "/app/next?intent=plan",
  create: "/app/next?intent=create",
  studio: "/app/next?intent=create",
  content: "/app/content",
  series: "/app/series",
  calendar: "/app/calendar",
  campaigns: "/app/campaigns",
  timeline: "/app/feed-v5",
  feed: "/app/feed",
  blog: "/app/blog",
  newsletters: "/app/newsletters",
  transactional: "/app/transactional",
  ads: "/app/ads",
  inbox: "/app/inbox",
  listen: "/app/listen",
  lifecycle: "/app/lifecycle",
  media: "/app/media",
  compositions: "/app/compositions",
  pillars: "/app/pillars",
  people: "/app/people",
  affiliate: "/app/affiliate",
  leads: "/app/leads",
  spend: "/app/spend",
} as const satisfies Record<
  Exclude<WorkspaceSurface, "brand_map" | "path">,
  string
>;

/**
 * Safe fallback for a real app route that has not been added to the named
 * surface catalog yet. This keeps navigation useful as the workspace grows
 * without allowing external or authentication URLs through the agent.
 */
export function getSafeWorkspacePath(value: string | undefined): string | null {
  const path = getSafeInternalPath(value ?? null);
  return path && /^\/app(?:[/?#]|$)/.test(path) ? path : null;
}
