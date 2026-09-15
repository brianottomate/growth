import { describe, expect, test } from "bun:test";

import { placeStatement } from "./composition.service";

// The place card's headline is one statement on two lines, broken where the
// sense breaks: the hook, then the preposition with the place. Set by hand on
// the first review of the card and kept here so a layout change cannot move it.
describe("the place card's statement", () => {
  test("the preposition goes down with the place", () => {
    expect(
      placeStatement({
        formatId: "portrait",
        eyebrow: "A 4-bedroom villa sleeping 8 in",
        title: "Winter Park, CO",
      }),
    ).toEqual(["A 4-bedroom villa sleeping 8", "in Winter Park, CO"]);
  });

  test("a hook that ends without a preposition keeps the place alone on its line", () => {
    expect(
      placeStatement({
        formatId: "portrait",
        eyebrow: "Arcade games & firepit",
        title: "Winter Park, CO",
      }),
    ).toEqual(["Arcade games & firepit", "Winter Park, CO"]);
  });

  test("no hook is just the place", () => {
    expect(
      placeStatement({ formatId: "portrait", title: "Winter Park, CO" }),
    ).toEqual(["Winter Park, CO"]);
  });

  test("a long hook wraps before the place and never runs past three lines", () => {
    const lines = placeStatement({
      formatId: "portrait",
      eyebrow: "A ski-in, ski-out mountain condo with a private hot tub in",
      title: "Winter Park, CO",
    });
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.at(-1)).toBe("in Winter Park, CO");
  });
});
