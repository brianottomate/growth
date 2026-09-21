import { expect, test } from "bun:test";
import { generatedDocument, type GeneratedHome } from "./starter-ad-generation";

const home = {
  id: "home",
  name: "Lake house",
  url: "https://example.com/home",
  photos: [
    { url: "https://example.com/1.jpg" },
    { url: "https://example.com/2.jpg" },
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
  expect(single.cards).toHaveLength(1);
  expect(carousel.cards.map((c) => c.source.url)).toEqual([
    home.photos[1]!.url,
    home.photos[0]!.url,
  ]);
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
