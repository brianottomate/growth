import {
  GROWTH_AUTH_ISSUER,
  GROWTH_MCP_RESOURCE,
  GROWTH_MCP_SCOPE,
} from "@/server/mcp/config";

/** RFC 9728 protected-resource discovery for the remote MCP endpoint. */
export function GET() {
  return Response.json(
    {
      resource: GROWTH_MCP_RESOURCE,
      authorization_servers: [GROWTH_AUTH_ISSUER],
      scopes_supported: [GROWTH_MCP_SCOPE, "offline_access"],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
