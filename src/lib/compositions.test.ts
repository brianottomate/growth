import { describe, expect, test } from "bun:test";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  compositionSpecSchema,
  freezeCompositionSchema,
  getCompositionFormat,
  getCompositionIdentity,
  getCompositionMetadata,
  getCompositionTemplate,
} from "./compositions";

describe("composition blueprints", () => {
  test("keeps blueprint and canvas identifiers unique", () => {
    expect(new Set(COMPOSITION_TEMPLATES.map(({ id }) => id)).size).toBe(
      COMPOSITION_TEMPLATES.length,
    );
    expect(new Set(COMPOSITION_FORMATS.map(({ id }) => id)).size).toBe(
      COMPOSITION_FORMATS.length,
    );
  });

  test("registers exact publishing dimensions", () => {
    expect(COMPOSITION_FORMATS).toMatchObject([
      { id: "landscape", width: 1200, height: 630 },
      { id: "square", width: 1080, height: 1080 },
      { id: "portrait", width: 1080, height: 1350 },
      { id: "story", width: 1080, height: 1920 },
    ]);
  });

  test("resolves every registered blueprint and canvas", () => {
    for (const template of COMPOSITION_TEMPLATES) {
      expect(getCompositionTemplate(template.id)).toEqual(template);
    }
    for (const format of COMPOSITION_FORMATS) {
      expect(getCompositionFormat(format.id)).toEqual(format);
    }
  });

  test("accepts a reproducible owned-media composition spec", () => {
    const result = compositionSpecSchema.parse({
      brandId: "brand_wander",
      templateId: "split-frame",
      formatId: "portrait",
      sourceMediaAssetId: "media_property",
      title: "The view is only the beginning.",
      subtitle: "A property story ready for the channel it belongs on.",
      accent: "#18a8b5",
    });

    expect(result.imagePosition).toBe("center");
    expect(result.sourceMediaAssetId).toBe("media_property");
  });

  test("requires owned media for every image-led blueprint", () => {
    const result = compositionSpecSchema.safeParse({
      brandId: "brand_wander",
      templateId: "editorial-overlay",
      formatId: "story",
      title: "Stay somewhere worth remembering.",
    });
    expect(result.success).toBe(false);

    expect(
      compositionSpecSchema.safeParse({
        brandId: "brand_wander",
        templateId: "brand-statement",
        formatId: "square",
        title: "The best places bring people together.",
      }).success,
    ).toBe(true);
  });

  test("rejects unbounded text, invalid accents, and blank asset titles", () => {
    expect(() =>
      freezeCompositionSchema.parse({
        brandId: "brand_wander",
        templateId: "image-hero",
        formatId: "square",
        sourceMediaAssetId: "media_property",
        title: "x".repeat(121),
        accent: "teal",
        assetTitle: "",
      }),
    ).toThrow();
  });

  test("preserves the versioned recipe saved with a frozen asset", () => {
    const spec = freezeCompositionSchema.parse({
      brandId: "brand_wander",
      templateId: "product-proof",
      formatId: "landscape",
      sourceMediaAssetId: "media_product",
      title: "Every stay, ready to explore.",
      subtitle: "The exact property proof behind the campaign.",
      accent: "#18a8b5",
      imagePosition: "top",
      assetTitle: "Property proof",
    });

    expect(getCompositionMetadata(spec, "2026-08-19T00:00:00.000Z")).toEqual({
      templateId: "product-proof",
      templateVersion: 2,
      formatId: "landscape",
      sourceMediaAssetId: "media_product",
      title: "Every stay, ready to explore.",
      subtitle: "The exact property proof behind the campaign.",
      eyebrow: null,
      cta: null,
      accent: "#18a8b5",
      imagePosition: "top",
      focal: null,
      scrim: null,
      rating: null,
      mark: "auto",
      renderedAt: "2026-08-19T00:00:00.000Z",
    });
  });

  test("a focal point and a scrim tint are part of what makes a render", () => {
    // The art director's changes must miss the earlier card on reuse, or a
    // rerun would hand back the crop it asked to fix.
    const base = {
      brandId: "brand_01",
      templateId: "catalog-copy",
      formatId: "portrait",
      sourceMediaAssetId: "media_01",
      title: "Sycamore Chalet",
      assetTitle: "Sycamore Chalet",
    } as const;
    const plain = getCompositionIdentity(freezeCompositionSchema.parse(base));
    const directed = getCompositionIdentity(
      freezeCompositionSchema.parse({
        ...base,
        focal: { x: 72, y: 40 },
        scrim: "#1b3a5c",
      }),
    );
    expect(plain.focal).toBeNull();
    expect(directed).toMatchObject({ focal: { x: 72, y: 40 }, scrim: "#1b3a5c" });
    expect(
      freezeCompositionSchema.safeParse({ ...base, focal: { x: 120, y: 0 } })
        .success,
    ).toBe(false);
  });
});

describe("composition identity", () => {
  test("is the metadata without the render time, so a rerun can find it", () => {
    const spec = freezeCompositionSchema.parse({
      brandId: "brand_01",
      templateId: "editorial-overlay",
      formatId: "portrait",
      sourceMediaAssetId: "media_01",
      title: "Arrow Rooftop Villa",
      subtitle: "3 bd · Winter Park, Colorado",
      cta: "Book direct",
      assetTitle: "Arrow Rooftop Villa — Winter Park Escapes",
    });
    const identity = getCompositionIdentity(spec);
    expect(identity).not.toHaveProperty("renderedAt");
    expect(identity.templateVersion).toBe(2);
    expect(getCompositionMetadata(spec, "2026-09-04T00:00:00.000Z")).toEqual({
      ...identity,
      renderedAt: "2026-09-04T00:00:00.000Z",
    });
  });
});

describe("photo only", () => {
  test("is the one blueprint that renders without a headline", () => {
    const base = {
      brandId: "brand_01",
      formatId: "portrait",
      sourceMediaAssetId: "media_01",
      title: "",
    };
    expect(
      compositionSpecSchema.safeParse({ ...base, templateId: "photo-only" })
        .success,
    ).toBe(true);
    const other = compositionSpecSchema.safeParse({
      ...base,
      templateId: "image-hero",
    });
    expect(other.success).toBe(false);
    expect(other.error?.issues[0]?.path).toEqual(["title"]);
  });
});
