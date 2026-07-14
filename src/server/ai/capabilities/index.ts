import "server-only";

import type { AnyCapability } from "./types";
import { adsScope, topAds } from "./ads";
import {
  createAudienceTarget,
  listAudienceTargets,
  saveAudienceTargets,
  updateAudienceActivation,
  updateAudienceTarget,
} from "./audiences";
import { getBrandMap } from "./brand-map";
import { listBrands } from "./brands";
import {
  addContentCrossPost,
  attachChatImageToContent,
  attachLibraryMediaToContent,
  contentPipelineSummary,
  createIdea,
  createPlatformPost,
  getContentWorkItem,
  promotePlatformPost,
  productionQueue,
  recoverArchiveMediaToContent,
  suggestMediaForContent,
  updateContentWorkItem,
  upcomingContent,
} from "./content";
import { leadsSummary } from "./leads";
import { recentMentions } from "./listening";
import { CONTENT_STRATEGY_CAPABILITIES } from "./content-strategy";
import { navigateWorkspace } from "./navigation";
import { nextForBrand } from "./next";
import { OPERATION_CAPABILITIES } from "./operations";
import { PLANNING_CAPABILITIES } from "./planning";
import { workspaceOverview } from "./overview";
import { prepareProductionPacket } from "./production";
import { readWebPage, webSearch } from "./research";
import { EMAIL_CAPABILITIES } from "./email";

export { toAiTools } from "./to-ai-tools";
export { registerMcpCapabilities } from "./to-mcp-server";
export { defineCapability } from "./types";
export type { Capability, AnyCapability, CapabilityContext } from "./types";

/**
 * Capabilities exposed to the /overview chat agent — and the list a future MCP
 * server adapter will iterate over. Order is the order the model sees them;
 * lead with the aggregator so broad questions resolve in one call.
 */
export const OVERVIEW_CAPABILITIES: AnyCapability[] = [
  workspaceOverview,
  navigateWorkspace,
  listBrands,
  nextForBrand,
  getBrandMap,
  listAudienceTargets,
  webSearch,
  readWebPage,
  createAudienceTarget,
  saveAudienceTargets,
  updateAudienceActivation,
  updateAudienceTarget,
  contentPipelineSummary,
  upcomingContent,
  productionQueue,
  getContentWorkItem,
  ...EMAIL_CAPABILITIES,
  ...CONTENT_STRATEGY_CAPABILITIES,
  suggestMediaForContent,
  prepareProductionPacket,
  // Content writes remain approval-gated; explicit audience saves are direct.
  updateContentWorkItem,
  addContentCrossPost,
  attachChatImageToContent,
  attachLibraryMediaToContent,
  recoverArchiveMediaToContent,
  createPlatformPost,
  promotePlatformPost,
  createIdea,
  leadsSummary,
  recentMentions,
  // Ads: scope FIRST (cheap lay-of-the-land), then drill with topAds.
  adsScope,
  topAds,
  // Portable, approval-gated operational workflows shared by chat and MCP.
  ...OPERATION_CAPABILITIES,
  ...PLANNING_CAPABILITIES,
];

/**
 * External connector surface. ChatGPT and Claude already have their own
 * open-world browsing, so Wander Growth contributes durable workspace capabilities
 * without duplicating web-search tools or widening prompt-injection exposure.
 */
export const MCP_CAPABILITIES: AnyCapability[] = OVERVIEW_CAPABILITIES.filter(
  (capability) => capability.domain !== "research",
);
