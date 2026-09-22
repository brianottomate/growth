import { expect, test } from "bun:test";
import { reusableApprovalAsset } from "./ad-approval-assets";
import { defaultIdeaRecipe, type IdeaImage } from "./ad-idea-studio";

const card: IdeaImage = {
  id: "slide-one",
  mode: "supplied",
  source: { assetId: "portrait", url: "https://untrusted.example/portrait" },
  sourceOverrides: {
    story: { assetId: "story", url: "https://untrusted.example/story" },
  },
  recipe: defaultIdeaRecipe("hero_carousel"),
  overrides: {},
};
const asset = {
  id: "portrait",
  url: "https://library.example/original.jpg",
  width: 1080,
  height: 1350,
  mimeType: "image/jpeg",
};

test("approval reuses exact supplied artwork with canonical URL and preserves original ownership", () => {
  expect(reusableApprovalAsset(card, "portrait", asset)).toEqual({
    assetId: "portrait",
    url: asset.url,
    reused: true,
  });
});

test("Story approval uses its own supplied asset rather than the portrait source", () => {
  expect(reusableApprovalAsset(card, "story", asset)).toBeNull();
  expect(
    reusableApprovalAsset(card, "story", {
      ...asset,
      id: "story",
      height: 1920,
    }),
  ).toEqual({
    assetId: "story",
    url: asset.url,
    reused: true,
  });
  expect(
    reusableApprovalAsset(
      { ...card, sourceOverrides: { story: null } },
      "story",
      { ...asset, id: "story", height: 1920 },
    ),
  ).toBeNull();
});

test("compositions and artwork requiring transformation still render", () => {
  expect(
    reusableApprovalAsset({ ...card, mode: "compose" }, "portrait", asset),
  ).toBeNull();
  for (const changed of [
    { width: 2160, height: 2700 },
    { width: 1000 },
    { height: null },
    { mimeType: "image/gif" },
    { mimeType: "image/webp" },
    { mimeType: null },
    { id: "other" },
  ])
    expect(
      reusableApprovalAsset(card, "portrait", { ...asset, ...changed }),
    ).toBeNull();
  expect(reusableApprovalAsset(card, "portrait")).toBeNull();
});
