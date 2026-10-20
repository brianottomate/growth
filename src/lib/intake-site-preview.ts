import type { BrandWebsiteMeta } from "@/server/db/brand-schema";

/** Only public link-preview fields cross the onboarding boundary. */
export function intakeSitePreview(
  meta: BrandWebsiteMeta | null,
  website: string | null,
) {
  let image: string | null = null;
  if (meta?.ogImage) {
    try {
      const url = new URL(meta.ogImage, website ?? undefined);
      if (url.protocol === "https:" || url.protocol === "http:")
        image = url.href;
    } catch {
      // A malformed saved image does not stop onboarding.
    }
  }
  return {
    title: meta?.title ?? null,
    description: meta?.description ?? null,
    image,
  };
}
