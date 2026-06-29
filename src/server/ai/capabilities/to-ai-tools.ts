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
    capabilities.map((cap) => {
      // A write capability (readOnly: false) opts into the AI SDK approval
      // round-trip by default — the client renders an approval card and the
      // tool only executes once the operator confirms (see SparPanel + the
      // OverviewChat approval card). A capability can override via needsApproval.
      const needsApproval = cap.needsApproval ?? !cap.readOnly;
      return [
        cap.name,
        tool({
          description: cap.description,
          inputSchema: cap.inputSchema,
          ...(needsApproval ? { needsApproval: true } : {}),
          execute: (input) => cap.execute(input, ctx),
        }),
      ];
    }),
  );
}
