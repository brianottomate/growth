import "server-only";

import type { ToolSet } from "ai";
import {
  operationStatusTool,
  BACKGROUND_OPERATIONS,
} from "../kernel/operation-jobs";
import { growthOperation } from "@/lib/growth-capabilities";
import { z } from "zod";
import { capabilityErrorSchema } from "../kernel/output";
import { operationTools } from "../kernel/operations";

import { presentNextOptions } from "./next-options";
import { blogAgent } from "./blog";
import { DOMAIN_CAPABILITY_TOOLS } from "./domains";
import { LIFECYCLE_TOOLS } from "./lifecycle";
import { navigateWorkspace } from "./navigation";
import { newsletterAgent } from "./newsletter";
import { workspaceOverview } from "./overview";
import { prepareProductionPacket } from "./production";
import { renderSocialPosts } from "./social-post-preview";

export { registerMcpTools } from "./to-mcp-server";
export { growthTool } from "./types";
export type { GrowthTool as Capability, CapabilityContext } from "./types";

/**
 * Overview's executable source of truth. These are ordinary AI SDK tools: a
 * product surface is just a typed map assembled with object spreads.
 */
export const OVERVIEW_TOOLS = {
  presentNextOptions,
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
const jobResults = [...BACKGROUND_OPERATIONS].map((name) => {
  const { capability, action } = growthOperation(name);
  const catalog: import("../kernel/operations").GrowthCatalog = OVERVIEW_TOOLS;
  const parent = catalog[capability];
  const spec = parent?.actions?.[action!];
  if (!spec) throw new Error(`Missing job contract for ${name}`);
  return z.object({
    ok: z.literal(true),
    action: z.literal(action!),
    data: spec.outputSchema,
  });
});
const statusTool = operationStatusTool([...jobResults, capabilityErrorSchema]);
export const NATIVE_TOOLS = {
  ...operationTools(OVERVIEW_TOOLS, "overview-chat"),
  operationRead__status: statusTool,
};
export const MCP_TOOLS = {
  ...operationTools(OVERVIEW_TOOLS, "mcp"),
  operationRead__status: statusTool,
};
