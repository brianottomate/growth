import "server-only";

import type { ToolSet } from "ai";

import { GROUPED_CAPABILITY_TOOLS } from "./grouped";
import { leadsSummary } from "./leads";
import { LIFECYCLE_TOOLS } from "./lifecycle";
import { recentMentions } from "./listening";
import { navigateWorkspace } from "./navigation";
import { workspaceOverview } from "./overview";
import { policyForGrowthTool } from "../kernel/policy";

export { registerMcpTools } from "./to-mcp-server";
export { growthTool } from "./types";
export type { GrowthTool as Capability, CapabilityContext } from "./types";

/**
 * Overview's executable source of truth. These are ordinary AI SDK tools: a
 * product surface is just a typed map assembled with object spreads.
 */
export const OVERVIEW_TOOLS = {
  workspaceOverview,
  navigateWorkspace,
  ...GROUPED_CAPABILITY_TOOLS,
  leadsSummary,
  ...LIFECYCLE_TOOLS,
  recentMentions,
} as const satisfies ToolSet;

/**
 * The OAuth MCP is a projection of the same native tools. Open-world research
 * stays with the host agent rather than widening Growth's connector surface.
 */
export const MCP_TOOLS = Object.fromEntries(
  Object.entries(OVERVIEW_TOOLS).filter(
    ([name]) => policyForGrowthTool(name).mcp,
  ),
) as ToolSet;
