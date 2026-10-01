import { expect, test } from "bun:test";

import {
  deterministicSetCopy,
  adSetCopyRequest,
  adSetVariationProblem,
} from "./ad-set-copy.service";

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

test("repeated Write copy rejects an unchanged hook and accepts a different supported angle", async () => {
  const current = deterministicSetCopy([lake], "Hollyhock");
  const request = await adSetCopyRequest({
    brandName: "Hollyhock",
    brandStory: "Warm, specific copy",
    homes: [lake],
    regenerate: true,
    existingAds: [
      {
        homeIndex: 0,
        format: "static",
        headline: current.homes[0]!.headline,
        body: current.homes[0]!.primaryText,
        artwork: [{ title: "A weekend together" }],
      },
    ],
  });
  expect(request.problem?.(current)).toContain("repeats");
  const alternative = {
    ...current,
    homes: [
      {
        ...current.homes[0]!,
        headline: "Room for your whole crew",
        primaryText:
          "Bring the crew to Logan 🏡\nFour bedrooms and three baths, with room for twelve.",
      },
    ],
  };
  expect(request.problem?.(alternative)).toBeNull();
  expect(JSON.stringify(request.content)).toContain("A weekend together");
  expect(request.system).toContain("Existing artwork stays fixed");
});

test("collection rewrites also reject their current hook without forcing factual descriptions to change", () => {
  const current = deterministicSetCopy([lake], "Hollyhock");
  expect(
    adSetVariationProblem(current, [
      {
        homeIndex: null,
        format: "catalog",
        headline: current.catalogHeadline,
        body: current.catalogPrimaryText,
      },
    ]),
  ).toContain("repeats");
  expect(
    adSetVariationProblem(
      {
        ...current,
        catalogHeadline: "Make room for a weekend together",
        catalogPrimaryText:
          "Bring everyone to Logan 🏡\nBook direct with Hollyhock.",
      },
      [
        {
          homeIndex: null,
          format: "catalog",
          headline: current.catalogHeadline,
          body: current.catalogPrimaryText,
        },
      ],
    ),
  ).toBeNull();
});
