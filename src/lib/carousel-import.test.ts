import { describe, expect, test } from "bun:test";

import type { PlatformFormat } from "@/server/content/formats";

import {
  isSupportedCarouselImagePath,
  sortCarouselPaths,
  validateCarouselImport,
} from "./carousel-import";

const instagramCarousel: PlatformFormat = {
  id: "instagram.carousel",
  platform: "instagram",
  archetype: "carousel",
  label: "Carousel",
  media: {
    kinds: ["image"],
    min: 2,
    max: 10,
    aspectRatios: ["1:1", "4:5"],
  },
};

describe("carousel import", () => {
  test("naturally sorts nested folder and ZIP paths", () => {
    const sorted = sortCarouselPaths(
      ["deck/slide-10.png", "deck/slide-2.png", "deck/slide-1.png"],
      (path) => path,
    );
    expect(sorted).toEqual([
      "deck/slide-1.png",
      "deck/slide-2.png",
      "deck/slide-10.png",
    ]);
  });

  test("ignores metadata and non-image ZIP entries", () => {
    expect(isSupportedCarouselImagePath("deck/01-cover.png")).toBe(true);
    expect(isSupportedCarouselImagePath("deck/__MACOSX/._cover.png")).toBe(
      false,
    );
    expect(isSupportedCarouselImagePath("deck/.DS_Store")).toBe(false);
    expect(isSupportedCarouselImagePath("deck/notes.txt")).toBe(false);
  });

  test("enforces count and warns about platform cropping", () => {
    const tooSmall = validateCarouselImport({
      format: instagramCarousel,
      existingCount: 0,
      slides: [{ width: 1080, height: 1080 }],
    });
    expect(tooSmall.valid).toBe(false);
    expect(tooSmall.errors[0]).toContain("at least 1 more slide");

    const ready = validateCarouselImport({
      format: instagramCarousel,
      existingCount: 0,
      slides: [
        { width: 1080, height: 1080 },
        { width: 1920, height: 1080 },
      ],
    });
    expect(ready.valid).toBe(true);
    expect(ready.warnings[0]).toContain("may be cropped");
  });
});
