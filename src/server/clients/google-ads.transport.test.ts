import { describe, expect, test } from "bun:test";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import {
  createGoogleAdsTransport,
  googleAdsAuthMode,
} from "./google-ads.transport";

const oauth = {
  developerToken: "developer-secret",
  loginCustomerId: "123-456-7890",
  clientId: "oauth-client",
  clientSecret: "oauth-secret",
  refreshToken: "refresh-secret",
};

describe("Google Ads server authentication", () => {
  test("service identity signs only the Ads scope and queries through the configured manager", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    const config = {
      ...oauth,
      serviceAccountJson: JSON.stringify({
        type: "service_account",
        client_email: "growth@example.iam.gserviceaccount.com",
        private_key: await exportPKCS8(keys.privateKey),
      }),
    };
    const request = (async (url, init) => {
      if (
        (typeof url === "string"
          ? url
          : url instanceof URL
            ? url.href
            : url.url) === "https://oauth2.googleapis.com/token"
      ) {
        if (!(init?.body instanceof URLSearchParams))
          throw new Error("Expected form body");
        const body = init.body;
        const { payload } = await jwtVerify(
          body.get("assertion")!,
          keys.publicKey,
          {
            issuer: "growth@example.iam.gserviceaccount.com",
            audience: "https://oauth2.googleapis.com/token",
          },
        );
        expect(payload.scope).toBe("https://www.googleapis.com/auth/adwords");
        expect(payload.sub).toBeUndefined();
        expect(body.has("refresh_token")).toBe(false);
        return Response.json({ access_token: "short-lived", expires_in: 3600 });
      }
      expect(
        typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
      ).toEndWith("/customers/9876543210/googleAds:searchStream");
      const headers = new Headers(init?.headers);
      expect(headers.get("login-customer-id")).toBe("1234567890");
      expect(headers.get("authorization")).toBe("Bearer short-lived");
      expect(headers.get("developer-token")).toBe("developer-secret");
      return Response.json([
        { results: [{ customer: { id: "9876543210" } }] },
        {},
      ]);
    }) as typeof fetch;
    const client = createGoogleAdsTransport(config, request);
    expect(client.authMode).toBe("service_account");
    expect(
      await client.search("987-654-3210", "SELECT customer.id FROM customer"),
    ).toEqual([{ customer: { id: "9876543210" } }]);
  });

  test("invalid service credentials never fall back to a personal OAuth identity", async () => {
    const client = createGoogleAdsTransport({
      ...oauth,
      serviceAccountJson: "{secret-invalid-json",
    });
    const error = await client
      .search("1234567890", "SELECT customer.id FROM customer")
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Invalid Google Ads service account configuration",
    );
  });

  test("existing user OAuth remains supported and token failures do not expose provider bodies", async () => {
    const request = (async (_url, init) => {
      if (!(init?.body instanceof URLSearchParams))
        throw new Error("Expected form body");
      const body = init.body;
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe(oauth.refreshToken);
      return new Response("secret-provider-body", { status: 400 });
    }) as typeof fetch;
    const client = createGoogleAdsTransport(oauth, request);
    const error = await client
      .search("1234567890", "SELECT customer.id FROM customer")
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Google Ads OAuth request failed (400)",
    );
    expect(googleAdsAuthMode({ serviceAccountJson: "{}" })).toBeNull();
  });

  test("invalid customer IDs cannot alter the Google request path", async () => {
    const client = createGoogleAdsTransport(oauth);
    const error = await client
      .search("123/../../other", "SELECT customer.id FROM customer")
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Invalid Google Ads customer ID");
  });
});
