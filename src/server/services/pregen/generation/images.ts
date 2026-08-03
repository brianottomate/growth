import "server-only";

import type {
  PregenNativeExtractedProperty,
  PregenNativePage,
} from "@/server/db/schema";
import { isPageImageCandidate } from "./units";

// Deterministic image placement — replaces every placehold.co stub in the
// generated sections with real crawled imagery. Deliberately model-free for
// V1: og:image and top-unit photos are strong priors, and a wrong-but-real
// photo beats a gray box. The monolith's LLM slot-assignment + generation
// pipeline can layer on later.

const PLACEHOLDER_PATTERN = /placehold\.co/;

export type ImageSources = {
  ogImage?: string;
  homepageImages: string[];
  units: PregenNativeExtractedProperty[];
};

/**
 * Fill hero/cards/CTA image slots from crawled sources, spreading distinct
 * images across slots (hero gets the strongest candidate; each card its own
 * unit photo; CTA a later one). Pages are returned copied, never mutated.
 */
export function applyArtifactImages(
  pages: PregenNativePage[],
  pool: string[],
): PregenNativePage[] {
  if (pool.length === 0) return pages;

  let cursor = 0;
  const nextImage = () => {
    const image = pool[cursor % pool.length];
    cursor += 1;
    return image;
  };

  return pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => {
      const s = section as Record<string, unknown> & { type?: string };

      if (s.type === "homepage-hero" || s.type === "cta") {
        if (isPlaceholder(s.backgroundImageUrl)) {
          return { ...s, backgroundImageUrl: nextImage() };
        }
        return section;
      }

      if (s.type === "cards" && Array.isArray(s.items)) {
        return {
          ...s,
          items: (s.items as Record<string, unknown>[]).map((item) =>
            isPlaceholder(item.imageUrl) ? { ...item, imageUrl: nextImage() } : item,
          ),
        };
      }

      return section;
    }),
  }));
}

const isPlaceholder = (value: unknown): boolean =>
  typeof value !== "string" || value.length === 0 || PLACEHOLDER_PATTERN.test(value);

/**
 * Ordered candidate pool: og:image first (the site's own choice of hero),
 * then the lead photo of each extracted unit (already junk-filtered and
 * photo-ranked upstream), then remaining homepage candidates. De-duped so
 * slots don't repeat until the pool wraps.
 */
export function buildImagePool(sources: ImageSources): string[] {
  const seen = new Set<string>();
  const pool: string[] = [];
  const add = (url: unknown) => {
    if (typeof url === "string" && url.startsWith("http") && !seen.has(url)) {
      seen.add(url);
      pool.push(url);
    }
  };

  add(sources.ogImage);
  for (const unit of sources.units) add(unit.imageUrls[0]);
  for (const unit of sources.units) add(unit.imageUrls[1]);
  for (const url of sources.homepageImages.filter(isPageImageCandidate)) add(url);

  return pool;
}
