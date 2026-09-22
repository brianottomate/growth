import { expect, it } from "bun:test";
import { importedIdea, inspectMetaCreative } from "./meta-import";
import {
  metaPreviewMedia,
  metaPreviewPlacements,
  importedPlacementLabel,
} from "./meta-preview";
import { metaPlacementMedia } from "./meta-placement-plan";
import type { AdCreativeContent } from "@/server/db/ads-schema";
const copy = {
  headline: "Stay",
  body: "In the mountains",
  linkUrl: "https://example.com",
  callToAction: "BOOK_NOW",
};
const document = importedIdea(
  copy,
  [
    {
      hash: "a",
      assetId: "a",
      url: "https://example.com/feed.jpg",
      width: 1080,
      height: 1350,
    },
    {
      hash: "b",
      assetId: "b",
      url: "https://example.com/story.jpg",
      width: 1080,
      height: 1920,
    },
  ],
  inspectMetaCreative({
    asset_feed_spec: {
      optimization_type: "PLACEMENT",
      images: [{ hash: "a" }, { hash: "b" }],
    },
  }),
);
const imported: AdCreativeContent = {
  ...copy,
  media: [],
  ideaStudio: { document },
  metaImport: {
    campaignId: "c",
    adId: "a",
    creativeId: "cr",
    importedAt: "now",
    issues: ["Review copy"],
    rawCreative: {},
  },
};
it("shows local approved creative before delivery placements are configured", () => {
  const content: AdCreativeContent = {
    ...copy,
    media: [
      { type: "image", url: "https://example.com/first.jpg" },
      { type: "image", url: "https://example.com/second.jpg" },
    ],
  };
  expect(metaPreviewPlacements(content, [])).toContain("facebook-feed");
  expect(metaPreviewPlacements(content, [])).toContain("instagram-story");
  expect(metaPreviewPlacements(content, ["instagram-feed"])).toEqual([
    "instagram-feed",
  ]);
  expect(metaPreviewPlacements({ ...copy, media: [] }, [])).toEqual([]);
});
it("previews recovered artwork without local approval, while delivery stays blocked", () => {
  expect(metaPreviewPlacements(imported, [])).toContain("facebook-feed");
  expect(metaPreviewMedia(imported, "facebook-feed").media[0]?.url).toBe(
    "https://example.com/feed.jpg",
  );
  expect(metaPreviewMedia(imported, "instagram-story").media[0]?.url).toBe(
    "https://example.com/story.jpg",
  );
  expect(metaPlacementMedia(imported, "facebook-feed").issue).toContain(
    "review",
  );
});
it("uses the explicit delivery plan when set and never fills missing vertical artwork with a crop", () => {
  expect(metaPreviewPlacements(imported, ["instagram-feed"])).toEqual([
    "instagram-feed",
  ]);
  const missing = {
    ...imported,
    ideaStudio: {
      document: {
        ...document,
        cards: document.cards.map((c) => ({ ...c, sourceOverrides: {} })),
      },
    },
  };
  expect(metaPreviewMedia(missing, "instagram-story").media).toEqual([]);
  expect(metaPreviewMedia(missing, "instagram-story").issue).toContain(
    "Missing",
  );
});
it("labels automatic source settings without pretending manual selection or observed delivery", () => {
  expect(importedPlacementLabel([{ targeting: { age_min: 18 } }])).toContain(
    "Automatic",
  );
  expect(
    importedPlacementLabel([
      { targeting: { publisher_platforms: ["facebook"] } },
    ]),
  ).not.toContain("Automatic");
  expect(importedPlacementLabel([])).not.toContain("Automatic");
});

it("previews the same ordered carousel cards that ship, not alternate Story exports", () => {
  const content: AdCreativeContent = {
    ...copy,
    media: ["first", "second"].map((name) => ({
      type: "image" as const,
      url: `https://example.com/${name}.jpg`,
      story: {
        url: `https://example.com/${name}-story.jpg`,
        type: "image" as const,
        via: "upload" as const,
      },
    })),
  };
  for (const placement of [
    "facebook-feed",
    "instagram-story",
    "facebook-story",
  ] as const) {
    expect(metaPreviewMedia(content, placement).media).toEqual(
      metaPlacementMedia(content, placement).media,
    );
    expect(
      metaPreviewMedia(content, placement).media.map((card) => card.url),
    ).toEqual(content.media.map((card) => card.url));
  }
});
