import type { PreviewHome } from "@/components/brand/BrandPreviewStrip";

/** Preserve a previously chosen home photo without importing its listing facts. */
export function resolvePreviewHome(input: {
  brandName: string;
  featuredListingUrl: string | null;
  previewSourceUrl: string | null;
  ogImage: string | null;
  homes: { url: string; heroSourceUrl: string | null }[];
}): PreviewHome | null {
  const legacy = input.homes.find(
    (home) => home.url === input.featuredListingUrl,
  );
  const imageUrl =
    input.previewSourceUrl ?? legacy?.heroSourceUrl ?? input.ogImage;
  return imageUrl
    ? {
        name: input.brandName,
        imageUrl,
        place: null,
        facts: null,
        rating: null,
        source: "brand",
      }
    : null;
}
