import { describe, expect, test } from "bun:test";

import { selectBrandLogo } from "./brand-enrichment-meta";

describe("selectBrandLogo", () => {
  test("uses the favicon for the square brand-logo slot", () => {
    expect(
      selectBrandLogo({
        favicon: "https://example.com/favicon.png",
        ogImage: "https://example.com/wide-preview.png",
      }),
    ).toBe("https://example.com/favicon.png");
  });

  test("falls back to Open Graph artwork when a site has no favicon", () => {
    expect(
      selectBrandLogo({ ogImage: "https://example.com/wide-preview.png" }),
    ).toBe("https://example.com/wide-preview.png");
  });
});
