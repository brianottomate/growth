import { expect, test } from "bun:test";

import { starterAdIdeas, featuredStarterAdIdeas } from "./starter-ad-ideas";

test("starter package has a hero carousel and four paired static/carousel ideas, without a catalog", () => {
  const ideas = starterAdIdeas();
  expect(ideas).toHaveLength(9);
  expect(ideas[0]?.content.format).toBe("carousel");
  expect(ideas[0]?.content.propertyName).toBeUndefined();
  for (let home = 1; home <= 4; home++) {
    expect(
      ideas
        .filter((idea) => idea.content.propertyName === `Home ${home}`)
        .map((idea) => idea.content.format),
    ).toEqual(["static", "carousel"]);
  }
  expect(new Set(ideas.map((idea) => idea.key)).size).toBe(9);
});

test("starter ideas require no photos, destination or generated copy", () => {
  for (const { content } of starterAdIdeas()) {
    expect(content.media).toEqual([]);
    expect(content.headline).toBe("");
    expect(content.body).toBe("");
    expect(content.linkUrl).toBeUndefined();
  }
});

test("starter workflow creates the hero first, then statics, then home carousels", () => {
  expect(starterAdIdeas().map((idea) => idea.key)).toEqual([
    "hero-carousel",
    "home-1-static",
    "home-2-static",
    "home-3-static",
    "home-4-static",
    "home-1-carousel",
    "home-2-carousel",
    "home-3-carousel",
    "home-4-carousel",
  ]);
});

test("featured homes produce the shared hero and ordered per-home drafts with source photos and links", () => {
  const homes = Array.from({ length: 4 }, (_, index) => ({
    id: `home-${index}`,
    name: `Cabin ${index}`,
    url: `https://example.com/homes/${index}`,
    photos: [
      {
        url: `https://example.com/${index}-hero.jpg`,
        assetId: `asset-${index}`,
      },
      { url: `https://example.com/${index}-inside.jpg` },
    ],
  }));
  const ideas = featuredStarterAdIdeas(homes);
  expect(ideas).toHaveLength(9);
  expect(ideas.map((i) => i.content.format)).toEqual([
    "carousel",
    ...Array.from({ length: 4 }, () => "static" as const),
    ...Array.from({ length: 4 }, () => "carousel" as const),
  ]);
  expect(ideas[0]!.content.media.map((m) => m.url)).toEqual(
    homes.map((h) => h.photos[0]!.url),
  );
  expect(ideas[1]!.homeId).toBe(homes[0]!.id);
  expect(ideas[1]!.content.linkUrl).toBe(homes[0]!.url);
  expect(ideas[1]!.content.media).toHaveLength(1);
  expect(ideas[5]!.content.media).toHaveLength(2);
  expect(ideas[5]!.content.media[0]!.assetId).toBe("asset-0");
  expect(
    ideas.every(
      (idea) => idea.content.headline === "" && idea.content.body === "",
    ),
  ).toBe(true);
});
test("featured starter identity survives reordering homes and starts with six carousel images", () => {
  const homes = ["one", "two"].map((id) => ({
    id,
    name: id,
    url: `https://example.com/${id}`,
    photos: Array.from({ length: 12 }, (_, i) => ({
      url: `https://example.com/${id}/${i}.jpg`,
    })),
  }));
  const first = featuredStarterAdIdeas(homes);
  expect(first.map((i) => i.key).sort()).toEqual(
    featuredStarterAdIdeas([...homes].reverse())
      .map((i) => i.key)
      .sort(),
  );
  expect(first[3]!.content.media).toHaveLength(6);
});

test("WanderOS fills static pools with heroes and home carousel pools with the first six gallery images", () => {
  const homes = ["one", "two"].map((id) => ({
    id,
    name: id,
    url: `https://example.com/${id}`,
    photos: Array.from({ length: 35 }, (_, i) => ({
      url: `https://example.com/${id}/${i}.jpg`,
    })),
  }));
  const ideas = featuredStarterAdIdeas(homes);
  expect(ideas[0]!.content.ideaStudio!.document.pool).toHaveLength(2);
  expect(ideas[1]!.content.ideaStudio!.document.pool).toHaveLength(1);
  expect(ideas[1]!.content.ideaStudio!.document.cards).toHaveLength(1);
  expect(ideas[3]!.content.ideaStudio!.document.pool).toHaveLength(6);
  expect(ideas[3]!.content.ideaStudio!.document.cards).toHaveLength(6);
});

test("curated home photos keep their order beyond the default six-card starter", () => {
  const photos = Array.from({ length: 8 }, (_, index) => ({
    url: `https://example.com/selected-${index}.jpg`,
  }));
  const ideas = featuredStarterAdIdeas([
    {
      id: "curated-home",
      name: "Curated cabin",
      url: "https://example.com/cabin",
      curated: true,
      photos,
    },
  ]);
  expect(
    ideas
      .find((idea) => idea.key === "curated-home-carousel")!
      .content.media.map((photo) => photo.url),
  ).toEqual(photos.map((photo) => photo.url));
  expect(
    ideas
      .find((idea) => idea.key === "curated-home-static")!
      .content.media.map((photo) => photo.url),
  ).toEqual([photos[0]!.url]);
});

test("blank and featured starters include every creative size for export", () => {
  for (const idea of [
    ...starterAdIdeas(),
    ...featuredStarterAdIdeas([
      {
        id: "home",
        name: "Home",
        url: "https://example.com",
        photos: [{ url: "https://example.com/photo.jpg" }],
      },
    ]),
  ]) {
    expect(idea.content.ideaStudio?.document.exportShapes).toEqual([
      "portrait",
      "square",
      "story",
      "wide",
    ]);
  }
});
