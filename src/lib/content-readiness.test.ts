import { describe, expect, test } from "bun:test";

import { getContentReadiness } from "./content-readiness";

const baseSpot = {
  source: "owned",
  platform: "linkedin",
  archetype: "text",
  text: "A finished LinkedIn draft",
  scheduledAt: "2026-07-14T12:00:00.000Z",
  mediaCount: 0,
  assetLinkCount: 0,
};

describe("getContentReadiness", () => {
  test("does not require media for a text rendering", () => {
    const result = getContentReadiness({
      hook: "A useful hook",
      status: "draft",
      spots: [baseSpot],
    });

    expect(result.readyForReview).toBe(true);
    expect(result.next?.id).toBe("review");
  });

  test("requires production media for image and video renderings", () => {
    const result = getContentReadiness({
      hook: "A useful hook",
      status: "draft",
      spots: [{ ...baseSpot, archetype: "video_long" }],
    });

    expect(result.readyForReview).toBe(false);
    expect(result.next?.id).toBe("production");
  });

  test("treats Story copy as internal notes while still requiring media", () => {
    const withoutMedia = getContentReadiness({
      hook: "A useful hook",
      status: "draft",
      spots: [{ ...baseSpot, archetype: "story", text: null }],
    });
    const withMedia = getContentReadiness({
      hook: "A useful hook",
      status: "draft",
      spots: [{ ...baseSpot, archetype: "story", text: null, mediaCount: 1 }],
    });

    expect(withoutMedia.next?.id).toBe("production");
    expect(withMedia.readyForReview).toBe(true);
  });

  test("recognizes an item already in review", () => {
    const result = getContentReadiness({
      hook: "A useful hook",
      status: "pending_review",
      spots: [{ ...baseSpot, archetype: "image", mediaCount: 1 }],
    });

    expect(result.completed).toBe(result.total);
    expect(result.next).toBeNull();
  });
});
