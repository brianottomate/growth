import { describe, expect, test } from "bun:test";

import { toSocialPostPreviewItem } from "./social-post-preview";

describe("social post preview model", () => {
  test("keeps the requested post identity and strips excess media", () => {
    const preview = toSocialPostPreviewItem({
      id: "pp_test",
      platform: "instagram",
      format: "image",
      status: "scheduled",
      text: "A caption",
      firstComment: null,
      scheduledAt: new Date("2026-08-26T16:00:00.000Z"),
      publishedAt: null,
      externalUrl: null,
      media: Array.from({ length: 12 }, (_, index) => ({
        type: "image" as const,
        url: `https://media.example/${index}.jpg`,
      })),
      brand: { name: "Wander", logo: null },
      channel: { displayName: "Wander", handle: "wander" },
      username: null,
    });

    expect(preview.id).toBe("pp_test");
    expect(preview.channel.handle).toBe("wander");
    expect(preview.scheduledAt).toBe("2026-08-26T16:00:00.000Z");
    expect(preview.media).toHaveLength(10);
    expect(preview.href).toBe("/app/feed-v5?post=pp_test");
  });

  test("falls back to the post username and safe empty copy", () => {
    const preview = toSocialPostPreviewItem({
      id: "pp_x",
      platform: "x",
      format: null,
      status: "draft",
      text: null,
      firstComment: null,
      scheduledAt: null,
      publishedAt: null,
      externalUrl: null,
      media: null,
      brand: null,
      channel: null,
      username: "wander",
    });

    expect(preview.text).toBe("");
    expect(preview.brand.name).toBe("Unknown brand");
    expect(preview.channel.handle).toBe("wander");
  });
});
