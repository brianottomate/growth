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

beforeAll(async () => {
  ({ growthMcpHttpHandler: handler } = await import("@/server/mcp/server"));
});

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
  expect(names).not.toContain("researchRead");
  expect(names).not.toContain("driveRead");
}

describe("Growth MCP protocol compatibility", () => {
  test("advertises OAuth resource discovery to unauthenticated clients", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const response = await GET(new Request(endpoint));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://growth-red.vercel.app/.well-known/oauth-protected-resource"',
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
  });

  test("retains the stateless 2025 fallback", async () => {
    const client = new Client({
      name: "growth-legacy-protocol-test",
      version: "1.0.0",
    });
    await client.connect(createTransport());
    expect(client.getNegotiatedProtocolVersion()).not.toBe("2026-07-28");
    await assertToolCatalog(client);
    await client.close();
  });
});
