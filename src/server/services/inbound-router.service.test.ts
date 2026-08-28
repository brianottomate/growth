import { describe, expect, test } from "bun:test";

import { resolveOnboardingSlackHeadline } from "./inbound-router.service";

describe("resolveOnboardingSlackHeadline", () => {
  test("a pre-auth lead with no org yet reads as started, not stuck", () => {
    expect(resolveOnboardingSlackHeadline(undefined, undefined)).toBe(
      ":wander: *New Onboarding Started*",
    );
  });

  test("an org that exists but hasn't finished onboarding reads as stuck", () => {
    expect(resolveOnboardingSlackHeadline(false, "org_123")).toBe(
      ":wander: *New Lead Stuck in Onboarding*",
    );
    expect(resolveOnboardingSlackHeadline(undefined, "org_123")).toBe(
      ":wander: *New Lead Stuck in Onboarding*",
    );
  });

  test("onboardingComplete wins regardless of orgId", () => {
    expect(resolveOnboardingSlackHeadline(true, "org_123")).toBe(
      ":wander: *New Onboarding Completed*",
    );
    expect(resolveOnboardingSlackHeadline(true, undefined)).toBe(
      ":wander: *New Onboarding Completed*",
    );
  });
});
