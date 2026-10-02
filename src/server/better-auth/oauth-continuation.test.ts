import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt, organization } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { needsOAuthWorkspace } from "./oauth-workspace";

test("OAuth advances from workspace selection to consent and rejects tampered requests", async () => {
  const origin = "http://localhost:3000";
  const store: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    [
      "user",
      "session",
      "account",
      "verification",
      "organization",
      "member",
      "invitation",
      "jwks",
      "oauthClient",
      "oauthConsent",
      "oauthAccessToken",
      "oauthRefreshToken",
    ].map((model) => [model, []]),
  );
  const auth = betterAuth({
    baseURL: origin,
    secret: "oauth-continuation-regression-test-secret",
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true },
    plugins: [
      organization(),
      jwt(),
      oauthProvider({
        loginPage: "/signin",
        consentPage: "/consent",
        scopes: ["openid", "growth:all"],
        validAudiences: [`${origin}/api/mcp`],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
        customAccessTokenClaims: async ({ referenceId }) => ({
          org_id: referenceId,
        }),
        postLogin: {
          page: "/oauth/workspace",
          shouldRedirect: (context) =>
            needsOAuthWorkspace(context, async (userId, organizationId) =>
              store.member?.some(
                (member) =>
                  member.userId === userId &&
                  member.organizationId === organizationId,
              ),
            ),
          consentReferenceId: ({ session }) =>
            session.activeOrganizationId as string | undefined,
        },
      }),
    ],
  });
  const cookies = new Map<string, string>();
  async function request(path: string, body?: unknown) {
    const response = await auth.handler(
      new Request(`${origin}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          "content-type":
            path === "/api/auth/oauth2/token"
              ? "application/x-www-form-urlencoded"
              : "application/json",
          cookie: [...cookies]
            .map(([key, value]) => `${key}=${value}`)
            .join("; "),
        },
        ...(body
          ? {
              body:
                path === "/api/auth/oauth2/token"
                  ? new URLSearchParams(
                      body as Record<string, string>,
                    ).toString()
                  : JSON.stringify(body),
            }
          : {}),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]!;
      const equals = pair.indexOf("=");
      cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    return response;
  }
  const signup = await request("/api/auth/sign-up/email", {
    name: "Operator",
    email: "operator@wander.com",
    password: "test-password-long-enough",
  });
  expect(signup.status).toBe(200);
  const created = await request("/api/auth/organization/create", {
    name: "Wander",
    slug: "wander",
  });
  const workspace = (await created.json()) as { id: string };
  expect(created.status).toBe(200);
  expect(
    (
      await request("/api/auth/organization/set-active", {
        organizationId: null,
      })
    ).status,
  ).toBe(200);
  const registered = await request("/api/auth/oauth2/register", {
    client_name: "Codex regression",
    redirect_uris: ["http://127.0.0.1:58439/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "openid growth:all",
  });
  const client = (await registered.json()) as { client_id: string };
  expect(registered.status).toBe(200);
  const query = new URLSearchParams({
    client_id: client.client_id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:58439/callback",
    scope: "openid growth:all",
    state: "regression-state",
    code_challenge: createHash("sha256")
      .update("a".repeat(43))
      .digest("base64url"),
    code_challenge_method: "S256",
    resource: `${origin}/api/mcp`,
  });
  const initial = await request(`/api/auth/oauth2/authorize?${query}`);
  const selector = new URL(initial.headers.get("location")!, origin);
  expect(selector.pathname).toBe("/oauth/workspace");
  const oauthQuery = selector.search.slice(1);
  const unselected = await request("/api/auth/oauth2/continue", {
    postLogin: true,
    oauth_query: oauthQuery,
  });
  const stillSelecting = (await unselected.json()) as {
    url?: string;
    redirect_uri?: string;
  };
  expect(
    new URL(stillSelecting.url ?? stillSelecting.redirect_uri!, origin)
      .pathname,
  ).toBe("/oauth/workspace");
  expect(
    (
      await request("/api/auth/organization/set-active", {
        organizationId: workspace.id,
      })
    ).status,
  ).toBe(200);
  const continued = await request("/api/auth/oauth2/continue", {
    postLogin: true,
    oauth_query: oauthQuery,
  });
  const result = (await continued.json()) as {
    url?: string;
    redirect_uri?: string;
  };
  expect(continued.status).toBe(200);
  expect(new URL(result.url ?? result.redirect_uri!, origin).pathname).toBe(
    "/consent",
  );
  const tampered = await request("/api/auth/oauth2/continue", {
    postLogin: true,
    oauth_query: oauthQuery.replace("regression-state", "tampered-state"),
  });
  expect(tampered.status).toBe(400);
  const consentUrl = new URL(result.url ?? result.redirect_uri!, origin);
  const consent = await request("/api/auth/oauth2/consent", {
    accept: true,
    oauth_query: consentUrl.search.slice(1),
  });
  const approved = (await consent.json()) as {
    url?: string;
    redirect_uri?: string;
  };
  expect(consent.status).toBe(200);
  const callback = new URL(approved.url ?? approved.redirect_uri!, origin);
  expect(callback.searchParams.get("state")).toBe("regression-state");
  const tokenResponse = await request("/api/auth/oauth2/token", {
    grant_type: "authorization_code",
    client_id: client.client_id,
    code: callback.searchParams.get("code"),
    code_verifier: "a".repeat(43),
    redirect_uri: query.get("redirect_uri"),
    resource: `${origin}/api/mcp`,
  });
  const token = (await tokenResponse.json()) as { access_token: string };
  expect(tokenResponse.status).toBe(200);
  const claims = JSON.parse(
    Buffer.from(token.access_token.split(".")[1]!, "base64url").toString(),
  ) as {
    org_id: string;
    aud: string | string[];
  };
  expect(claims.org_id).toBe(workspace.id);
  expect([claims.aud].flat()).toContain(`${origin}/api/mcp`);
});
