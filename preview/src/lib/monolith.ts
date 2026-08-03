import { MONOLITH_PROD_API_URL, MONOLITH_STG_API_URL } from "astro:env/server";

import type { PregenArtifact } from "./artifact";

// Track-1 source: load a monolith-built prospect preview through the same
// token-gated endpoints the production sites renderer uses, normalized into
// the artifact shape so RenderSections is source-agnostic. Property data
// comes from the search endpoint, which the monolith answers from the
// prospect's extractedUnits for org-less preview requests — the units arrive
// already SearchUnit-shaped and pass through untouched (`searchUnits`).
//
// One URL, every environment: /m/<id>?t= tries staging then prod, so a link
// keeps working no matter which environment built the prospect. Tokens are
// per-environment bearer credentials; a cross-environment miss is a plain
// 404, so the fallthrough probes nothing. `?env=stg|prod` pins one explicitly.

const MAX_PAGES = 8;

export type MonolithEnv = "stg" | "prod";

const ENV_BASES: Array<{ env: MonolithEnv; base: string | undefined }> = [
  { env: "stg", base: MONOLITH_STG_API_URL },
  { env: "prod", base: MONOLITH_PROD_API_URL },
];

type MonolithConfig = {
  id: string;
  title: string;
  description: string;
  heroTitle?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  accentColor?: string | null;
  internalDomain?: string;
};

type MonolithPageSummary = { slug: string; name: string; kind: string };

export async function getMonolithPreview(
  websiteId: string,
  token: string,
  env?: MonolithEnv,
): Promise<PregenArtifact | null> {
  const bases = ENV_BASES.filter(
    (candidate) => candidate.base && (!env || candidate.env === env),
  );
  for (const candidate of bases) {
    const artifact = await loadFromBase(candidate.base!, websiteId, token);
    if (artifact) return artifact;
  }
  return null;
}

async function loadFromBase(
  baseUrl: string,
  websiteId: string,
  token: string,
): Promise<PregenArtifact | null> {
  if (!websiteId || !token) return null;
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    Accept: "application/json",
    "X-Prospect-Preview-Token": token,
  };

  const config = await getJson<MonolithConfig>(
    `${base}/saas/website/prospect-preview/${encodeURIComponent(websiteId)}`,
    headers,
  );
  if (!config) return null;

  const pageList =
    (await getJson<MonolithPageSummary[]>(
      `${base}/saas/website/prospect-preview/${encodeURIComponent(websiteId)}/pages`,
      headers,
    )) ?? [];

  const pages = (
    await Promise.all(
      pageList.slice(0, MAX_PAGES).map(async (summary) => {
        const page = await getJson<{
          slug: string;
          name: string;
          kind: string;
          titleTag?: string | null;
          descriptionTag?: string | null;
          sections: unknown[];
        }>(
          `${base}/saas/website/prospect-preview/${encodeURIComponent(websiteId)}/pages/${encodeURIComponent(summary.slug)}`,
          headers,
        );
        return page;
      }),
    )
  ).filter((page): page is NonNullable<typeof page> => page != null);

  // Search answers from extractedUnits for org-less prospect previews.
  const search = await postJson<{ results?: unknown[] }>(
    `${base}/saas/website/search?take=12`,
    { ...headers, "X-Website-Id": websiteId, "Content-Type": "application/json" },
    { filters: {} },
  );

  return {
    prospect: { domain: config.internalDomain ?? websiteId, name: config.title },
    version: 0,
    config: {
      title: config.title,
      description: config.description,
      heroTitle: config.heroTitle ?? null,
      logoUrl: config.logoUrl ?? null,
      faviconUrl: config.faviconUrl ?? null,
      accentColor: config.accentColor ?? null,
    },
    pages,
    extractedProperties: [],
    searchUnits: search?.results ?? [],
  };
}

async function getJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T | null> {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
