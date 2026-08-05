import { describe, expect, it } from "bun:test";

import { buildClaimUrl, sourceDomainOf } from "./claim";

// The claim URL is a cross-repo contract (app.wander.com onboarding v3 reads
// these exact params), so the param names are the thing worth protecting.

const base = {
  appBaseUrl: "https://app.wander.com",
  businessName: "Cascadia Getaways",
  website: "https://cascadiagetaways.com",
};

describe("buildClaimUrl", () => {
  it("carries claim params through the auth redirect for a monolith prospect", () => {
    const url = new URL(
      buildClaimUrl({
        ...base,
        identity: { kind: "monolith", websiteId: "web_123", token: "tok_abc" },
      }),
    );

    expect(url.origin).toBe("https://app.wander.com");
    expect(url.pathname).toBe("/auth/");

    const redirect = new URLSearchParams(
      (url.searchParams.get("redirect") ?? "").split("?")[1],
    );
    expect(redirect.get("claimWebsiteId")).toBe("web_123");
    expect(redirect.get("claimToken")).toBe("tok_abc");
    expect(redirect.get("intent")).toBe("build_brand");
    expect(redirect.get("businessName")).toBe("Cascadia Getaways");
  });

  it("omits claim params when nothing can be attached", () => {
    const url = new URL(
      buildClaimUrl({
        ...base,
        identity: { kind: "unclaimable", reason: "growth-native preview" },
      }),
    );

    const redirect = new URLSearchParams(
      (url.searchParams.get("redirect") ?? "").split("?")[1],
    );
    expect(redirect.get("claimWebsiteId")).toBeNull();
    expect(redirect.get("claimToken")).toBeNull();
    // Still a useful sign-up: the business is prefilled either way.
    expect(redirect.get("businessName")).toBe("Cascadia Getaways");
  });
});

describe("sourceDomainOf", () => {
  it("strips www and tolerates junk", () => {
    expect(sourceDomainOf("https://www.cascadiagetaways.com/homes")).toBe(
      "cascadiagetaways.com",
    );
    expect(sourceDomainOf(undefined)).toBeUndefined();
    expect(sourceDomainOf("not a url")).toBeUndefined();
  });
});
