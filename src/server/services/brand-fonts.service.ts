import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { type BrandIdentity, brandTable } from "@/server/db/brand-schema";
import { fontsFromBranding } from "@/server/services/brand-enrichment.service";

export type GoogleFontFamily = {
  family: string;
  category: string;
};

type CatalogResponse = {
  familyMetadataList: Array<{
    family: string;
    category: string;
    popularity: number;
  }>;
};

// The catalog is ~2.7MB, over the Next data cache's 2MB entry limit, so it is
// cached per process instead. A failed read is not cached.
let catalog: Promise<GoogleFontFamily[]> | null = null;

/** Every Google Fonts family, most popular first. */
export function googleFontCatalog(): Promise<GoogleFontFamily[]> {
  if (!catalog) {
    catalog = (async () => {
      const response = await fetch("https://fonts.google.com/metadata/fonts", {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Google Fonts catalog: HTTP ${response.status}`);
      }
      const body = (await response.json()) as CatalogResponse;
      return body.familyMetadataList
        .slice()
        .sort((a, b) => a.popularity - b.popularity)
        .map(({ family, category }) => ({ family, category }));
    })();
    catalog.catch(() => {
      catalog = null;
    });
  }
  return catalog;
}

export class BrandFontError extends Error {}

/**
 * Set the fonts the brand's cards are set in, or with both null go back to
 * what the site uses. Only Google families: the renderer loads faces from
 * Google, and anything else would silently fall back to the house font.
 */
export async function setBrandFonts(input: {
  brandId: string;
  userId: string;
  heading: string | null;
  body: string | null;
}): Promise<BrandIdentity> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: { brandIdentity: true },
  });
  if (!brand) throw new BrandFontError("Brand not found");
  const identity = brand.brandIdentity ?? {};

  let next: BrandIdentity;
  if (input.heading === null && input.body === null) {
    next = {
      ...identity,
      fonts: fontsFromBranding(identity.raw),
      fontsChosen: null,
    };
  } else {
    const known = new Set(
      (await googleFontCatalog()).map((font) => font.family),
    );
    for (const family of [input.heading, input.body]) {
      if (family && !known.has(family)) {
        throw new BrandFontError(`${family} is not a Google font`);
      }
    }
    const fonts: NonNullable<BrandIdentity["fonts"]> = [];
    if (input.body) fonts.push({ family: input.body, role: "body" });
    if (input.heading && input.heading !== input.body) {
      fonts.push({ family: input.heading, role: "heading" });
    }
    next = {
      ...identity,
      fonts,
      fontsChosen: { by: input.userId, at: new Date().toISOString() },
    };
  }

  await db
    .update(brandTable)
    .set({ brandIdentity: next })
    .where(eq(brandTable.id, input.brandId));
  return next;
}
