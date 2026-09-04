import { describe, expect, it } from "bun:test";

import { centsToDollars } from "@/server/clients/wanderos-site.client";

import { catalogFeedRow, homeFacts, homeSubtitle } from "./property-ads.service";

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

describe("catalog feed rows", () => {
  it("quotes the price the way Meta reads it", () => {
    expect(catalogFeedRow(home, "Winter Park Escapes")).toEqual({
      id: "12",
      title: "Arrow Rooftop Villa",
      description: "3 bd · Winter Park, Colorado",
      availability: "in stock",
      condition: "new",
      price: "249.00 USD",
      link: "https://winterparkescapes.com/property/12/arrow",
      image_link: "https://assets.wander.com/arrow.webp",
      brand: "Winter Park Escapes",
    });
  });

  it("drops a home that cannot be a row rather than inventing one", () => {
    // Both fields are required by Meta. A missing price is ordinary — it means
    // the home has no bookable dates in the sampled window — so this is a skip,
    // not an error.
    expect(
      catalogFeedRow({ ...home, nightlyFrom: undefined }, "Brand"),
    ).toBeNull();
    expect(
      catalogFeedRow({ ...home, imageUrl: undefined }, "Brand"),
    ).toBeNull();
  });
});

describe("what the card says under the name", () => {
  it("spells the state out, because a card is read not parsed", () => {
    expect(homeSubtitle(home)).toBe("3 bd · Winter Park, Colorado");
  });

  it("keeps an unrecognised code rather than dropping the place", () => {
    expect(homeSubtitle({ ...home, state: "XX" })).toBe(
      "3 bd · Winter Park, XX",
    );
  });

  it("says nothing when the feed gave nothing", () => {
    expect(
      homeSubtitle({
        ...home,
        bedrooms: undefined,
        city: undefined,
        state: undefined,
      }),
    ).toBe("");
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
