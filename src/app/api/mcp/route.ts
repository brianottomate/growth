import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { and, eq } from "drizzle-orm";

import { MCP_TOOLS } from "@/server/ai/capabilities";
import { registerMcpTools } from "@/server/ai/capabilities/to-mcp-server";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import {
  GROWTH_AUTH_ISSUER,
  GROWTH_JWKS_URL,
  GROWTH_MCP_RESOURCE,
  GROWTH_MCP_SCOPE,
  GROWTH_PUBLIC_ORIGIN,
} from "@/server/mcp/config";

export const maxDuration = 800;

const mcpHandler = createMcpHandler(
  (server) => registerMcpTools(server, MCP_TOOLS),
  {},
  { basePath: "/api", maxDuration, verboseLogs: false },
);

const { verifyAccessToken } = oauthProviderResourceClient().getActions();

async function verifyToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const claims = await verifyAccessToken(bearerToken, {
    verifyOptions: {
      audience: GROWTH_MCP_RESOURCE,
      issuer: GROWTH_AUTH_ISSUER,
    },
    jwksUrl: GROWTH_JWKS_URL,
    scopes: [GROWTH_MCP_SCOPE],
  });
  const userId = claims.sub;
  const organizationId = claims.org_id;
  if (typeof userId !== "string" || typeof organizationId !== "string") {
    return undefined;
  }

  // Membership is intentionally live rather than copied into a long-lived
  // connector record. Removing a user from an organization removes MCP access.
  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, userId),
      eq(memberTable.organizationId, organizationId),
    ),
    columns: { organizationId: true },
  });
  if (!membership) return undefined;

  const grantedScopes =
    typeof claims.scope === "string" ? claims.scope.split(" ") : [];

  return {
    token: bearerToken,
    clientId: typeof claims.azp === "string" ? claims.azp : userId,
    scopes: grantedScopes,
    expiresAt: claims.exp,
    extra: {
      userId,
      orgId: membership.organizationId,
    },
  };
}

const handler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  requiredScopes: [GROWTH_MCP_SCOPE],
  resourceUrl: GROWTH_PUBLIC_ORIGIN,
});

export { handler as DELETE, handler as GET, handler as POST };
