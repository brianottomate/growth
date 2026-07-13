import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { and, eq } from "drizzle-orm";

import { OVERVIEW_CAPABILITIES } from "@/server/ai/capabilities";
import { registerMcpCapabilities } from "@/server/ai/capabilities/to-mcp-server";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";

export const maxDuration = 800;

const mcpHandler = createMcpHandler(
  (server) => registerMcpCapabilities(server, OVERVIEW_CAPABILITIES),
  {},
  { basePath: "/api", maxDuration, verboseLogs: false },
);

async function verifyToken(
  request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return undefined;

  const preferredOrgId = session.session.activeOrganizationId;
  const membership = await db.query.memberTable.findFirst({
    where: preferredOrgId
      ? and(
          eq(memberTable.userId, session.user.id),
          eq(memberTable.organizationId, preferredOrgId),
        )
      : eq(memberTable.userId, session.user.id),
    columns: { organizationId: true },
  });
  if (!membership) return undefined;

  return {
    token: bearerToken,
    clientId: session.user.id,
    scopes: ["growth:capabilities"],
    extra: {
      userId: session.user.id,
      orgId: membership.organizationId,
    },
  };
}

const handler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  requiredScopes: ["growth:capabilities"],
});

export { handler as GET, handler as POST };
