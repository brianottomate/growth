import { expect, test } from "bun:test";
import { generatedDocument, type GeneratedHome } from "./starter-ad-generation";

const home = {
  id: "home",
  name: "Lake house",
  url: "https://example.com/home",
  photos: [
    { url: "https://example.com/1.jpg" },
    {
      url: "https://example.com/2.jpg",
      homeId: "home",
      label: "Lake house · Photo 2",
    },
  ],
};
const layout = {
  templateId: "image-hero" as const,
  title: "Room to unwind",
  subtitle: "Lake house",
  imagePosition: "center" as const,
};
const generated: GeneratedHome = {
  copy: { headline: "A lakeside escape", body: "Find your next getaway." },
  cards: [
    {
      photoIndex: 2,
      layout,
      storyLayout: { ...layout, title: "Unwind by the lake" },
    },
    { photoIndex: 1, layout, storyLayout: layout },
  ],
};

test("generated statics and carousels share copy and use selected real photos with editable story layouts", () => {
  const placements = ["facebook-feed", "instagram-story"] as const;
  const carousel = generatedDocument(
    home,
    generated,
    [...placements],
    "carousel",
  );
  const single = generatedDocument(home, generated, [...placements], "static");
  expect(single.copy).toEqual(carousel.copy);
  expect(single.exportShapes).toEqual(["portrait", "square", "story", "wide"]);
  expect(carousel.exportShapes).toEqual(single.exportShapes);
  expect(single.cards).toHaveLength(1);
  expect(carousel.cards.map((c) => c.source.url)).toEqual([
    home.photos[1]!.url,
    home.photos[0]!.url,
  ]);
  expect(carousel.cards[0]?.source.label).toBe("Lake house · Photo 2");
  expect(carousel.cards[0]?.source.homeId).toBe("home");
  expect(carousel.pool?.[1]?.label).toBe("Lake house · Photo 2");
  expect(carousel.cards[0]?.mode).toBe("compose");
  expect(carousel.cards[0]?.overrides.story?.title).toBe("Unwind by the lake");
  expect(carousel.shapes).toEqual(["portrait", "story"]);
  expect(carousel.intendedPlacements).toEqual([...placements]);
  expect(carousel.copy.linkUrl).toBe(home.url);
});
test("feed-only requests do not imply vertical creative support", () => {
  const doc = generatedDocument(
    home,
    generated,
    ["instagram-feed"],
    "carousel",
  );
  expect(doc.shapes).toEqual(["portrait"]);
  expect(doc.cards[0]?.overrides).toEqual({});
});
test("a generated reference cannot select a photo outside the home contact sheet", () => {
  expect(() =>
    generatedDocument(
      home,
      { ...generated, cards: [{ ...generated.cards[0]!, photoIndex: 99 }] },
      ["facebook-feed"],
      "static",
    ),
  ).toThrow("not in");
});

test("starter compositions follow ad roles instead of model-selected templates", () => {
  const threeCards = {
    ...generated,
    cards: [...generated.cards, generated.cards[0]!],
  };
  const carousel = generatedDocument(
    home,
    threeCards,
    ["facebook-feed", "instagram-story"],
    "carousel",
  );
  expect(carousel.cards.map((card) => card.recipe.templateId)).toEqual([
    "hero-overlay",
    "image-hero",
    "hero-overlay",
  ]);
  expect(
    carousel.cards.map((card) => card.overrides.story?.templateId),
  ).toEqual(["tall-statement", "image-hero", "tall-statement"]);
  expect(carousel.cards[0]?.recipe.cta).toBe("Explore your next escape");
  expect(carousel.cards[1]?.recipe.cta).toBe("");
  const single = generatedDocument(
    home,
    threeCards,
    ["facebook-feed", "instagram-story"],
    "static",
  );
  expect(single.cards[0]?.recipe.templateId).toBe("hero-overlay");
  expect(single.cards[0]?.overrides.story?.templateId).toBe("tall-statement");
});
