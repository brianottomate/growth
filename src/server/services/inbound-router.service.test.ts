import { describe, expect, test } from "bun:test";

import { resolveOnboardingSlackHeadline } from "./inbound-router.service";

describe("resolveOnboardingSlackHeadline", () => {
  /**
   * CORE-5029: the business-step forward fires pre-auth, before an org
   * exists, and sends no onboardingComplete flag. Before this distinguished
   * "just started" from "stuck", that fell into the same branch as a lead
   * stuck for 10+ minutes and posted "Stuck in Onboarding" on a brand-new
   * signup that hadn't even created an org yet.
   */
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
