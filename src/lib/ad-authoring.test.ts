import { expect, test } from "bun:test";
import {
  adAuthoringScopeSchema,
  isReplaceableStudioAd,
  textAdCopySchema,
  textAdReady,
} from "./ad-authoring";
import { starterGenerationSchema } from "./starter-ad-generation";

test("authoring accepts a brand Studio or a campaign, and rejects ambiguous ownership", () => {
  for (const owner of [{ brandId: "brand" }, { campaignId: "campaign" }]) {
    expect(adAuthoringScopeSchema.safeParse(owner).success).toBe(true);
    expect(
      starterGenerationSchema.safeParse({
        ...owner,
        source: "brand",
        homeIds: [],
        intendedPlacements: ["facebook-feed"],
      }).success,
    ).toBe(true);
  }
  for (const owner of [
    {},
    { brandId: "brand", campaignId: "campaign" },
    { brandId: " " },
  ]) {
    expect(adAuthoringScopeSchema.safeParse(owner).success).toBe(false);
    expect(
      starterGenerationSchema.safeParse({
        ...owner,
        source: "brand",
        homeIds: [],
        intendedPlacements: ["facebook-feed"],
      }).success,
    ).toBe(false);
  }
});

test("text drafts can be partial but approval requires a complete asset pool", () => {
  const partial = {
    headlines: ["A quiet escape"],
    descriptions: ["Plan your next getaway."],
  };
  expect(textAdCopySchema.safeParse(partial).success).toBe(true);
  expect(textAdReady(partial)).toBe(false);
  const ready = {
    headlines: ["A quiet escape", "Stay by the lake", "Book your getaway"],
    descriptions: ["Plan your next getaway.", "Find your home away from home."],
  };
  expect(textAdReady(ready)).toBe(true);
  expect(
    textAdReady({ ...ready, headlines: ["x".repeat(31), ...ready.headlines] }),
  ).toBe(false);
  expect(
    textAdReady({
      ...ready,
      descriptions: ["x".repeat(91), ...ready.descriptions],
    }),
  ).toBe(false);
  expect(
    textAdCopySchema.safeParse({ ...ready, linkUrl: "invalid" }).success,
  ).toBe(false);
  expect(
    textAdCopySchema.safeParse({
      ...ready,
      headlines: Array(16).fill("Headline"),
    }).success,
  ).toBe(false);
});

test("rebuilding creative drafts preserves text drafts and approved ads", () => {
  expect(isReplaceableStudioAd({ type: "creative", status: "draft" })).toBe(
    true,
  );
  expect(isReplaceableStudioAd({ type: "creative", status: "approved" })).toBe(
    false,
  );
  expect(isReplaceableStudioAd({ type: "text", status: "draft" })).toBe(false);
  expect(isReplaceableStudioAd({ type: "text", status: "approved" })).toBe(
    false,
  );
});
