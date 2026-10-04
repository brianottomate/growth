import type {
  CompositionFormatId,
  CompositionTemplateId,
} from "@/lib/compositions";

// Links into the Studio for ad previews. Client-safe: the brand page's
// lightboxes build them in the browser, and the server service re-exports them.

/** The house blueprint a preview starts from when nobody picked one. */
export const AD_PREVIEW_DEFAULTS = {
  templateId: "catalog-copy" satisfies CompositionTemplateId,
  formatId: "portrait" satisfies CompositionFormatId,
} as const;

export function performanceBrandPath(brand: {
  id: string;
  slug: string | null;
}) {
  return `/app/performance/clients/${brand.slug ?? brand.id}`;
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
export function reopenCardHref(input: {
  brandId: string;
  brandSlug: string | null;
  assetId: string;
}) {
  const params = new URLSearchParams({
    brandId: input.brandId,
    asset: input.assetId,
    adPreview: "1",
    back: performanceBrandPath({ id: input.brandId, slug: input.brandSlug }),
  });
  return `/app/compositions?${params.toString()}`;
}

/** A listing-page link, never a creative's image URL or a guessed home path. */
export function safeHomeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim()))
    return null;
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Human-readable destination; query parameters remain in the actual link. */
export function destinationLabel(value: string): string {
  const safe = safeHomeUrl(value);
  if (!safe) return value;
  const url = new URL(safe);
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
}
