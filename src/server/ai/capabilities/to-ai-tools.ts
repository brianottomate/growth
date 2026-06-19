import "server-only";

import { tool, type ToolSet } from "ai";

import type { AnyCapability, CapabilityContext } from "./types";

/**
 * Adapt a list of capabilities into the AI SDK `tools` map that `streamText`
 * expects. The capability's pure handler is closed over the request context
 * (org + user), so the model never sees or supplies it.
 */
export function toAiTools(
  capabilities: AnyCapability[],
  ctx: CapabilityContext,
): ToolSet {
  return Object.fromEntries(
    capabilities.map((cap) => [
      cap.name,
      tool({
        description: cap.description,
        inputSchema: cap.inputSchema,
        execute: (input) => cap.execute(input, ctx),
      }),
    ]),
  );
}
