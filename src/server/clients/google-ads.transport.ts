import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ADS_API_VERSION = "v25";
const serviceAccountSchema = z.object({
  type: z.literal("service_account"),
  client_email: z.email(),
  private_key: z.string().min(1),
});

export interface GoogleAdsConfig {
  developerToken?: string;
  loginCustomerId?: string;
  serviceAccountJson?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export function googleAdsAuthMode(config: GoogleAdsConfig) {
  if (!config.developerToken) return null;
  if (config.serviceAccountJson) return "service_account" as const;
  if (config.clientId && config.clientSecret && config.refreshToken)
    return "user_oauth" as const;
  return null;
}

export function googleAdsCustomerId(value: string): string {
  const id = value.replace(/-/g, "");
  if (!/^\d{10}$/.test(id)) throw new Error("Invalid Google Ads customer ID");
  return id;
}

/** Only status and request ID are exposed; upstream bodies can contain credentials. */
export class GoogleAdsRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string | null,
    stage: "OAuth" | "API",
  ) {
    super(`Google Ads ${stage} request failed (${status})`);
  }
}

/** A transport scoped to one credential set. Callers enforce brand/account authorization. */
export function createGoogleAdsTransport(
  config: GoogleAdsConfig,
  request: typeof fetch = fetch,
) {
  let cachedToken: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  async function exchangeToken(): Promise<string> {
    const mode = googleAdsAuthMode(config);
    if (!mode) throw new Error("Google Ads credentials are not configured");
    let body: URLSearchParams;
    if (mode === "service_account") {
      let credentials: z.infer<typeof serviceAccountSchema>;
      try {
        credentials = serviceAccountSchema.parse(
          JSON.parse(config.serviceAccountJson!),
        );
      } catch {
        throw new Error("Invalid Google Ads service account configuration");
      }
      let assertion: string;
      try {
        const key = await importPKCS8(credentials.private_key, "RS256");
        assertion = await new SignJWT({
          scope: "https://www.googleapis.com/auth/adwords",
        })
          .setProtectedHeader({ alg: "RS256" })
          .setIssuer(credentials.client_email)
          .setAudience(TOKEN_URL)
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(key);
      } catch {
        throw new Error("Invalid Google Ads service account signing key");
      }
      body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      });
    } else {
      body = new URLSearchParams({
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
        refresh_token: config.refreshToken!,
        grant_type: "refresh_token",
      });
    }
    const response = await request(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new GoogleAdsRequestError(response.status, null, "OAuth");
    const token = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
      })
      .safeParse(await response.json());
    if (!token.success) throw new Error("Invalid Google Ads OAuth response");
    cachedToken = {
      value: token.data.access_token,
      expiresAt: Date.now() + (token.data.expires_in - 60) * 1000,
    };
    return cachedToken.value;
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now())
      return cachedToken.value;
    pendingToken ??= exchangeToken().finally(() => {
      pendingToken = undefined;
    });
    return pendingToken;
  }

  async function call<T>(customerId: string, path: string, body: unknown) {
    const id = googleAdsCustomerId(customerId);
    const loginCustomerId = config.loginCustomerId
      ? googleAdsCustomerId(config.loginCustomerId)
      : undefined;
    const token = await accessToken();
    const response = await request(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${id}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": config.developerToken!,
          "Content-Type": "application/json",
          ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      if (response.status === 401) cachedToken = undefined;
      throw new GoogleAdsRequestError(
        response.status,
        response.headers.get("request-id"),
        "API",
      );
    }
    return (await response.json()) as T;
  }

  return {
    authMode: googleAdsAuthMode(config),
    async search<Row>(customerId: string, query: string): Promise<Row[]> {
      const batches = await call<Array<{ results?: Row[] }>>(
        customerId,
        "/googleAds:searchStream",
        { query },
      );
      return batches.flatMap((batch) => batch.results ?? []);
    },
    /** POST to a customer-scoped method, e.g. ":createCustomerClient". */
    post: call,
  };
}
