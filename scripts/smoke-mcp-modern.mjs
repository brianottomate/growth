import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const origin = process.env.GROWTH_ORIGIN ?? "https://growth-red.vercel.app";
const token = process.env.GROWTH_MCP_TOKEN;
if (!token) {
  throw new Error("GROWTH_MCP_TOKEN is required");
}

const endpoint = new URL("/api/mcp", origin);
const client = new Client(
  { name: "growth-modern-smoke", version: "1.0.0" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);
const transport = new StreamableHTTPClientTransport(endpoint, {
  authProvider: { token: async () => token },
});

try {
  await client.connect(transport);
  assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");

  const { tools } = await client.listTools();
  assert.ok(
    tools.length >= 30,
    `expected at least 30 tools, got ${tools.length}`,
  );
  assert.ok(tools.some((tool) => tool.name === "workspaceOverview"));
  assert.ok(tools.some((tool) => tool.name === "invoke_growth"));
  assert.ok(!tools.some((tool) => tool.name === "researchRead"));
  assert.ok(!tools.some((tool) => tool.name === "driveRead"));

  const overview = await client.callTool({
    name: "workspaceOverview",
    arguments: {},
  });
  assert.ok(!overview.isError, JSON.stringify(overview.content));
  console.log(
    `Growth MCP 2026-07-28 smoke passed for ${endpoint.toString()} (${tools.length} tools)`,
  );
} finally {
  await client.close();
}
