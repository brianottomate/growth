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
it("does not invent placements before delivery is configured", () => {
  expect(metaPreviewPlacements(imported, [])).toEqual([]);
  expect(metaPreviewPlacements(imported, ["instagram-feed"])).toEqual([
    "instagram-feed",
  ]);
});
it("never previews recovered but unapproved artwork", () => {
  for (const placement of ["facebook-feed", "instagram-story"] as const) {
    expect(metaPreviewMedia(imported, placement, "brand").media).toEqual([]);
    expect(metaPreviewMedia(imported, placement, "brand")).toEqual(
      metaPlacementMedia(imported, placement),
    );
  }
});
it("previews a draft live but never publishes it, and rejects stale frozen assets", () => {
  const content: AdCreativeContent = {
    ...copy,
    media: [{ type: "image", url: "https://example.com/feed.jpg" }],
    ideaStudio: { document },
  };
  expect(metaPreviewMedia(content, "facebook-feed", "brand").issue).toBeNull();
  expect(metaPlacementMedia(content, "facebook-feed").issue).toContain(
    "Approve",
  );
  content.ideaStudio!.approval = {
    approvedAt: "now",
    approvedBy: "u",
    sourceVersion: "v",
    renders: {
      portrait: [{ assetId: "a", url: "https://example.com/feed.jpg" }],
    },
  };
  expect(metaPreviewMedia(content, "facebook-feed", "brand").media).toEqual(
    content.media,
  );
  content.media[0]!.url = "https://example.com/unapproved.jpg";
  expect(metaPreviewMedia(content, "facebook-feed", "brand").media).toEqual([]);
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
    expect(metaPreviewMedia(content, placement, "brand").media).toEqual(
      metaPlacementMedia(content, placement).media,
    );
    expect(metaPreviewMedia(content, placement, "brand").media).toEqual(
      content.media,
    );
  }
});
it("previews an approval waiting for its push live, while publishing still refuses it", () => {
  const content: AdCreativeContent = {
    ...copy,
    media: [],
    ideaStudio: {
      document,
      approval: {
        approvedAt: "now",
        approvedBy: "u",
        sourceVersion: "v",
        renders: {},
      },
    },
  };
  const preview = metaPreviewMedia(content, "facebook-feed", "brand");
  expect(preview.issue).toBeNull();
  expect(preview.media.length).toBe(document.cards.length);
  expect(preview.media[0]?.url).toContain("/api/compositions/preview");
  expect(metaPlacementMedia(content, "facebook-feed")).toEqual({
    media: [],
    issue: null,
    pending: true,
  });
});
