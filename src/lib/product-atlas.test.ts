import { describe, expect, test } from "bun:test";

import {
  emptyProductAtlas,
  emptyStorefrontContent,
  productAtlasSchema,
  storefrontContentSchema,
  storefrontMediaAssetIds,
  storefrontReferenceSnapshotSchema,
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

describe("Storefront reference snapshots", () => {
  test("accepts a bounded marketplace comparison snapshot", () => {
    const snapshot = storefrontReferenceSnapshotSchema.parse({
      listing: {
        title: "Notion Web Clipper",
        publisher: "Notion Labs",
        category: "Productivity",
        openingLine: "Save any page to your workspace.",
        summary: "A focused browser-extension listing.",
      },
      copyStructure: ["Problem", "Workflow", "Trust"],
      imageSequence: [
        {
          position: 1,
          caption: "Capture a page",
          purpose: "Shows the primary action before secondary features",
        },
      ],
      coverageDimensions: ["opening line", "screenshot sequence"],
      strengths: ["Leads with one clear job"],
      gaps: [],
      patternsToBorrow: ["Put the main action in the first frame"],
      contrasts: [
        {
          dimension: "Opening line",
          referenceObservation: "Starts with a direct verb.",
          targetObservation: "Starts with a category description.",
          takeaway: "Test a task-led opening.",
        },
      ],
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.imageSequence[0]?.position).toBe(1);
    expect(snapshot.contrasts[0]?.dimension).toBe("Opening line");
  });

  test("rejects unbounded or invalid image evidence", () => {
    const parsed = storefrontReferenceSnapshotSchema.safeParse({
      listing: {},
      imageSequence: [
        {
          position: 0,
          caption: "Invalid position",
          purpose: "",
        },
      ],
    });

    expect(parsed.success).toBe(false);
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
