import { describe, expect, it } from "bun:test";
import { selectPlatformAds } from "./platform-ad-plan";
import type { Ad } from "@/server/db/ads-schema";

const ads = [
  { id: "text", type: "text", platforms: null, content: {} },
  {
    id: "image",
    type: "creative",
    platforms: null,
    content: {
      media: [{ type: "image", url: "https://example.com/image.png" }],
    },
  },
  { id: "other", type: "text", platforms: ["openai_ads"], content: {} },
] as Ad[];

describe("platform publishing selection", () => {
  it("excludes unselected ideas and never broadens an empty selection or overrides format/routing", () => {
    expect(
      selectPlatformAds(ads, "google_ads", {
        google: { campaignType: "search" },
      }).map((a) => a.id),
    ).toEqual(["text"]);
    expect(
      selectPlatformAds(ads, "google_ads", {
        google: { campaignType: "search" },
        selectedAdIds: [],
      }),
    ).toEqual([]);
    expect(
      selectPlatformAds(ads, "google_ads", {
        google: { campaignType: "search" },
        selectedAdIds: ["image", "other", "missing"],
      }),
    ).toEqual([]);
    expect(
      selectPlatformAds(ads, "meta_ads", {
        selectedAdIds: ["text", "image"],
      }).map((a) => a.id),
    ).toEqual(["image"]);
  });
});
