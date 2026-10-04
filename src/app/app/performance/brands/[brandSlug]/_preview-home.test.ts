import { expect, test } from "bun:test";
import { resolvePreviewHome } from "./_preview-home";

const brand = {
  brandName: "Porchlit",
  featuredListingUrl: null,
  previewSourceUrl: null,
  ogImage: "https://example.com/site.jpg",
  homes: [],
};
test("website image previews need no representative home", () => {
  expect(resolvePreviewHome(brand)).toMatchObject({
    imageUrl: brand.ogImage,
    name: brand.brandName,
    facts: null,
    place: null,
    rating: null,
  });
});
test("previously selected home photos survive without importing property claims", () => {
  const preview = resolvePreviewHome({
    ...brand,
    featuredListingUrl: "https://example.com/home",
    homes: [
      {
        url: "https://example.com/home",
        heroSourceUrl: "https://example.com/home.jpg",
      },
    ],
  });
  expect(preview).toMatchObject({
    imageUrl: "https://example.com/home.jpg",
    name: brand.brandName,
    facts: null,
    place: null,
    rating: null,
  });
});
test("explicit image wins; no available image leaves the preview empty", () => {
  expect(
    resolvePreviewHome({
      ...brand,
      previewSourceUrl: "https://example.com/chosen.jpg",
    })?.imageUrl,
  ).toBe("https://example.com/chosen.jpg");
  expect(resolvePreviewHome({ ...brand, ogImage: null })).toBeNull();
});
