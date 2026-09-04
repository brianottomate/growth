import { describe, expect, test } from "bun:test";

import type { FreezeCompositionInput } from "@/lib/compositions";

import { applyDirection, KEEP } from "./card-director.service";
import { scrimRgba } from "./composition.service";

const spec: FreezeCompositionInput = {
  brandId: "brand_01",
  templateId: "catalog-copy",
  formatId: "portrait",
  sourceMediaAssetId: "media_01",
  title: "Sycamore Chalet in the Hocking Hills",
  subtitle: "3 bedrooms · 2 baths · 8 guests",
  imagePosition: "center",
  mark: "auto",
  assetTitle: "Sycamore Chalet — Chalets in Hocking Hills",
};

describe("applying the art director's read", () => {
  test("a keep changes nothing", () => {
    const result = applyDirection(spec, { ...KEEP, note: "Reads well." });
    expect(result.spec).toBe(spec);
    expect(result.changes).toEqual([]);
  });

  test("copy only ever gets shorter, and never empty", () => {
    // The director shortens what it was given; it does not write. A longer
    // headline, or none at all, would be new copy, so both are ignored.
    const longer = applyDirection(spec, {
      ...KEEP,
      verdict: "adjust",
      title: "Sycamore Chalet in the beautiful Hocking Hills of Ohio",
    });
    expect(longer.spec.title).toBe(spec.title);
    expect(longer.changes).toEqual([]);

    const blank = applyDirection(spec, { ...KEEP, verdict: "adjust", title: "   " });
    expect(blank.spec.title).toBe(spec.title);

    const shorter = applyDirection(spec, {
      ...KEEP,
      verdict: "adjust",
      title: "Sycamore Chalet",
      subtitle: "3 bedrooms · 8 guests",
    });
    expect(shorter.spec.title).toBe("Sycamore Chalet");
    expect(shorter.spec.subtitle).toBe("3 bedrooms · 8 guests");
    expect(shorter.changes).toHaveLength(2);
  });

  test("an empty facts line drops it; null leaves it", () => {
    const dropped = applyDirection(spec, { ...KEEP, verdict: "adjust", subtitle: "" });
    expect(dropped.spec.subtitle).toBeUndefined();
    expect(dropped.changes).toEqual(["dropped the facts line"]);

    const kept = applyDirection(spec, { ...KEEP, verdict: "adjust", subtitle: null });
    expect(kept.spec.subtitle).toBe(spec.subtitle);
  });

  test("a focal point replaces the coarse position", () => {
    const result = applyDirection(spec, {
      ...KEEP,
      verdict: "adjust",
      focal: { x: 80, y: 45 },
    });
    expect(result.spec.focal).toEqual({ x: 80, y: 45 });
    expect(result.changes[0]).toContain("80% across");
  });

  test("a tint is recorded lower-case so identical reads match on reuse", () => {
    const result = applyDirection(spec, { ...KEEP, verdict: "adjust", scrim: "#1B3A5C" });
    expect(result.spec.scrim).toBe("#1b3a5c");
  });
});

describe("the darkening colour", () => {
  test("is black unless asked otherwise", () => {
    expect(scrimRgba(undefined)(0.5)).toBe("rgba(0,0,0,0.5)");
    expect(scrimRgba("teal")(1)).toBe("rgba(0,0,0,1)");
  });

  test("keeps the hue but never the brightness", () => {
    // A sky blue arrives; a navy leaves. White type over the foot of the card
    // has to stay as legible as it is over black, so the brightest channel is
    // capped and the others scale with it.
    expect(scrimRgba("#6fa8dc")(0.82)).toBe("rgba(20,31,40,0.82)");
    expect(scrimRgba("#3b7a3b")(1)).toBe("rgba(19,40,19,1)");
    expect(scrimRgba("#0a0a0a")(1)).toBe("rgba(10,10,10,1)");
  });
});
