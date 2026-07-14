import { describe, expect, test } from "bun:test";

import {
  formatCountsTowardCadence,
  getPlatformFormat,
  validateSpot,
} from "./formats";

describe("email content formats", () => {
  test("models a blast as a newsletter-surface one-off", () => {
    const blast = getPlatformFormat("newsletter.blast");
    expect(blast?.platform).toBe("newsletter");
    expect(blast?.archetype).toBe("article");
    expect(blast?.label).toBe("Email Blast");
    expect(blast?.countsTowardCadence).toBe(false);

    const validation = validateSpot({
      platform: "newsletter",
      format: "newsletter.blast",
      archetype: "article",
    });
    expect(validation.ok).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  test("keeps newsletter issues and legacy values in recurring cadence", () => {
    expect(formatCountsTowardCadence("newsletter.blast")).toBe(false);
    expect(formatCountsTowardCadence("newsletter.broadcast")).toBe(true);
    expect(formatCountsTowardCadence("newsletter")).toBe(true);
    expect(formatCountsTowardCadence(null)).toBe(true);
  });
});
