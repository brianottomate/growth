import { describe, expect, test } from "bun:test";

import { amenitySource, rankAmenities } from "./home-amenities";

describe("home amenities", () => {
  test("utilities never headline, selling amenities rank first", () => {
    expect(
      rankAmenities([
        "Wifi",
        "Dishes",
        "Fire place",
        "Hot tub",
        "Game Room",
      ]).map((row) => row.hook),
    ).toEqual(["Hot tub", "Game room", "Cozy fireplace"]);
  });

  // A card that promises a hot tub the home lacks is a refund, so the
  // description only vouches for what it plainly says is in the home.
  test("a description only vouches for in-home features it plainly names", () => {
    const description = [
      "A spa inspired primary suite serves as a private retreat.",
      "Minutes from the beachfront and the ski-in lifts.",
      "There is no hot tub.",
      "A private rooftop deck with lounge seating and a fire pit.",
    ].join(" ");
    expect(amenitySource([], description)).toEqual([
      "Rooftop deck",
      "Fire pit",
    ]);
  });

  test("the listing's own labels win over its description", () => {
    expect(amenitySource(["Sauna"], "A rooftop deck.")).toEqual(["Sauna"]);
  });
});
