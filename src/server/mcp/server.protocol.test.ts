import { beforeAll, describe, expect, test } from "bun:test";
import type { AuthInfo, McpHttpHandler } from "@modelcontextprotocol/server";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

process.env.CI ??= "true";
process.env.SKIP_ENV_VALIDATION ??= "true";
process.env.DATABASE_URL ??=
  "postgresql://protocol:protocol@protocol-test.invalid/growth?sslmode=require";
process.env.NEXT_PUBLIC_BASE_URL ??= "https://growth-red.vercel.app";
process.env.RESEND_API_KEY ??= "re_protocol_test";

const endpoint = new URL("https://growth-red.vercel.app/api/mcp");
const authInfo: AuthInfo = {
  token: "protocol-test-token",
  clientId: "growth-protocol-test",
  scopes: ["growth:all"],
  expiresAt: Math.floor(Date.now() / 1000) + 300,
  resource: endpoint,
  extra: {
    userId: "protocol-test-user",
    orgId: "protocol-test-organization",
  },
};

let handler: McpHttpHandler;

// Importing the server pulls the whole capability graph, which takes ~6s
// cold — over bun's 5s default hook timeout, so this failed on a cold cache
// or a loaded machine and passed warm. The work is an import, not a wait.
beforeAll(async () => {
  ({ growthMcpHttpHandler: handler } = await import("@/server/mcp/server"));
}, 60_000);

function createTransport() {
  return new StreamableHTTPClientTransport(endpoint, {
    fetch: (input, init) =>
      handler.fetch(new Request(input, init), { authInfo }),
  });
}

async function assertToolCatalog(client: Client) {
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);
  expect(names.length).toBeGreaterThanOrEqual(30);
  expect(names).toContain("workspaceOverview");
  expect(names).toContain("invoke_growth");
  expect(names).toContain("renderSocialPosts");
  expect(names).toContain("presentNextOptions");
  for (const tool of tools) {
    expect(tool.outputSchema?.type).toBe("object");
  }
  expect(
    tools.find((tool) => tool.name === "presentNextOptions")?._meta?.ui,
  ).toEqual({ resourceUri: "ui://wander-growth/next-options/v1.html" });
  const nextOptions = await client.readResource({
    uri: "ui://wander-growth/next-options/v1.html",
  });
  expect(nextOptions.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
  expect(names.some((name) => name.startsWith("researchRead"))).toBe(false);
  expect(names.some((name) => name.startsWith("driveRead"))).toBe(false);
  expect(names).not.toContain("discoverTools");
  expect(names).toContain("sourceSyncWrite__syncWebsite");
  expect(names).not.toContain("adsWrite__push");
  expect(names).not.toContain("brandWrite__purge");
  expect(names).toContain("operationRead__status");
  const brandSchema = JSON.stringify(
    tools.find((tool) => tool.name === "brandWrite__create")?.inputSchema,
  );
  expect(brandSchema).not.toContain('"purge"');
  expect(brandSchema).not.toContain('"previewPurge"');

  const previewTool = tools.find((tool) => tool.name === "renderSocialPosts");
  expect(previewTool?._meta?.ui).toEqual({
    resourceUri: "ui://wander-growth/social-post-preview/v1.html",
    visibility: ["model", "app"],
  });

  const resource = await client.readResource({
    uri: "ui://wander-growth/social-post-preview/v1.html",
  });
  expect(resource.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
  expect(
    resource.contents[0] && "text" in resource.contents[0]
      ? resource.contents[0].text
      : "",
  ).toContain("Social posts");
}

// These integration tests compile the complete catalog on their first request.
// Allow cold compilation while concurrent repository checks are using the CPU.
describe("Growth MCP protocol compatibility", () => {
  test("advertises OAuth resource discovery to unauthenticated clients", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const { GROWTH_MCP_RESOURCE_METADATA } =
      await import("@/server/mcp/config");
    const response = await GET(new Request(endpoint));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${GROWTH_MCP_RESOURCE_METADATA}"`,
    );
    expect(response.headers.get("www-authenticate")).toContain(
      'scope="growth:all"',
    );
  });

  test("reads organization identity from the official SDK HTTP context", async () => {
    const { identityFromMcpContext } =
      await import("@/server/ai/capabilities/to-mcp-server");
    expect(identityFromMcpContext({ http: { authInfo } })).toEqual({
      userId: "protocol-test-user",
      orgId: "protocol-test-organization",
    });
    expect(() => identityFromMcpContext({})).toThrow(
      "The MCP token is not attached to a Growth organization.",
    );
  });

  test("serves MCP 2026-07-28 stateless requests", async () => {
    const client = new Client(
      { name: "growth-modern-protocol-test", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(createTransport());
    expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
    await assertToolCatalog(client);
    await client.close();
  }, 20_000);

  test("retains the stateless 2025 fallback", async () => {
    const client = new Client({
      name: "growth-legacy-protocol-test",
      version: "1.0.0",
    });
    await client.connect(createTransport());
    expect(client.getNegotiatedProtocolVersion()).not.toBe("2026-07-28");
    await assertToolCatalog(client);
    await client.close();
  }, 20_000);
});
