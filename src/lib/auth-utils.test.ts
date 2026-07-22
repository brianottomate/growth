import { describe, expect, test } from "bun:test";

import {
  getAuthPageHref,
  getCallbackURL,
  getSafeInternalPath,
} from "./auth-utils";

describe("auth return paths", () => {
  test("accepts internal paths and rejects external or protocol-relative URLs", () => {
    expect(getSafeInternalPath("/app/campaigns?id=abc#results")).toBe(
      "/app/campaigns?id=abc#results",
    );
    expect(getSafeInternalPath("https://example.com/app")).toBeNull();
    expect(getSafeInternalPath("//example.com/app")).toBeNull();
  });

  test("keeps safe context between auth pages", () => {
    const params = new URLSearchParams({
      email: "operator@wander.com",
      returnTo: "/app/apps/storefront_1?tab=preview",
      redirect: "https://example.com",
    });

    expect(getAuthPageHref("/signup", params)).toBe(
      "/signup?email=operator%40wander.com&returnTo=%2Fapp%2Fapps%2Fstorefront_1%3Ftab%3Dpreview",
    );
  });

  test("uses a safe fallback for external callback parameters", () => {
    expect(
      getCallbackURL(
        new URLSearchParams({ redirect: "https://example.com/phish" }),
      ),
    ).toBe("/app");
    expect(
      getCallbackURL(
        new URLSearchParams({ callbackUrl: "//example.com/phish" }),
        { isNewSignup: true },
      ),
    ).toBe("/app/onboarding");
  });
});
