import type { AuthInfo } from "@modelcontextprotocol/server";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

import { getWanderMembership } from "@/server/wander-workspace";

import {
  GROWTH_AUTH_ISSUER,
  GROWTH_JWKS_URL,
  GROWTH_MCP_RESOURCE,
  GROWTH_MCP_RESOURCE_METADATA,
  GROWTH_MCP_SCOPE,
} from "@/server/mcp/config";
import { growthMcpHttpHandler } from "@/server/mcp/server";

export const maxDuration = 800;

const { verifyAccessToken } = oauthProviderResourceClient().getActions();

async function verifyToken(bearerToken: string): Promise<AuthInfo | undefined> {
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
  const membership = await getWanderMembership(userId);
  if (!membership || membership.organizationId !== organizationId)
    return undefined;

  const grantedScopes =
    typeof claims.scope === "string" ? claims.scope.split(" ") : [];

  return {
    token: bearerToken,
    clientId: typeof claims.azp === "string" ? claims.azp : userId,
    scopes: grantedScopes,
    expiresAt: claims.exp,
    resource: new URL(GROWTH_MCP_RESOURCE),
    extra: {
      userId,
      orgId: membership.organizationId,
    },
  };
}

function unauthorized(
  message = "Authentication required",
  authError?: "invalid_token" | "insufficient_scope",
) {
  const parameters = [
    `resource_metadata="${GROWTH_MCP_RESOURCE_METADATA}"`,
    `scope="${GROWTH_MCP_SCOPE}"`,
    ...(authError ? [`error="${authError}"`] : []),
  ];

  return Response.json(
    {
      error: authError ?? "unauthorized",
      error_description: message,
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer ${parameters.join(", ")}`,
      },
    },
  );
}

async function handleMcpRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return unauthorized();

  let authInfo: AuthInfo | undefined;
  try {
    authInfo = await verifyToken(token);
  } catch {
    return unauthorized(
      "The access token is invalid, expired, wrong-audience, or insufficient",
      "invalid_token",
    );
  }
  if (!authInfo) {
    return unauthorized(
      "The access token is not attached to an active Growth organization membership",
      "invalid_token",
    );
  }

  return growthMcpHttpHandler.fetch(request, { authInfo });
}

export {
  handleMcpRequest as DELETE,
  handleMcpRequest as GET,
  handleMcpRequest as POST,
};
