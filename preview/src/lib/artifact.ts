import { DATABASE_URL } from "astro:env/server";
import { neon } from "@neondatabase/serverless";

export type PregenArtifact = {
  prospectId: string;
  domain: string;
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
 * Resolve a preview token to its latest artifact. The token is the bearer
 * credential (`/p/<token>`); unknown tokens resolve to null and the route
 * 404s — same non-probing contract as the monolith preview endpoints.
 */
export async function getArtifactByToken(
  token: string,
): Promise<PregenArtifact | null> {
  if (!DATABASE_URL || !token) return null;

  const sql = neon(DATABASE_URL);
  const rows = (await sql`
    select
      p.id as prospect_id,
      p.domain,
      a.config,
      a.pages,
      b.extracted_properties
    from pregen_native_prospect p
    join pregen_native_artifact a on a.prospect_id = p.id
    join pregen_native_build b on b.id = a.build_id
    where p.preview_token = ${token}
    order by a.created_at desc
    limit 1
  `) as Array<{
    prospect_id: string;
    domain: string;
    config: PregenArtifact["config"];
    pages: PregenArtifact["pages"];
    extracted_properties: PregenArtifact["extractedProperties"] | null;
  }>;

  const row = rows[0];
  if (!row) return null;

  return {
    prospectId: row.prospect_id,
    domain: row.domain,
    config: row.config,
    pages: row.pages,
    extractedProperties: row.extracted_properties ?? [],
  };
}
