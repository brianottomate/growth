import { describe, expect, test } from "bun:test";

import { isDevLoginAllowed } from "./dev-login-access";

const ADMIN = "a".repeat(32);
const BASE = "https://growth-git-x-wanderdev.vercel.app/api/dev/login";

function request(init?: { headers?: Record<string, string>; query?: string }) {
  return new Request(`${BASE}${init?.query ?? ""}`, { headers: init?.headers });
}

const preview = {
  nodeEnv: "production",
  vercelEnv: "preview",
  adminToken: ADMIN,
};

describe("dev login gate", () => {
  test("local dev is open without a token", () => {
    const env = {
      nodeEnv: "development",
      vercelEnv: undefined,
      adminToken: ADMIN,
    };
    expect(isDevLoginAllowed(request(), env)).toBe(true);
  });

  test("preview requires the admin token", () => {
    expect(isDevLoginAllowed(request(), preview)).toBe(false);
    expect(
      isDevLoginAllowed(
        request({ headers: { authorization: `Bearer ${"b".repeat(32)}` } }),
        preview,
      ),
    ).toBe(false);
  });

  test("preview accepts the token as bearer, query, or x-admin-token", () => {
    expect(
      isDevLoginAllowed(
        request({ headers: { authorization: `Bearer ${ADMIN}` } }),
        preview,
      ),
    ).toBe(true);
    expect(
      isDevLoginAllowed(request({ query: `?token=${ADMIN}` }), preview),
    ).toBe(true);
    expect(
      isDevLoginAllowed(
        request({ headers: { "x-admin-token": ADMIN } }),
        preview,
      ),
    ).toBe(true);
  });

  test("production is closed even with a valid token", () => {
    const env = { ...preview, vercelEnv: "production" };
    expect(
      isDevLoginAllowed(
        request({ headers: { authorization: `Bearer ${ADMIN}` } }),
        env,
      ),
    ).toBe(false);
  });

  test("non-Vercel production builds are closed", () => {
    const env = {
      nodeEnv: "production",
      vercelEnv: undefined,
      adminToken: ADMIN,
    };
    expect(isDevLoginAllowed(request({ query: `?token=${ADMIN}` }), env)).toBe(
      false,
    );
  });

  test("a preview with no admin token configured stays closed", () => {
    const env = { ...preview, adminToken: undefined };
    expect(isDevLoginAllowed(request({ query: "?token=" }), env)).toBe(false);
  });
});
