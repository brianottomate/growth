import { expect, test } from "bun:test";

import { extractedCardsSchema } from "./schemas";

// A photo-selection rewrite must keep the transcription evidence intact.
test("photo edits preserve extraction evidence when writing the JSON back", () => {
  const evidence = {
    homeId: "home_1",
    home: "Test cabin",
    headline: "A cabin in the woods",
    photoUrl: null,
    rating: "4.9",
    pills: ["Hot tub", "Fire pit"],
    photoShows: "A cabin beside trees",
  };
  const [card] = extractedCardsSchema.parse([evidence]);
  if (!card) throw new Error("Missing parsed card");
  card.photoUrl = "https://example.com/cabin.jpg";
  card.photoNumber = 2;
  const [saved] = extractedCardsSchema.parse(
    JSON.parse(JSON.stringify([card])),
  );
  expect(saved).toMatchObject({
    ...evidence,
    photoUrl: card.photoUrl,
    photoNumber: 2,
  });
});

test("malformed card identity and crop are rejected before downstream writes", () => {
  expect(
    extractedCardsSchema.safeParse([{ home: "Cabin", headline: "Cabin" }])
      .success,
  ).toBe(false);
  expect(
    extractedCardsSchema.safeParse([
      {
        homeId: "home_1",
        home: "Cabin",
        headline: "Cabin",
        imagePosition: "invalid",
      },
    ]).success,
  ).toBe(false);
});
