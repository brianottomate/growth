import { describe, expect, test } from "bun:test";

import {
  emptyProductAtlas,
  emptyStorefrontContent,
  productAtlasSchema,
  storefrontContentSchema,
  storefrontMediaAssetIds,
  storefrontSurfaceRegistry,
} from "./product-atlas";

describe("Product Atlas document", () => {
  test("accepts the empty v1 graph", () => {
    expect(JSON.stringify(productAtlasSchema.parse(emptyProductAtlas))).toBe(
      JSON.stringify(emptyProductAtlas),
    );
  });

  test("rejects broken story to view links", () => {
    const parsed = productAtlasSchema.safeParse({
      ...emptyProductAtlas,
      storyViewLinks: [
        {
          id: "link_missing",
          storyId: "story_missing",
          viewId: "view_missing",
        },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(
      (parsed.success ? "" : parsed.error.issues[0]?.message)?.includes(
        "missing node",
      ),
    ).toBe(true);
  });

  test("rejects views whose surface is absent", () => {
    const parsed = productAtlasSchema.safeParse({
      ...emptyProductAtlas,
      views: [
        {
          id: "view_share",
          name: "Share sheet",
          surfaceId: "surface_missing",
        },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(
      (parsed.success ? "" : parsed.error.issues[0]?.message)?.includes(
        "missing surface",
      ),
    ).toBe(true);
  });
});

describe("Storefront content", () => {
  test("keeps screenshots separate and distinguishes marketing composites", () => {
    const content = storefrontContentSchema.parse({
      ...emptyStorefrontContent,
      iconMediaAssetId: "media_icon",
      screenshots: [
        {
          id: "shot_one",
          mediaAssetId: "media_screen",
          order: 0,
          presentation: "marketing_composite",
        },
      ],
      promotionalAssets: [
        {
          id: "promo_one",
          mediaAssetId: "media_promo",
          role: "marquee",
          order: 0,
        },
      ],
    });
    expect(content.screenshots[0]?.presentation).toBe("marketing_composite");
    expect(storefrontMediaAssetIds(content).join(",")).toBe(
      "media_icon,media_screen,media_promo",
    );
  });

  test("groups ChatGPT and Claude without sharing their records", () => {
    expect(storefrontSurfaceRegistry.chatgpt_connector.family).toBe(
      "assistant_connector",
    );
    expect(storefrontSurfaceRegistry.claude_connector.family).toBe(
      "assistant_connector",
    );
    expect(
      String(storefrontSurfaceRegistry.chatgpt_connector.label) ===
        String(storefrontSurfaceRegistry.claude_connector.label),
    ).toBe(false);
  });
});
