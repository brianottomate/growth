import { SignJWT, importPKCS8 } from "jose";
import { env } from "@/env";
import type {
  Prospect,
  ProspectsResponse,
  ProspectResponse,
  StagesResponse,
  UsersResponse,
} from "./outreach.types";

// =====================================================
// OUTREACH APP CONFIGURATION
// =====================================================

/**
 * Outreach App: "Wander Growth"
 * Authentication: Server-to-Server (S2S) + OAuth 2.0
 *
 * API Scopes (all with highest access level):
 * - accounts: all, delete, read, write
 * - auditLogs: read
 * - calls: all, delete, read, write
 * - events: all, read, write
 * - imports: all, read, write
 * - kaiaRecordings: read
 * - mailings: read
 * - opportunities: all, delete, read, write
 * - prospects: all, delete, read, write
 * - sequences: all, delete, read, write
 * - sequenceStates: all, delete, read, write
 * - snippets: read
 * - tasks: all, delete, read, write
 * - templates: read
 * - users: read
 * - webhooks: (access configured)
 *
 * Required Environment Variables (S2S):
 * - OUTREACH_S2S_GUID: Server-to-Server application GUID
 * - OUTREACH_PRIVATE_KEY: RSA private key (PKCS8 format) for JWT signing
 * - OUTREACH_INSTALL_ID: Installation ID for the Wander Growth app
 *
 * Required Environment Variables (OAuth):
 * - OUTREACH_OAUTH_CLIENT_ID: OAuth Application ID
 * - OUTREACH_OAUTH_CLIENT_SECRET: OAuth Application Secret
 */

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * Check if Outreach S2S is configured
 */
export const isS2SConfigured =
  !!env.OUTREACH_S2S_GUID &&
  !!env.OUTREACH_PRIVATE_KEY &&
  !!env.OUTREACH_INSTALL_ID;

/**
 * Check if Outreach OAuth is configured
 */
export const isOAuthConfigured =
  !!env.OUTREACH_OAUTH_CLIENT_ID && !!env.OUTREACH_OAUTH_CLIENT_SECRET;

/**
 * Check if Outreach is configured (either S2S or OAuth)
 *
 * Use this to conditionally enable Outreach features without throwing.
 */
export const isOutreachConfigured = isS2SConfigured || isOAuthConfigured;

if (!isOutreachConfigured) {
  console.warn(
    "⚠️ [Outreach] Not configured. Need either S2S (GUID, PRIVATE_KEY, INSTALL_ID) or OAuth (CLIENT_ID, CLIENT_SECRET)",
  );
}

// =====================================================
// CONSTANTS
// =====================================================

/**
 * Outreach API base URL
 */
const OUTREACH_API_BASE = "https://api.outreach.io/api/v2";

/**
 * Token TTL and refresh buffer
 */
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_BUFFER_MS = 5 * 60 * 1000; // Refresh 5min before expiry

// =====================================================
// TOKEN CACHE (MODULE-LEVEL FOR SERVERLESS)
// =====================================================

/**
 * In-memory token cache
 * Works in serverless environment where instances may be reused
 */
let cachedToken: string | null = null;
let tokenExpiresAt: Date | null = null;

/**
 * Check if cached token is still valid
 */
function isCachedTokenValid(): boolean {
  if (!cachedToken || !tokenExpiresAt) {
    return false;
  }

  const now = new Date();
  const expiryWithBuffer = new Date(
    tokenExpiresAt.getTime() - TOKEN_BUFFER_MS,
  );

  return now < expiryWithBuffer;
}

/**
 * Clear cached S2S token so the next request forces a fresh token exchange.
 */
function clearS2STokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = null;
}

// =====================================================
// S2S AUTHENTICATION
// =====================================================

/**
 * Parse private key and handle escaped newlines
 */
function parsePrivateKey(privateKey: string): string {
  // Replace escaped newlines with actual newlines
  const key = privateKey.replace(/\\n/g, "\n");

  // Validate key format
  if (!key.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new OutreachError(
      "Invalid private key format. Must be a PKCS8 PEM private key.",
    );
  }

  return key;
}

/**
 * Generate S2S application token (JWT)
 *
 * Creates a JWT signed with the RSA private key for S2S authentication.
 * The JWT is used to exchange for an access token from Outreach.
 */
async function generateAppToken(): Promise<string> {
  if (!env.OUTREACH_S2S_GUID || !env.OUTREACH_PRIVATE_KEY) {
    throw new OutreachError(
      "Missing S2S configuration (GUID or private key)",
    );
  }


  try {
    // Parse and import the private key
    const privateKeyPem = parsePrivateKey(env.OUTREACH_PRIVATE_KEY);
    const privateKey = await importPKCS8(privateKeyPem, "RS256");

    // Create JWT with required claims
    // Note: "bento" field is required by Outreach
    const jwt = await new SignJWT({
      bento: env.OUTREACH_S2S_GUID, // Required by Outreach
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(env.OUTREACH_S2S_GUID)
      .setAudience("https://api.outreach.io/api/v2/oauth/token")
      .setExpirationTime("5m") // Short-lived JWT
      .setIssuedAt()
      .sign(privateKey);

    return jwt;
  } catch (error) {
    console.error("❌ [Outreach] Failed to generate JWT:", error);
    throw new OutreachError(
      `Failed to generate app token: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Exchange S2S app token for access token
 *
 * Makes a request to Outreach's token endpoint to exchange the JWT
 * for an access token that can be used for API calls.
 */
async function exchangeTokenForAccessToken(
  appToken: string,
): Promise<string> {
  if (!env.OUTREACH_INSTALL_ID) {
    throw new OutreachError("Missing OUTREACH_INSTALL_ID");
  }


  try {
    // Note: This endpoint uses /api/app/installs (not /api/v2/oauth/app/installs)
    const response = await fetch(
      `https://api.outreach.io/api/app/installs/${env.OUTREACH_INSTALL_ID}/actions/accessToken`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${appToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ [Outreach] Token exchange failed: ${response.status}`,
        errorText,
      );

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new OutreachError("Rate limited", {
          statusCode: 429,
          isRateLimited: true,
          retryAfter: retryAfter ? parseInt(retryAfter) : undefined,
        });
      }

      throw new OutreachError(
        `Token exchange failed: ${response.status} ${response.statusText}`,
        { statusCode: response.status },
      );
    }

    const data = (await response.json()) as {
      data: {
        meta: {
          accessToken: string;
        };
      };
    };

    const accessToken = data.data.meta.accessToken;

    if (!accessToken) {
      throw new OutreachError(
        "No access token in response",
      );
    }

    return accessToken;
  } catch (error) {
    if (error instanceof OutreachError) {
      throw error;
    }
    console.error("❌ [Outreach] Token exchange error:", error);
    throw new OutreachError(
      `Token exchange failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get a valid S2S access token (with caching)
 *
 * Returns a cached token if available and valid, otherwise generates
 * a new one. This is the main entry point for authentication.
 */
export async function getS2SAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (isCachedTokenValid() && cachedToken) {
    return cachedToken;
  }

  // Check if token is expiring soon
  if (cachedToken && tokenExpiresAt) {
  } else {
  }

  // Generate new token
  const appToken = await generateAppToken();
  const accessToken = await exchangeTokenForAccessToken(appToken);

  // Cache the token
  cachedToken = accessToken;
  tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);


  return accessToken;
}

// =====================================================
// OAUTH AUTHENTICATION
// =====================================================

/**
 * OAuth token cache (per-user)
 * Maps userId to their OAuth tokens
 */
interface OAuthTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

const oauthTokenCache = new Map<string, OAuthTokenData>();

/**
 * Generate OAuth authorization URL
 *
 * Redirects user to Outreach OAuth consent screen.
 * After authorization, Outreach redirects to your callback URL with a code.
 */
export function getOAuthAuthorizationUrl(params: {
  redirectUri: string;
  state?: string;
}): string {
  if (!env.OUTREACH_OAUTH_CLIENT_ID) {
    throw new OutreachError("OAuth not configured: missing CLIENT_ID");
  }

  const authUrl = new URL("https://api.outreach.io/oauth/authorize");
  authUrl.searchParams.set("client_id", env.OUTREACH_OAUTH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  // Outreach OAuth scopes - space separated
  // Request broad read access to start
  authUrl.searchParams.set("scope", "accounts.read prospects.read opportunities.read sequences.read users.read");

  if (params.state) {
    authUrl.searchParams.set("state", params.state);
  }

  return authUrl.toString();
}

/**
 * Exchange OAuth authorization code for tokens
 *
 * After user authorizes, exchange the code for access + refresh tokens.
 */
export async function exchangeOAuthCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  if (!env.OUTREACH_OAUTH_CLIENT_ID || !env.OUTREACH_OAUTH_CLIENT_SECRET) {
    throw new OutreachError("OAuth not configured");
  }


  try {
    const response = await fetch("https://api.outreach.io/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.OUTREACH_OAUTH_CLIENT_ID,
        client_secret: env.OUTREACH_OAUTH_CLIENT_SECRET,
        redirect_uri: params.redirectUri,
        grant_type: "authorization_code",
        code: params.code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ [Outreach OAuth] Token exchange failed: ${response.status}`,
        errorText,
      );
      throw new OutreachError(
        `OAuth token exchange failed: ${response.status}`,
        { statusCode: response.status },
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };


    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    if (error instanceof OutreachError) {
      throw error;
    }
    console.error("❌ [Outreach OAuth] Token exchange error:", error);
    throw new OutreachError(
      `OAuth token exchange failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Refresh OAuth access token
 *
 * Use refresh token to get a new access token when it expires.
 */
export async function refreshOAuthToken(
  refreshToken: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  if (!env.OUTREACH_OAUTH_CLIENT_ID || !env.OUTREACH_OAUTH_CLIENT_SECRET) {
    throw new OutreachError("OAuth not configured");
  }


  try {
    const response = await fetch("https://api.outreach.io/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.OUTREACH_OAUTH_CLIENT_ID,
        client_secret: env.OUTREACH_OAUTH_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ [Outreach OAuth] Token refresh failed: ${response.status}`,
        errorText,
      );
      throw new OutreachError(
        `OAuth token refresh failed: ${response.status}`,
        { statusCode: response.status },
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };


    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    if (error instanceof OutreachError) {
      throw error;
    }
    console.error("❌ [Outreach OAuth] Token refresh error:", error);
    throw new OutreachError(
      `OAuth token refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Store OAuth tokens for a user
 */
export function storeOAuthTokens(params: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): void {
  const expiresAt = new Date(Date.now() + params.expiresIn * 1000);

  oauthTokenCache.set(params.userId, {
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    expiresAt,
  });

}

/**
 * Get OAuth access token for a user (with automatic refresh)
 *
 * Returns cached token if valid, refreshes if expired.
 */
export async function getOAuthAccessToken(userId: string): Promise<string> {
  const cached = oauthTokenCache.get(userId);

  if (!cached) {
    throw new OutreachError(
      `No OAuth tokens found for user ${userId}. User needs to authorize.`,
    );
  }

  // Check if token is still valid (with 5min buffer)
  const now = new Date();
  const expiryWithBuffer = new Date(cached.expiresAt.getTime() - TOKEN_BUFFER_MS);

  if (now < expiryWithBuffer) {
    return cached.accessToken;
  }

  // Token expired or expiring soon - refresh it

  const refreshed = await refreshOAuthToken(cached.refreshToken);

  // Update cache
  storeOAuthTokens({
    userId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresIn: refreshed.expiresIn,
  });

  return refreshed.accessToken;
}

/**
 * Check if user has OAuth tokens
 */
export function hasOAuthTokens(userId: string): boolean {
  return oauthTokenCache.has(userId);
}

/**
 * Clear OAuth tokens for a user
 */
export function clearOAuthTokens(userId: string): void {
  oauthTokenCache.delete(userId);
}

// =====================================================
// API HELPERS
// =====================================================

/**
 * Get authorization headers for API requests
 *
 * Supports both S2S and OAuth authentication:
 * - If userId provided: Try OAuth first (if configured and user has tokens), else S2S
 * - If no userId: Use S2S
 */
async function getAuthHeaders(params?: {
  userId?: string;
  preferOAuth?: boolean;
}): Promise<Record<string, string>> {
  let token: string;

  // Try OAuth if userId provided and OAuth is configured
  if (params?.userId && isOAuthConfigured && hasOAuthTokens(params.userId)) {
    token = await getOAuthAccessToken(params.userId);
  }
  // Prefer OAuth even without cached tokens (will throw if not authorized)
  else if (params?.preferOAuth && params.userId && isOAuthConfigured) {
    token = await getOAuthAccessToken(params.userId);
  }
  // Fall back to S2S
  else if (isS2SConfigured) {
    token = await getS2SAccessToken();
  }
  // No auth method configured
  else {
    throw new OutreachError(
      "No authentication method configured. Need either S2S or OAuth credentials.",
    );
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/vnd.api+json",
  };
}

/**
 * Make an authenticated request to Outreach API
 */
async function outreachRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  authParams?: { userId?: string; preferOAuth?: boolean },
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${OUTREACH_API_BASE}${endpoint}`;

  function isExpiredAccessTokenError(errorText: string): boolean {
    if (errorText.includes("expiredAccessToken")) {
      return true;
    }

    try {
      const parsed: unknown = JSON.parse(errorText);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "id" in parsed &&
        (parsed as { id?: unknown }).id === "expiredAccessToken"
      ) {
        return true;
      }

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "errors" in parsed &&
        Array.isArray((parsed as { errors?: unknown[] }).errors)
      ) {
        return (parsed as { errors: unknown[] }).errors.some((entry) => {
          return (
            typeof entry === "object" &&
            entry !== null &&
            "id" in entry &&
            (entry as { id?: unknown }).id === "expiredAccessToken"
          );
        });
      }
    } catch {
      // Ignore parse errors and treat as non-expired-token response.
    }

    return false;
  }

  async function performRequest(forceS2SRefresh = false): Promise<T> {
    if (forceS2SRefresh) {
      clearS2STokenCache();
    }

    const headers = await getAuthHeaders(authParams);
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Retry once on stale S2S token.
      if (
        !forceS2SRefresh &&
        response.status === 401 &&
        isS2SConfigured &&
        isExpiredAccessTokenError(errorText)
      ) {
        console.warn(
          "⚠️ [Outreach] Access token expired. Refreshing S2S token and retrying once.",
        );
        return performRequest(true);
      }

      console.error(
        `❌ [Outreach] Request failed: ${response.status}`,
        errorText,
      );

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new OutreachError("Rate limited", {
          statusCode: 429,
          isRateLimited: true,
          retryAfter: retryAfter ? parseInt(retryAfter) : undefined,
        });
      }

      throw new OutreachError(
        `API request failed: ${response.status} ${response.statusText}`,
        { statusCode: response.status },
      );
    }

    return (await response.json()) as T;
  }

  try {
    return await performRequest(false);
  } catch (error) {
    if (error instanceof OutreachError) {
      throw error;
    }
    console.error("❌ [Outreach] Request error:", error);
    throw new OutreachError(
      `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// =====================================================
// API FUNCTIONS
// =====================================================

/**
 * Test connection to Outreach API
 *
 * Makes a simple API call to verify authentication works.
 * Fetches a single prospect as a health check.
 */
export async function testConnection(authParams?: {
  userId?: string;
  preferOAuth?: boolean;
}): Promise<{
  success: boolean;
  message: string;
}> {
  if (!isOutreachConfigured) {
    return {
      success: false,
      message: "Outreach is not configured",
    };
  }

  try {

    // Simple API call to test auth
    await outreachRequest(
      "/prospects?page[limit]=1&page[offset]=0",
      {
        method: "GET",
      },
      authParams,
    );


    return {
      success: true,
      message: "Successfully connected to Outreach API",
    };
  } catch (error) {
    console.error("❌ [Outreach] Connection test failed:", error);

    return {
      success: false,
      message:
        error instanceof OutreachError
          ? error.message
          : "Unknown connection error",
    };
  }
}

/**
 * Get prospects from Outreach
 *
 * Fetches a paginated list of prospects with optional filtering.
 *
 * @param options.pageSize - Number of prospects per page (1-100)
 * @param options.pageNumber - Page number to fetch (1-indexed)
 * @param options.filters - Filter criteria (e.g., { emails: "example@email.com" })
 * @param options.userId - Optional user ID for OAuth authentication
 * @param options.preferOAuth - Prefer OAuth over S2S if both configured
 */
export async function getProspects(options?: {
  pageSize?: number;
  pageNumber?: number;
  pageOffset?: number;
  filters?: Record<string, string | string[]>;
  sort?: string;
  includeCount?: boolean;
  userId?: string;
  preferOAuth?: boolean;
}): Promise<OutreachProspectsResponse> {
  if (!isOutreachConfigured) {
    throw new OutreachError("Outreach is not configured");
  }

  const pageSize = options?.pageSize ?? 10;
  const pageNumber = options?.pageNumber;
  const pageOffset = options?.pageOffset;

  // Build query params
  const params = new URLSearchParams({
    "page[limit]": pageSize.toString(),
  });

  if (typeof pageOffset === "number" && pageOffset >= 0) {
    params.set("page[offset]", pageOffset.toString());
  } else if (pageNumber) {
    const offset = Math.max(0, (pageNumber - 1) * pageSize);
    params.set("page[offset]", offset.toString());
  }

  if (options?.sort) {
    params.set("sort", options.sort);
  }

  if (options?.includeCount) {
    params.set("count", "true");
  }

  // Add filters (Outreach uses filter[field]=value format)
  if (options?.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // For array values, join with commas
        params.set(`filter[${key}]`, value.join(","));
      } else {
        params.set(`filter[${key}]`, value);
      }
    });
  }

  const response = await outreachRequest<OutreachProspectsResponse>(
    `/prospects?${params.toString()}`,
    { method: "GET" },
    {
      userId: options?.userId,
      preferOAuth: options?.preferOAuth,
    },
  );


  return response;
}

/**
 * Get users from Outreach.
 *
 * Useful for building local BDR roster config with real Outreach user IDs.
 */
export async function getUsers(options?: {
  pageSize?: number;
  pageNumber?: number;
  pageOffset?: number;
  filters?: Record<string, string | string[]>;
  userId?: string;
  preferOAuth?: boolean;
}): Promise<UsersResponse> {
  if (!isOutreachConfigured) {
    throw new OutreachError("Outreach is not configured");
  }

  const pageSize = options?.pageSize ?? 100;
  const pageNumber = options?.pageNumber;
  const pageOffset = options?.pageOffset;

  const params = new URLSearchParams({
    "page[limit]": pageSize.toString(),
  });

  if (typeof pageOffset === "number" && pageOffset >= 0) {
    params.set("page[offset]", pageOffset.toString());
  } else if (pageNumber) {
    const offset = Math.max(0, (pageNumber - 1) * pageSize);
    params.set("page[offset]", offset.toString());
  }

  if (options?.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        params.set(`filter[${key}]`, value.join(","));
      } else {
        params.set(`filter[${key}]`, value);
      }
    });
  }


  const response = await outreachRequest<UsersResponse>(
    `/users?${params.toString()}`,
    { method: "GET" },
    {
      userId: options?.userId,
      preferOAuth: options?.preferOAuth,
    },
  );


  return response;
}

/**
 * Get stages from Outreach.
 *
 * Useful for exposing canonical stage IDs and names for prospect pipelines.
 */
export async function getStages(options?: {
  pageSize?: number;
  pageNumber?: number;
  pageOffset?: number;
  filters?: Record<string, string | string[]>;
  sort?: string;
  provideAuthorizationMeta?: boolean;
  userId?: string;
  preferOAuth?: boolean;
}): Promise<StagesResponse> {
  if (!isOutreachConfigured) {
    throw new OutreachError("Outreach is not configured");
  }

  const pageSize = options?.pageSize ?? 100;
  const pageNumber = options?.pageNumber;
  const pageOffset = options?.pageOffset;

  const params = new URLSearchParams({
    "page[limit]": pageSize.toString(),
  });

  if (typeof pageOffset === "number" && pageOffset >= 0) {
    params.set("page[offset]", pageOffset.toString());
  } else if (pageNumber) {
    const offset = Math.max(0, (pageNumber - 1) * pageSize);
    params.set("page[offset]", offset.toString());
  }

  if (options?.sort) {
    params.set("sort", options.sort);
  }

  if (options?.provideAuthorizationMeta) {
    params.set("provideAuthorizationMeta", "true");
  }

  if (options?.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        params.set(`filter[${key}]`, value.join(","));
      } else {
        params.set(`filter[${key}]`, value);
      }
    });
  }

  const response = await outreachRequest<StagesResponse>(
    `/stages?${params.toString()}`,
    { method: "GET" },
    {
      userId: options?.userId,
      preferOAuth: options?.preferOAuth,
    },
  );

  return response;
}

export interface ProspectTagSummary {
  name: string;
  count: number;
}

export interface ProspectTagsResult {
  tags: ProspectTagSummary[];
  fetchedProspects: number;
  totalProspects: number | null;
  pagesFetched: number;
  complete: boolean;
}

/**
 * Collect unique tags by scanning prospect pages.
 *
 * Outreach tags are currently exposed on prospect attributes in this codebase,
 * so this helper normalizes and aggregates all observed tags.
 */
export async function getProspectTags(options?: {
  pageSize?: number;
  maxPages?: number;
  userId?: string;
  preferOAuth?: boolean;
}): Promise<ProspectTagsResult> {
  if (!isOutreachConfigured) {
    throw new OutreachError("Outreach is not configured");
  }

  const pageSize = Math.min(Math.max(options?.pageSize ?? 100, 1), 200);
  const maxPages = Math.min(Math.max(options?.maxPages ?? 50, 1), 200);

  const tagCounts = new Map<string, number>();
  let fetchedProspects = 0;
  let pagesFetched = 0;
  let totalProspects: number | null = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const pageOffset = pageIndex * pageSize;
    const response = await getProspects({
      pageSize,
      pageOffset,
      includeCount: true,
      userId: options?.userId,
      preferOAuth: options?.preferOAuth,
    });

    pagesFetched += 1;
    const prospects = response.data;
    fetchedProspects += prospects.length;

    if (totalProspects === null && typeof response.meta?.count === "number") {
      totalProspects = response.meta.count;
    }

    for (const prospect of prospects) {
      const tags = prospect.attributes.tags;
      if (!Array.isArray(tags)) {
        continue;
      }

      for (const rawTag of tags) {
        const name = (rawTag ?? "").trim();
        if (!name) {
          continue;
        }
        tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
      }
    }

    const exhaustedByPageSize = prospects.length < pageSize;
    const exhaustedByCount =
      totalProspects !== null && fetchedProspects >= totalProspects;
    if (exhaustedByPageSize || exhaustedByCount) {
      break;
    }
  }

  const complete =
    totalProspects === null
      ? fetchedProspects === 0 || pagesFetched < maxPages
      : fetchedProspects >= totalProspects;

  const tags = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    tags,
    fetchedProspects,
    totalProspects,
    pagesFetched,
    complete,
  };
}

export interface OwnerProspectLoad {
  ownerId: string;
  prospectCount: number | null;
  sampleProspectId: string | null;
  lastProspectTouchedAt: string | null;
  lastProspectUpdatedAt: string | null;
  filterUsed: string | null;
}

/**
 * Fetch lightweight load signals for a given Outreach owner/user.
 *
 * This is intended for assignment workflows where we need:
 * - total owned prospects
 * - recency of latest touched prospect
 */
export async function getOwnerProspectLoad(options: {
  ownerId: string | number;
  userId?: string;
  preferOAuth?: boolean;
}): Promise<OwnerProspectLoad> {
  const ownerId = String(options.ownerId);
  const filterCandidates: Array<Record<string, string>> = [
    // Preferred JSON:API relationship filter style.
    { "owner][id": ownerId }, // -> filter[owner][id]
    // Potential alternate field syntaxes.
    { ownerId },
    { ownerIds: ownerId },
  ];

  let lastError: unknown = null;

  for (const filters of filterCandidates) {
    try {
      const response = await getProspects({
        pageSize: 1,
        filters,
        sort: "-updatedAt",
        includeCount: true,
        userId: options.userId,
        preferOAuth: options.preferOAuth,
      });

      const sample = response.data[0];
      const filterUsed = Object.keys(filters)[0] ?? null;

      return {
        ownerId,
        prospectCount:
          typeof response.meta?.count === "number"
            ? response.meta.count
            : response.data.length,
        sampleProspectId: sample ? String(sample.id) : null,
        lastProspectTouchedAt: sample?.attributes.touchedAt ?? null,
        lastProspectUpdatedAt: sample?.attributes.updatedAt ?? null,
        filterUsed,
      };
    } catch (error) {
      lastError = error;
      if (error instanceof OutreachError && error.statusCode === 400) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw new OutreachError(
      `Owner prospect load failed: ${lastError instanceof Error ? lastError.message : "Unknown error"}`,
    );
  }

  throw new OutreachError("No valid owner filter candidate succeeded");
}

// =====================================================
// PROSPECT CRUD OPERATIONS
// =====================================================

/**
 * Search for a prospect by email address.
 *
 * Uses Outreach's filter[emails] parameter to find an exact match.
 * Returns the first matching prospect, or null if not found.
 */
export async function searchProspectByEmail(
  email: string,
): Promise<Prospect | null> {
  if (!isOutreachConfigured) {
    throw new OutreachError("Outreach is not configured");
  }

  console.log(`🔍 [Outreach] Searching prospect by email: ${email}`);

  const response = await outreachRequest<ProspectsResponse>(
    `/prospects?filter[emails]=${encodeURIComponent(email)}&page[limit]=1&page[offset]=0`,
    { method: "GET" },
  );

  if (response.data.length === 0) {
    console.log(`⚠️ [Outreach] No prospect found for ${email}`);
    return null;
  }

  const prospect = response.data[0]!;
  console.log(
    `✅ [Outreach] Found prospect ${prospect.id} for ${email}`,
  );
  return prospect;
}

/**
 * Create a new prospect in Outreach.
 *
 * Uses JSON:API format. Stage and owner are set via relationships.
 */
export async function createProspect(params: {
  attributes: Record<string, unknown>;
  stageId?: number;
  ownerId?: number;
}): Promise<Prospect> {
  if (!isOutreachConfigured) {
    throw new OutreachError("Outreach is not configured");
  }

  console.log("➕ [Outreach] Creating new prospect");

  // Build relationships
  const relationships: Record<string, unknown> = {};

  if (params.stageId) {
    relationships.stage = {
      data: { type: "stage", id: params.stageId },
    };
  }

  if (params.ownerId) {
    relationships.owner = {
      data: { type: "user", id: params.ownerId },
    };
  }

  const body: Record<string, unknown> = {
    data: {
      type: "prospect",
      attributes: params.attributes,
      ...(Object.keys(relationships).length > 0
        ? { relationships }
        : {}),
    },
  };

  const response = await outreachRequest<ProspectResponse>(
    "/prospects",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  console.log(
    `✅ [Outreach] Created prospect ${response.data.id}`,
  );
  return response.data;
}

/**
 * Update an existing prospect in Outreach.
 *
 * Uses PATCH with JSON:API format. Only updates provided attributes.
 * Stage and owner can be updated via relationships.
 */
export async function updateProspect(
  prospectId: string | number,
  params: {
    attributes: Record<string, unknown>;
    stageId?: number;
    ownerId?: number;
  },
): Promise<Prospect> {
  if (!isOutreachConfigured) {
    throw new OutreachError("Outreach is not configured");
  }

  console.log(`✏️ [Outreach] Updating prospect ${prospectId}`);

  // Build relationships
  const relationships: Record<string, unknown> = {};

  if (params.stageId) {
    relationships.stage = {
      data: { type: "stage", id: params.stageId },
    };
  }

  if (params.ownerId) {
    relationships.owner = {
      data: { type: "user", id: params.ownerId },
    };
  }

  const body: Record<string, unknown> = {
    data: {
      type: "prospect",
      id: prospectId,
      attributes: params.attributes,
      ...(Object.keys(relationships).length > 0
        ? { relationships }
        : {}),
    },
  };

  const response = await outreachRequest<ProspectResponse>(
    `/prospects/${prospectId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );

  console.log(
    `✅ [Outreach] Updated prospect ${response.data.id}`,
  );
  return response.data;
}

// =====================================================
// ERROR HANDLING
// =====================================================

/**
 * Custom error class for Outreach API errors
 */
export class OutreachError extends Error {
  public readonly statusCode?: number;
  public readonly isRateLimited: boolean;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      isRateLimited?: boolean;
      retryAfter?: number;
    },
  ) {
    super(message);
    this.name = "OutreachError";
    this.statusCode = options?.statusCode;
    this.isRateLimited = options?.isRateLimited ?? false;
    this.retryAfter = options?.retryAfter;
  }
}

/**
 * Type guard for OutreachError
 */
export function isOutreachError(error: unknown): error is OutreachError {
  return error instanceof OutreachError;
}

// =====================================================
// TYPES
// =====================================================

/**
 * Outreach API response types (JSON:API format)
 */

export interface OutreachProspect {
  id: string;
  type: "prospect";
  attributes: {
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    emails: string[];
    tags?: string[];
    title: string | null;
    company: string | null;
    createdAt: string;
    updatedAt: string;
    touchedAt?: string | null;
  };
  relationships?: Record<string, unknown>;
}

export interface OutreachProspectsResponse {
  data: OutreachProspect[];
  links?: {
    first?: string;
    last?: string;
    next?: string;
    prev?: string;
  };
  meta?: {
    count?: number;
  };
}
