import "server-only";

import type { ToolSet } from "ai";

import { blogAgent } from "./blog";
import { DOMAIN_CAPABILITY_TOOLS } from "./domains";
import { LIFECYCLE_TOOLS } from "./lifecycle";
import { navigateWorkspace } from "./navigation";
import { newsletterAgent } from "./newsletter";
import { workspaceOverview } from "./overview";
import { prepareProductionPacket } from "./production";
import { renderSocialPosts } from "./social-post-preview";
import { capabilityAllowsSurface } from "../kernel/policy";

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
  prepareProductionPacket,
  renderSocialPosts,
  blogAgent,
  newsletterAgent,
  ...DOMAIN_CAPABILITY_TOOLS,
  ...LIFECYCLE_TOOLS,
} as const satisfies ToolSet;

/**
 * The OAuth MCP is a projection of the same native tools. Open-world research
 * stays with the host agent rather than widening Growth's connector surface.
 */
export const MCP_TOOLS = Object.fromEntries(
  Object.entries(OVERVIEW_TOOLS).filter(([name]) =>
    capabilityAllowsSurface(name, "mcp"),
  ),
) as ToolSet;
