import { describe, expect, test } from "bun:test";
import { candidateImageUrls } from "./media-review";
describe("website photo candidates", () => {
  test("removes obvious interface assets, malformed URLs, and insecure images", () => {
    expect(
      candidateImageUrls([
        "https://site.test/photos/pool.jpg",
        "https://site.test/favicon.png",
        "https://site.test/logo.webp",
        "https://site.test/icon-bed.png",
        "http://site.test/room.jpg",
        "broken",
      ]),
    ).toEqual(["https://site.test/photos/pool.jpg"]);
  });
  test("deduplicates fragments without collapsing distinct CDN source photos", () => {
    expect(
      candidateImageUrls([
        "https://cdn.test/image?src=pool.jpg#first",
        "https://cdn.test/image?src=pool.jpg#second",
        "https://cdn.test/image?src=bedroom.jpg",
      ]),
    ).toEqual([
      "https://cdn.test/image?src=pool.jpg",
      "https://cdn.test/image?src=bedroom.jpg",
    ]);
  });
  test("bounds the review inbox per scraped page", () =>
    expect(
      candidateImageUrls(
        Array.from(
          { length: 100 },
          (_, i) => `https://site.test/photos/${i}.jpg`,
        ),
      ),
    ).toHaveLength(40));
});
