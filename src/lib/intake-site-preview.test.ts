import { expect, test } from "bun:test";
import { intakeSitePreview } from "./intake-site-preview";

test("projects public preview fields and resolves relative images against the booking site", () => {
  expect(
    intakeSitePreview(
      {
        title: "Direct booking",
        description: "Our vacation homes",
        ogImage: "/images/hero.jpg",
        homepage: {
          url: "https://example.com",
          markdown: "full website content",
          scrapedAt: "2026-10-20",
        },
      },
      "https://example.com",
    ),
  ).toEqual({
    title: "Direct booking",
    description: "Our vacation homes",
    image: "https://example.com/images/hero.jpg",
  });
});

test("keeps absolute images and omits missing, malformed or non-web images", () => {
  expect(
    intakeSitePreview({ ogImage: "https://cdn.example.com/hero.jpg" }, null)
      .image,
  ).toBe("https://cdn.example.com/hero.jpg");
  for (const ogImage of [
    undefined,
    "",
    "http://[",
    "javascript:alert(1)",
    "data:image/png;base64,abc",
  ]) {
    expect(intakeSitePreview({ ogImage }, null).image).toBeNull();
  }
  expect(intakeSitePreview(null, null)).toEqual({
    title: null,
    description: null,
    image: null,
  });
});
