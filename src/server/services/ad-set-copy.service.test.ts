import { expect, test } from "bun:test";

import { deterministicSetCopy } from "./ad-set-copy.service";

const lake = {
  name: "Lake House",
  place: "Logan, OH",
  bedrooms: 4,
  bathrooms: 3,
  guests: 12,
  nightlyFrom: null,
  amenities: [],
  description: null,
};

test("the fallback set copy writes descriptions from the facts", () => {
  const one = deterministicSetCopy([lake], "Hollyhock");
  expect(one.homes[0]!.description).toBe("4 bedrooms · 3 baths · sleeps 12");
  expect(one.portfolioDescription).toBe("4 bedrooms · 3 baths · sleeps 12");
  const two = deterministicSetCopy(
    [lake, { ...lake, name: "Barn", guests: 8 }],
    "Hollyhock",
  );
  expect(two.portfolioDescription).toBe("2 homes · sleep up to 12");
});
