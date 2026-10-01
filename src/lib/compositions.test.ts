import { describe, expect, test } from "bun:test";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  compositionHasField,
  compositionSpecSchema,
  getCompositionFields,
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
      { id: "wide", width: 1920, height: 1080 },
      { id: "email", width: 1200, height: 800 },
      { id: "banner", width: 1200, height: 600 },
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
    expect(directed).toMatchObject({
      focal: { x: 72, y: 40 },
      scrim: "#1b3a5c",
    });
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

describe("the fields a blueprint declares", () => {
  test("every blueprint declares its fields, and only photo only draws none", () => {
    for (const template of COMPOSITION_TEMPLATES) {
      const fields = getCompositionFields(template.id);
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length === 0).toBe(template.id === "photo-only");
    }
  });

  test("a blueprint that requires a headline declares a title field, and vice versa", () => {
    // The form is built from the declaration and the schema enforces the
    // headline; the two must agree or the form asks for what it cannot show.
    for (const template of COMPOSITION_TEMPLATES) {
      const requires = (
        compositionSpecSchema.safeParse({
          brandId: "b",
          templateId: template.id,
          formatId: "square",
          sourceMediaAssetId: "m",
          title: "",
        }).error?.issues ?? []
      ).some((issue) => issue.path[0] === "title");
      expect(compositionHasField(template.id, "title")).toBe(requires);
    }
  });

  test("the place and review cards are the ones with a rating", () => {
    expect(
      COMPOSITION_TEMPLATES.filter((t) =>
        compositionHasField(t.id, "rating"),
      ).map((t) => t.id),
    ).toEqual(["catalog-place", "catalog-review"]);
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

import { homeCatalogCopy, ratingOutOfFive } from "./home-ad-previews";

// WanderOS feeds score guests out of 10; the listing card's pill is out of 5.
describe("home preview copy", () => {
  test("brings a ten-point feed rating onto the card's five-point pill", () => {
    expect(ratingOutOfFive(10)).toBe(5);
    expect(ratingOutOfFive(9.758620689655173)).toBe(4.9);
    expect(ratingOutOfFive(4.8)).toBe(4.8);
    expect(ratingOutOfFive(null)).toBeNull();
    expect(ratingOutOfFive(0)).toBeNull();
  });

  test("writes the place with the state code the cards use", () => {
    const copy = homeCatalogCopy({
      name: "Arrow Rooftop Villa 290",
      city: "Winter Park",
      state: "Colorado",
      bedrooms: 4,
      bathrooms: 3,
      guests: 8,
      rating: 10,
    });
    expect(copy.title).toBe("Winter Park, CO");
    expect(copy.subtitle).toBe("4 bedrooms · 3 baths · 8 guests");
    expect(copy.rating).toBe(5);
  });

  // Catalog cards lead on what the home has, never "<home name> in <place>".
  test("leads the catalog headline on the home's best amenities", () => {
    const home = {
      name: "Arrow Rooftop Villa 290",
      city: "Winter Park",
      state: "Colorado",
      guests: 8,
      amenities: ["Wifi", "Game Room", "Dishes", "Hot tub", "Fire pit"],
    };
    const copy = homeCatalogCopy(home);
    expect(copy.eyebrow).toBe("Hot tub + game room in");
    expect(copy.eyebrow).not.toContain(home.name);

    // A neighbour already leading on the hot tub makes this one lead on its
    // game room, so a set does not print one headline on every card.
    expect(homeCatalogCopy(home, new Set(["hot-tub"])).eyebrow).toBe(
      "Game room + hot tub in",
    );

    // No amenities read yet: say how many it sleeps, still not the name.
    expect(homeCatalogCopy({ ...home, amenities: [] }).eyebrow).toBe(
      "Sleeps 8 in",
    );
  });
});

describe("tier badge", () => {
  const base = {
    brandId: "brand_01",
    templateId: "tier-badge",
    formatId: "email",
    sourceMediaAssetId: "media_01",
    title: "",
  } as const;

  test("draws no headline but needs a tier", () => {
    expect(
      compositionSpecSchema.safeParse({ ...base, tier: "luxury" }).success,
    ).toBe(true);
    const missing = compositionSpecSchema.safeParse(base);
    expect(missing.error?.issues.map((issue) => issue.path[0])).toEqual([
      "tier",
    ]);
  });

  test("a Luxury and an Iconic card of one photo are two renders", () => {
    const luxury = compositionSpecSchema.parse({ ...base, tier: "luxury" });
    const iconic = compositionSpecSchema.parse({ ...base, tier: "iconic" });
    expect(getCompositionIdentity({ ...luxury, assetTitle: "a" })).not.toEqual(
      getCompositionIdentity({ ...iconic, assetTitle: "a" }),
    );
  });
});
