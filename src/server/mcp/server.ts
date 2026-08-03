import "server-only";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { MCP_TOOLS } from "@/server/ai/capabilities";
import { registerMcpTools } from "@/server/ai/capabilities/to-mcp-server";

export function createGrowthMcpServer() {
  const server = new McpServer({
    name: "growth",
    version: "0.2.0",
    title: "Wander Growth",
    description: "Plan, create, organize, and inspect Wander growth operations",
  });

  registerMcpTools(server, MCP_TOOLS);
  return server;
}

/**
 * A fresh server handles each request so the modern protocol stays stateless.
 * The legacy stateless leg keeps existing ChatGPT and Claude installations
 * working while hosts negotiate the 2026-07-28 protocol independently.
 */
export const growthMcpHttpHandler = createMcpHandler(
  () => createGrowthMcpServer(),
  {
    legacy: "stateless",
    responseMode: "auto",
  },
);
