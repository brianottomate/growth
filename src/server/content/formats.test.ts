import { describe, expect, test } from "bun:test";

import {
  classifyFormatFromFields,
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

describe("facebook formats", () => {
  test("a multi-photo Page post is a carousel spot", () => {
    const carousel = getPlatformFormat("facebook.carousel");
    expect(carousel?.archetype).toBe("carousel");
    expect(carousel?.media.min).toBe(2);
    expect(carousel?.media.max).toBe(10);
    expect(
      validateSpot({ platform: "facebook", format: "facebook.carousel" }).ok,
    ).toBe(true);
  });

  test("classifies Zernio media types and scraped attachments", () => {
    expect(
      classifyFormatFromFields("facebook", { media_type: "carousel" }).format,
    ).toBe("facebook.carousel");
    expect(
      classifyFormatFromFields("facebook", { media_type: "image" }).format,
    ).toBe("facebook.image");
    expect(
      classifyFormatFromFields("facebook", {
        attachments: [{ type: "photo" }, { type: "photo" }],
      }).format,
    ).toBe("facebook.carousel");
    expect(
      classifyFormatFromFields("facebook", { attachments: [{ type: "photo" }] })
        .format,
    ).toBe("facebook.image");
  });
});
