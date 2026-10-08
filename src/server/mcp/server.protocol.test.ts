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
      handler.fetch(new Request(input, init), {
        authInfo,
      }),
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
  ).toEqual({
    resourceUri: "ui://wander-growth/next-options/v1.html",
  });
  const nextOptions = await client.readResource({
    uri: "ui://wander-growth/next-options/v1.html",
  });
  expect(nextOptions.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
  expect(names.some((name) => name.startsWith("researchRead"))).toBe(false);
  expect(names.some((name) => name.startsWith("driveRead"))).toBe(false);
  expect(names).not.toContain("discoverTools");
  expect(names).toContain("sourceSyncWrite__syncWebsite");
  expect(names).toContain("adsWrite__setDelivery");
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
  for (const [toolName, resourceName] of [
    ["contentRead__upcoming", "content-calendar"],
    ["contentRead__pipeline", "content-pipeline"],
    ["contentRead__productionQueue", "production-queue"],
    ["adsRead__top", "ad-performance"],
    ["contentRead__getWorkItem", "work-item"],
    ["adsRead__openCampaign", "campaign-overview"],
    ["adsRead__ideaContext", "creative-review"],
    ["adsWrite__saveIdea", "creative-review"],
    ["adsWrite__draftAd", "creative-review"],
    ["adsRead__catalogState", "catalog-review"],
    ["brandRead__getMap", "brand-picker"],
    ["brandRead__list", "brand-picker"],
    ["mediaLibraryRead__listingPhotos", "listing-photos"],
  ]) {
    const uri = `ui://wander-growth/${resourceName}/v1.html`;
    const tool = tools.find((entry) => entry.name === toolName);
    expect(tool?._meta?.ui).toEqual({
      resourceUri: uri,
      visibility: ["model", "app"],
    });
    expect(tool?._meta?.["openai/outputTemplate"]).toBe(uri);
    const view = await client.readResource({ uri });
    expect(view.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
    if (
      toolName === "mediaLibraryRead__listingPhotos" ||
      resourceName === "brand-picker"
    ) {
      // Readability alone misses a host CSP that would blank native listing photos.
      const metadata = view.contents[0]?._meta as {
        ui?: { csp?: { resourceDomains?: string[] } };
      };
      expect(metadata.ui?.csp?.resourceDomains).toContain(
        "https://assets.wander.com",
      );
      expect(metadata.ui?.csp?.resourceDomains).toContain(
        "https://assets-websites.wander.com",
      );
    }
    expect(
      view.contents[0] && "text" in view.contents[0]
        ? view.contents[0].text
        : "",
    ).toContain("ui/notifications/tool-result");
  }
}

// These integration tests compile the complete catalog on their first request.
// Allow cold compilation while concurrent repository checks are using the CPU.
describe("Growth MCP protocol compatibility", () => {
  test("serves MCP 2026-07-28 stateless requests", async () => {
    const client = new Client(
      {
        name: "growth-modern-protocol-test",
        version: "1.0.0",
      },
      {
        versionNegotiation: {
          mode: {
            pin: "2026-07-28",
          },
        },
      },
    );
    await client.connect(createTransport());
    expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
    await assertToolCatalog(client);
    await client.close();
  }, 20_000);

  test("starting spend over MCP never runs without the person's yes", async () => {
    // This client declares no elicitation, so it cannot ask; the server must
    // refuse before reading anything (the test database is unreachable).
    const client = new Client(
      { name: "growth-confirmation-test", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(createTransport());
    const result = await client.callTool({
      name: "adsWrite__setDelivery",
      arguments: { platformCampaignId: "pc_test", status: "active" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("cannot ask");
    await client.close();
  }, 20_000);
});
