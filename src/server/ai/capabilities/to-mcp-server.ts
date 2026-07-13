import "server-only";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";

import type { AnyCapability, CapabilityContext } from "./types";

type ToolExtra = { authInfo?: AuthInfo };

function contextFrom(extra: ToolExtra): CapabilityContext {
  const values = extra.authInfo?.extra as
    | { orgId?: unknown; userId?: unknown }
    | undefined;
  if (typeof values?.orgId !== "string" || typeof values.userId !== "string") {
    throw new Error("The MCP token is not attached to a workspace organization.");
  }
  return { orgId: values.orgId, userId: values.userId };
}

/** Register the canonical capability list on any MCP server instance. */
export function registerMcpCapabilities(
  server: McpServer,
  capabilities: AnyCapability[],
) {
  for (const capability of capabilities) {
    const schema = capability.inputSchema as z.ZodObject<z.ZodRawShape>;
    server.registerTool(
      capability.name,
      {
        title: capability.name,
        description: capability.description,
        inputSchema: schema.shape,
        annotations: {
          readOnlyHint: capability.readOnly,
          destructiveHint: !capability.readOnly,
          idempotentHint: capability.readOnly,
          openWorldHint: capability.domain === "research",
        },
      },
      async (input, extra) => {
        try {
          const output = await capability.execute(input, contextFrom(extra));
          return {
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent:
              output && typeof output === "object"
                ? (output as Record<string, unknown>)
                : { result: output },
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text:
                  error instanceof Error ? error.message : "Capability failed",
              },
            ],
          };
        }
      },
    );
  }
}
