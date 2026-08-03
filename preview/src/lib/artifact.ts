import { PREGEN_API_URL } from "astro:env/server";

export type PregenArtifact = {
  prospect: { domain: string; name: string | null };
  version: number;
  config: {
    title: string;
    description: string;
    heroTitle?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    accentColor?: string | null;
  };
  pages: Array<{
    slug: string;
    name: string;
    kind: string;
    titleTag?: string | null;
    descriptionTag?: string | null;
    sections: unknown[];
  }>;
  extractedProperties: Array<{
    name: string;
    url?: string;
    imageUrls: string[];
    bedrooms?: number;
    bathrooms?: number;
    sleeps?: number;
    location?: string;
    priceHint?: string;
  }>;
};

/**
 * Resolve a preview token via the growth artifact API — the deliberate
 * boundary between this renderer and the growth database. Unknown tokens
 * are 404s and resolve to null; the route then 404s in turn.
 */
export async function getArtifactByToken(
  token: string,
): Promise<PregenArtifact | null> {
  if (!PREGEN_API_URL || !token) return null;

  const response = await fetch(
    `${PREGEN_API_URL.replace(/\/$/, "")}/api/pregen/preview/${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) return null;

  return (await response.json()) as PregenArtifact;
}
