import { describe, expect, it } from "bun:test";
import {
  META_DEFAULT_PLACEMENTS,
  metaPlacementFits,
  metaPlacementMedia,
  metaProviderPlacements,
} from "./meta-placement-plan";
import { importedIdea, inspectMetaCreative } from "./meta-import";
import type { AdCreativeContent } from "@/server/db/ads-schema";

const content: AdCreativeContent = {
  headline: "Stay",
  body: "A mountain escape",
  media: [{ type: "image", url: "https://cdn.example/feed.jpg" }],
};
describe("Meta placement delivery", () => {
  it("an approval waiting for its push is pending, not a blocker", () => {
    const approved = {
      ...content,
      media: [],
      ideaStudio: {
        document: { shapes: ["portrait"], cards: [] },
        approval: {
          approvedAt: "now",
          approvedBy: "user",
          sourceVersion: "v1",
          renders: {},
        },
      },
    } as unknown as AdCreativeContent;
    expect(metaPlacementMedia(approved, "facebook-feed")).toEqual({
      media: [],
      issue: null,
      pending: true,
    });
  });
  it("sends exactly the selected publisher positions", () => {
    expect(
      metaProviderPlacements(["instagram-feed", "instagram-story"]),
    ).toEqual({
      publisherPlatforms: ["instagram"],
      instagramPositions: ["stream", "story"],
    });
    expect(metaProviderPlacements(["facebook-reel"])).toEqual({
      publisherPlatforms: ["facebook"],
      facebookPositions: ["facebook_reels"],
    });
  });
  it("defaults to every Facebook and Instagram surface but in-stream and search", () => {
    expect(metaProviderPlacements(META_DEFAULT_PLACEMENTS)).toEqual({
      publisherPlatforms: ["facebook", "instagram"],
      facebookPositions: [
        "feed",
        "story",
        "facebook_reels",
        "marketplace",
        "video_feeds",
        "right_hand_column",
        "profile_feed",
        "notification",
      ],
      instagramPositions: [
        "stream",
        "story",
        "reels",
        "explore",
        "explore_home",
        "profile_feed",
        "profile_reels",
      ],
    });
  });
  it("gives feed-shaped surfaces the baseline card", () => {
    expect(metaPlacementMedia(content, "instagram-explore").media).toEqual(
      content.media,
    );
    expect(
      metaPlacementMedia(content, "instagram-profile-reel").issue,
    ).toContain("9:16");
  });
  it("does not substitute a feed crop for missing vertical artwork", () => {
    expect(metaPlacementMedia(content, "facebook-feed").media).toEqual(
      content.media,
    );
    expect(metaPlacementMedia(content, "instagram-story").issue).toContain(
      "9:16",
    );
    expect(
      metaPlacementMedia(
        {
          ...content,
          media: [
            {
              ...content.media[0]!,
              story: {
                url: "https://cdn.example/story.jpg",
                type: "image",
                via: "upload",
              },
            },
          ],
        },
        "instagram-story",
      ).media[0]?.url,
    ).toBe("https://cdn.example/story.jpg");
  });
  it("sends a video ad's 9:16 cut to Stories and Reels, and never its feed crop", () => {
    const feed = {
      type: "video" as const,
      url: "https://cdn.example/feed.mp4",
      thumbnail: "https://cdn.example/feed.jpg",
    };
    const video = { ...content, format: "video" as const, media: [feed] };
    expect(metaPlacementMedia(video, "instagram-reel").issue).toContain("9:16");
    const story = {
      type: "video" as const,
      url: "https://cdn.example/story.mp4",
      thumbnail: "https://cdn.example/story.jpg",
      via: "crop" as const,
    };
    const cut = { ...video, media: [{ ...feed, story }] };
    expect(metaPlacementMedia(cut, "instagram-reel").media).toEqual([story]);
    expect(metaPlacementMedia(cut, "facebook-feed").media).toEqual(cut.media);
  });
  it("uses canonical carousel cards for vertical delivery", () => {
    expect(
      metaPlacementMedia(
        { ...content, media: [...content.media, ...content.media] },
        "facebook-story",
      ).issue,
    ).toBeNull();
  });
});
describe("Meta source reconstruction", () => {
  const copy = {
    headline: "Stay",
    body: "A mountain escape",
    linkUrl: "https://example.com",
    callToAction: "BOOK_TRAVEL",
  };
  it("keeps placement variants on one static ad and recovers the designated base", () => {
    const parsed = inspectMetaCreative({
      asset_feed_spec: {
        optimization_type: "PLACEMENT",
        images: [
          { hash: "vertical", adlabels: [{ name: "vertical" }] },
          { hash: "base", adlabels: [{ name: "default" }] },
        ],
        asset_customization_rules: [
          {
            customization_spec: { publisher_platforms: ["instagram"] },
            image_label: { name: "vertical" },
          },
          { customization_spec: {}, image_label: { name: "default" } },
        ],
      },
    });
    const doc = importedIdea(
      copy,
      [
        {
          hash: "vertical",
          url: "https://example.com/story.jpg",
          assetId: "a",
          width: 1080,
          height: 1920,
        },
        {
          hash: "base",
          url: "https://example.com/feed.jpg",
          assetId: "b",
          width: 1080,
          height: 1350,
        },
      ],
      parsed,
    );
    expect(doc.cards).toHaveLength(1);
    expect(doc.cards[0]?.mode).toBe("supplied");
    expect(doc.cards[0]?.source?.assetId).toBe("b");
    expect(doc.cards[0]?.sourceOverrides?.story?.assetId).toBe("a");
  });
  it("recovers ordered carousel artwork separately for Feed and Stories", () => {
    const parsed = inspectMetaCreative({
      asset_feed_spec: {
        optimization_type: "PLACEMENT",
        images: ["f1", "f2", "s1", "s2"].map((hash) => ({
          hash,
          adlabels: [{ name: hash }],
        })),
        carousels: [
          {
            adlabels: [{ name: "vertical" }],
            child_attachments: [
              { image_label: { name: "s1" } },
              { image_label: { name: "s2" } },
            ],
          },
          {
            adlabels: [{ name: "base" }],
            child_attachments: [
              { image_label: { name: "f1" } },
              { image_label: { name: "f2" } },
            ],
          },
        ],
        asset_customization_rules: [
          {
            customization_spec: {
              publisher_platforms: ["instagram"],
              instagram_positions: ["story"],
            },
            carousel_label: { name: "vertical" },
          },
          { customization_spec: {}, carousel_label: { name: "base" } },
        ],
      },
    });
    const sources = ["f1", "f2", "s1", "s2"].map((hash) => ({
      hash,
      url: `https://example.com/${hash}.jpg`,
      assetId: hash,
      width: 1080,
      height: hash.startsWith("s") ? 1920 : 1350,
    }));
    const doc = importedIdea(copy, sources, parsed);
    expect(doc.cards.map((c) => c.source?.assetId)).toEqual(["f1", "f2"]);
    expect(doc.cards.map((c) => c.sourceOverrides?.story?.assetId)).toEqual([
      "s1",
      "s2",
    ]);
    expect(doc.intendedPlacements).toEqual([
      "facebook-feed",
      "instagram-feed",
      "instagram-story",
    ]);
  });
  it("flags ambiguous dynamic pools and malformed live destinations for review", () => {
    const parsed = inspectMetaCreative({
      asset_feed_spec: {
        images: [{ hash: "a" }, { hash: "b" }],
        link_urls: [{ website_url: "https://example.com Copy:" }],
      },
    });
    expect(parsed.carousel).toBe(false);
    expect(parsed.issues.join(" ")).toContain("Dynamic");
    expect(parsed.issues.join(" ")).toContain("whitespace");
  });
  it("uses child attachment order for real carousels", () => {
    const parsed = inspectMetaCreative({
      object_story_spec: {
        link_data: {
          child_attachments: [{ image_hash: "b" }, { image_hash: "a" }],
        },
      },
    });
    expect(parsed.carousel).toBe(true);
    expect(parsed.hashes).toEqual(["b", "a"]);
  });
});

describe("metaPlacementFits", () => {
  it("marks a carousel's stories and reels as fitted by Meta", () => {
    expect(
      metaPlacementFits(META_DEFAULT_PLACEMENTS, {
        carousel: true,
        hasStory: false,
      }),
    ).toEqual([
      { kind: "feed", fit: "made" },
      { kind: "story", fit: "fitted" },
      { kind: "reel", fit: "fitted" },
    ]);
  });

  it("needs a 9:16 before a static reaches stories", () => {
    expect(
      metaPlacementFits(["instagram-feed", "instagram-story"], {
        carousel: false,
        hasStory: false,
      }),
    ).toEqual([
      { kind: "feed", fit: "made" },
      { kind: "story", fit: "missing" },
    ]);
  });
});
