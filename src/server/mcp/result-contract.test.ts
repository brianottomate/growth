import { expect, test } from "bun:test";
import { z } from "zod";
import { growthAction, growthDomainTool } from "@/server/ai/kernel/tool";

test("MCP results describe action-specific data and every failure envelope", () => {
  const domain = growthDomainTool({
    description: "contract",
    actions: {
      read: growthAction({
        description: "Read",
        inputSchema: z.object({}),
        outputSchema: z.object({ id: z.string(), total: z.number() }),
        execute: async () => ({ id: "campaign", total: 2 }),
      }),
      write: growthAction({
        description: "Write",
        outputSchema: z.object({ any: z.string() }),
        inputSchema: z.object({}),
        execute: async () => ({ any: "value" }),
      }),
    },
  });
  const schema = domain.resultSchema;
  expect(
    schema.safeParse({
      ok: true,
      action: "read",
      data: { id: "campaign", total: 2 },
    }).success,
  ).toBe(true);
  expect(
    schema.safeParse({ ok: true, action: "read", data: { id: "campaign" } })
      .success,
  ).toBe(false);
  expect(
    schema.safeParse({
      ok: false,
      action: "read",
      error: {
        code: "invalid_tool_input",
        message: "Invalid",
        suggestedAction: "Fix fields",
        issues: [{ path: "id", message: "Required" }],
      },
    }).success,
  ).toBe(true);
  expect(z.toJSONSchema(schema).anyOf).toBeDefined();
});

test("MCP executes a nested, referenced output schema without losing provider fields", async () => {
  const { createMcpHandler, McpServer } =
    await import("@modelcontextprotocol/server");
  const { Client, StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/client");
  const { mcpOutputSchema } = await import("./result-contract");
  const { pushDraftActionOutputSchema } =
    await import("@/server/ai/capabilities/outputs/ads");
  const fixture = {
    campaignId: "campaign",
    platform: "google_ads",
    validateOnly: true,
    platformCampaignRowId: "row",
    adSetsCreated: 1,
    adsCreated: 2,
    path: "/app/campaigns/campaign",
    warnings: [],
    provider: {
      validateOnly: true,
      providerExtension: {
        requestId: "receipt",
        nested: [1, null, { ok: true }],
      },
    },
  };
  const domain = growthDomainTool({
    description: "fixture",
    actions: {
      push: growthAction({
        description: "fixture",
        inputSchema: z.object({}),
        outputSchema: pushDraftActionOutputSchema,
        execute: async (): Promise<unknown> => fixture,
      }),
    },
  });
  const output = await domain.run(
    { action: "push" },
    { orgId: "fixture", userId: "fixture", runId: "fixture", surface: "test" },
  );
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({
        name: "output-contract-test",
        version: "1.0.0",
      });
      server.registerTool(
        "fixture",
        {
          inputSchema: z.object({}),
          outputSchema: mcpOutputSchema(domain.resultSchema),
        },
        async () => ({
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        }),
      );
      return server;
    },
    { legacy: "stateless" },
  );
  const endpoint = new URL("https://contract-test.invalid/mcp");
  const client = new Client({ name: "contract-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  try {
    await client.listTools();
    const result = await client.callTool({ name: "fixture", arguments: {} });
    expect(result.structuredContent).toEqual({
      ok: true,
      action: "push",
      data: fixture,
    });
  } finally {
    await client.close();
  }
});
