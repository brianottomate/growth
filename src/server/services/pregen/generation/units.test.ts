import { describe, expect, it } from "bun:test";

import { toGalleryUnits } from "./units";

// The mapping from ranked candidates to a card is where two independent
// failures land: an image the vision pass rejected, and an image that could not
// be fetched or prepared for R2. Both arrive the same way — absent from the
// hosted map — and neither may cost a card slot that a later candidate could
// have filled.

const property = (name: string, imageUrls: string[]) => ({
  name,
  imageUrls,
  price: null,
  rating: null,
  reviewCount: null,
  features: null,
});

const hosted = (pairs: Array<[string, string]>) => new Map(pairs);

describe("toGalleryUnits", () => {
  it("backfills past a missing image instead of losing a card slot", () => {
    const units = toGalleryUnits(
      [property("Ocean Suite", ["wordmark.png", "a.jpg", "b.jpg", "c.jpg"])],
      hosted([
        ["a.jpg", "https://cdn/a.jpg"],
        ["b.jpg", "https://cdn/b.jpg"],
        ["c.jpg", "https://cdn/c.jpg"],
      ]),
    );

    expect(units[0]?.imageUrls).toEqual([
      "https://cdn/a.jpg",
      "https://cdn/b.jpg",
      "https://cdn/c.jpg",
    ]);
  });

  it("shows at most three images even when a fourth survived", () => {
    const units = toGalleryUnits(
      [property("Ocean Suite", ["a.jpg", "b.jpg", "c.jpg", "d.jpg"])],
      hosted([
        ["a.jpg", "https://cdn/a.jpg"],
        ["b.jpg", "https://cdn/b.jpg"],
        ["c.jpg", "https://cdn/c.jpg"],
        ["d.jpg", "https://cdn/d.jpg"],
      ]),
    );

    expect(units[0]?.imageUrls).toHaveLength(3);
  });

  it("drops a unit whose every image is missing rather than render an empty card", () => {
    const units = toGalleryUnits(
      [
        property("All Logos", ["wordmark.png", "badge.png"]),
        property("Real", ["a.jpg"]),
      ],
      hosted([["a.jpg", "https://cdn/a.jpg"]]),
    );

    expect(units.map((unit) => unit.name)).toEqual(["Real"]);
  });
});
