import "server-only";

import { env } from "@/env";

export const GROWTH_MCP_SCOPE = "growth:all";
export const GROWTH_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  GROWTH_MCP_SCOPE,
] as const;

const configuredBaseUrl = new URL(env.NEXT_PUBLIC_BASE_URL);

/** Stable public origin used for issuer and OAuth resource identity. */
export const GROWTH_PUBLIC_ORIGIN = configuredBaseUrl.origin;
export const GROWTH_AUTH_ISSUER = new URL("/api/auth", GROWTH_PUBLIC_ORIGIN)
  .toString()
  .replace(/\/$/, "");
export const GROWTH_JWKS_URL = `${GROWTH_AUTH_ISSUER}/jwks`;
export const GROWTH_MCP_RESOURCE = new URL(
  "/api/mcp",
  GROWTH_PUBLIC_ORIGIN,
).toString();
export const GROWTH_MCP_RESOURCE_METADATA = new URL(
  "/.well-known/oauth-protected-resource",
  GROWTH_PUBLIC_ORIGIN,
).toString();
