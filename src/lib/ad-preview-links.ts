import type { CompositionFormatId, CompositionTemplateId } from "@/lib/compositions";

// Links into the Studio for ad previews. Client-safe: the brand page's
// lightboxes build them in the browser, and the server service re-exports them.

/** The house blueprint a preview starts from when nobody picked one. */
export const AD_PREVIEW_DEFAULTS = {
  templateId: "catalog-place" satisfies CompositionTemplateId,
  formatId: "portrait" satisfies CompositionFormatId,
} as const;

export function performanceBrandPath(brand: { id: string; slug: string | null }) {
  return `/app/performance/brands/${brand.slug ?? brand.id}`;
}

/** The Studio, opened to design an ad preview for this brand and come back. */
export function adPreviewStudioHref(input: {
  brandId: string;
  brandSlug: string | null;
  sourceAssetId?: string | null;
  templateId?: CompositionTemplateId;
  formatId?: CompositionFormatId;
  /** Copy to open the Studio with, so a preview tile continues as it looked. */
  title?: string;
  cta?: string;
  eyebrow?: string;
  subtitle?: string;
  rating?: number | null;
}) {
  const params = new URLSearchParams({
    brandId: input.brandId,
    template: input.templateId ?? AD_PREVIEW_DEFAULTS.templateId,
    format: input.formatId ?? AD_PREVIEW_DEFAULTS.formatId,
    adPreview: "1",
    back: performanceBrandPath({ id: input.brandId, slug: input.brandSlug }),
  });
  if (input.sourceAssetId) params.set("source", input.sourceAssetId);
  if (input.title) params.set("title", input.title);
  if (input.cta) params.set("cta", input.cta);
  if (input.eyebrow) params.set("eyebrow", input.eyebrow);
  if (input.subtitle) params.set("subtitle", input.subtitle);
  if (input.rating != null) params.set("rating", String(input.rating));
  return `/app/compositions?${params.toString()}`;
}

/** The Studio, reopening a card the brand already has, with the way back. */
export function reopenCardHref(input: { brandId: string; brandSlug: string | null; assetId: string }) {
  const params = new URLSearchParams({
    brandId: input.brandId,
    asset: input.assetId,
    adPreview: "1",
    back: performanceBrandPath({ id: input.brandId, slug: input.brandSlug }),
  });
  return `/app/compositions?${params.toString()}`;
}
