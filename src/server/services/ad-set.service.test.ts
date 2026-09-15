import { describe, expect, it } from "bun:test";

import { storyTwinOfPreview } from "./ad-set.service";

// A built set's cards are preview URLs; their story is the same spec one
// parameter over. A frozen file has no twin and must go through a render,
// an extend or a crop instead.
describe("the story twin of a preview card", () => {
  it("swaps the canvas and keeps everything else", () => {
    const twin = storyTwinOfPreview(
      "/api/compositions/preview?brandId=b1&templateId=catalog-place&formatId=square&title=Arrow&mark=none",
    );
    expect(twin).toContain("formatId=story");
    expect(twin).toContain("templateId=catalog-place");
    expect(twin).toContain("title=Arrow");
    expect(twin?.startsWith("/api/compositions/preview?")).toBe(true);
  });

  it("gives nothing for a file", () => {
    expect(
      storyTwinOfPreview("https://pub.r2.dev/brand/media/hero.png"),
    ).toBeNull();
  });
});
