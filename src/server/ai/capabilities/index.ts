import "server-only";

import type { AnyCapability } from "./types";
import { adsScope, topAds } from "./ads";
import { listBrands } from "./brands";
import { contentPipelineSummary, upcomingContent } from "./content";
import { leadsSummary } from "./leads";
import { recentMentions } from "./listening";
import { workspaceOverview } from "./overview";

export { toAiTools } from "./to-ai-tools";
export { defineCapability } from "./types";
export type { Capability, AnyCapability, CapabilityContext } from "./types";

/**
 * Capabilities exposed to the /overview chat agent — and the list a future MCP
 * server adapter will iterate over. Order is the order the model sees them;
 * lead with the aggregator so broad questions resolve in one call.
 */
export const OVERVIEW_CAPABILITIES: AnyCapability[] = [
  workspaceOverview,
  listBrands,
  contentPipelineSummary,
  upcomingContent,
  leadsSummary,
  recentMentions,
  // Ads: scope FIRST (cheap lay-of-the-land), then drill with topAds.
  adsScope,
  topAds,
];
