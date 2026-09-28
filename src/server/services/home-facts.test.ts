import { describe, expect, it } from "bun:test";

import { centsToDollars } from "@/server/clients/wanderos-site.client";

import { homeFacts } from "./home-facts";

const home = {
  id: "12",
  slug: "arrow",
  name: "Arrow Rooftop Villa",
  url: "https://winterparkescapes.com/property/12/arrow",
  imageUrl: "https://assets.wander.com/arrow.webp",
  bedrooms: 3,
  city: "Winter Park",
  state: "CO",
  country: "US",
  nightlyFrom: 249,
};

describe("nightly rate", () => {
  it("reads the feed's cents as dollars", () => {
    // The feed quotes 24900 for a $249 night. Passing that through unconverted
    // would put a home in a catalog at $24,900.
    expect(centsToDollars(24900)).toBe(249);
    expect(centsToDollars(55036)).toBe(550);
  });

  it("treats absent and zero alike", () => {
    // A home with no bookable dates quotes nothing, and a zero would advertise
    // a free stay.
    expect(centsToDollars(undefined)).toBeUndefined();
    expect(centsToDollars(0)).toBeUndefined();
  });
});

describe("the facts line on a catalog card", () => {
  it("counts what the feed gave, in the order a guest reads them", () => {
    expect(homeFacts({ ...home, bathrooms: 2, guests: 8 })).toBe(
      "3 bedrooms · 2 baths · 8 guests",
    );
    expect(homeFacts({ ...home, bedrooms: 1, bathrooms: 1, guests: 2 })).toBe(
      "1 bedroom · 1 bath · 2 guests",
    );
  });

  it("says nothing rather than inventing a count", () => {
    expect(homeFacts({ ...home, bedrooms: undefined })).toBe("");
  });
});
