import "server-only";

import { and, eq, notInArray, sql } from "drizzle-orm";

import {
  PAGE_TYPE_META,
  classifyWebPage,
  deriveLocationHubs,
  normalizePath,
  rollupPath,
  type WebPageRollupMeta,
} from "@/lib/website-pages";
import type {
  WebsiteAuditEntry,
  WebsiteAuditIssue,
  WebsiteAuditResult,
} from "@/lib/website-audit";
import { db } from "@/server/db";
import { webPageTable } from "@/server/db/schema";
import type { WebPageType } from "@/server/db/website-schema";

const MAX_URLS = 10_000;
const MAX_SITEMAPS = 100;
const ROLLUP_OVER = 20;
const MAX_AUDIT_URLS = 500;
const ENRICHABLE: WebPageType[] = [
  "home",
  "brand",
  "seo_landing",
  "location_hub",
];
const LOCATION_TYPES: WebPageType[] = [
  "location_hub",
  "location_city",
  "location_category",
];

type SitemapEntry = { path: string; lastmod: Date | null };
type PageRow = typeof webPageTable.$inferInsert;

export function normalizeWebsite(value: string): URL {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  return new URL(url.origin);
}

function xmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function fetchDocument(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { "user-agent": "GrowthWebsiteMap/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  return response.text();
}

async function sitemapCandidates(site: URL): Promise<string[]> {
  const candidates = [
    new URL("/sitemap.xml", site).href,
    new URL("/sitemap_index.xml", site).href,
  ];
  const robots = await fetchDocument(new URL("/robots.txt", site).href).catch(
    () => null,
  );
  if (robots) {
    for (const match of robots.matchAll(/^sitemap:\s*(\S+)/gim)) {
      if (match[1]) candidates.unshift(match[1]);
    }
  }
  return [...new Set(candidates)];
}

export async function readSitemap(site: URL) {
  const roots = await sitemapCandidates(site);
  let rootUrl: string | null = null;
  let rootXml: string | null = null;
  for (const candidate of roots) {
    const xml = await fetchDocument(candidate).catch(() => null);
    if (xml && /<(urlset|sitemapindex)[\s>]/i.test(xml)) {
      rootUrl = candidate;
      rootXml = xml;
      break;
    }
  }
  if (!rootUrl || !rootXml) {
    throw new Error(`No sitemap found for ${site.hostname}`);
  }

  const queue: { url: string; xml?: string }[] = [
    { url: rootUrl, xml: rootXml },
  ];
  const visited = new Set<string>();
  const entries = new Map<string, SitemapEntry>();

  while (
    queue.length > 0 &&
    visited.size < MAX_SITEMAPS &&
    entries.size < MAX_URLS
  ) {
    const next = queue.shift()!;
    if (visited.has(next.url)) continue;
    visited.add(next.url);
    const xml = next.xml ?? (await fetchDocument(next.url).catch(() => null));
    if (!xml) continue;

    for (const match of xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi)) {
      if (match[1]) queue.push({ url: xmlText(match[1].trim()) });
    }
    for (const match of xml.matchAll(
      /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/gi,
    )) {
      if (entries.size >= MAX_URLS || !match[1]) break;
      const pageUrl = new URL(xmlText(match[1].trim()));
      const pageHost = pageUrl.hostname.replace(/^www\./, "");
      const siteHost = site.hostname.replace(/^www\./, "");
      if (pageHost !== siteHost) continue;
      const path = normalizePath(pageUrl.pathname || "/");
      const parsedLastmod = match[2] ? new Date(match[2]) : null;
      entries.set(path, {
        path,
        lastmod:
          parsedLastmod && !Number.isNaN(parsedLastmod.getTime())
            ? parsedLastmod
            : null,
      });
    }
  }

  if (!entries.has("/")) entries.set("/", { path: "/", lastmod: null });
  return { sitemapUrl: rootUrl, entries: [...entries.values()] };
}

type ParsedPageMetadata = {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogImageWidth: string | null;
  ogImageHeight: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  canonical: string | null;
};

function parsePageMetadata(html: string, url: string): ParsedPageMetadata {
  const decode = (value: string | null) =>
    value
      ?.replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'")
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .trim() || null;
  const meta = (key: string) =>
    decode(
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${key}["']`,
        "i",
      )
        .exec(html)
        ?.slice(1)
        .find(Boolean) ?? null,
    );
  const title = decode(
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null,
  );
  const canonical = decode(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(
      html,
    )?.[1] ??
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i.exec(
        html,
      )?.[1] ??
      null,
  );
  const ogImage = meta("og:image");
  const twitterImage = meta("twitter:image");
  const absolute = (value: string | null) => {
    if (!value) return null;
    try {
      return new URL(value, url).href;
    } catch {
      return value;
    }
  };
  const ogTitle = meta("og:title");
  const ogDescription = meta("og:description");
  return {
    title,
    description: meta("description"),
    ogTitle,
    ogDescription,
    ogImage: absolute(ogImage),
    ogImageWidth: meta("og:image:width"),
    ogImageHeight: meta("og:image:height"),
    twitterCard: meta("twitter:card"),
    twitterTitle: meta("twitter:title"),
    twitterDescription: meta("twitter:description"),
    twitterImage: absolute(twitterImage),
    canonical: absolute(canonical),
  };
}

export async function fetchPageMetadata(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "GrowthWebsiteMap/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const html = (await response.text()).slice(0, 250_000);
  const parsed = parsePageMetadata(html, url);
  return {
    title: parsed.title ?? parsed.ogTitle ?? undefined,
    description: parsed.description ?? parsed.ogDescription,
    ogImage: parsed.ogImage,
    metadata: {
      ogTitle: parsed.ogTitle,
      ogDescription: parsed.ogDescription,
      ogImageWidth: parsed.ogImageWidth,
      ogImageHeight: parsed.ogImageHeight,
      twitterCard: parsed.twitterCard,
      twitterTitle: parsed.twitterTitle,
      twitterDescription: parsed.twitterDescription,
      twitterImage: parsed.twitterImage,
      canonical: parsed.canonical,
      metadataFetchedAt: new Date().toISOString(),
    },
  };
}

function auditIssues(
  metadata: ParsedPageMetadata,
  fetchError: string | null,
): WebsiteAuditIssue[] {
  if (fetchError) return ["fetch_error"];
  const issues: WebsiteAuditIssue[] = [];
  if (!metadata.title) issues.push("missing_title");
  if (!metadata.description) issues.push("missing_description");
  if (!metadata.ogTitle) issues.push("missing_og_title");
  if (!metadata.ogDescription) issues.push("missing_og_description");
  if (!metadata.ogImage) issues.push("missing_og_image");
  if (!metadata.twitterCard) issues.push("missing_twitter_card");
  if (!metadata.canonical) issues.push("missing_canonical");
  if (metadata.title && metadata.ogTitle && metadata.title !== metadata.ogTitle)
    issues.push("title_mismatch");
  if (
    metadata.description &&
    metadata.ogDescription &&
    metadata.description !== metadata.ogDescription
  )
    issues.push("description_mismatch");
  if (
    metadata.twitterTitle &&
    metadata.ogTitle &&
    metadata.twitterTitle !== metadata.ogTitle
  )
    issues.push("twitter_title_mismatch");
  if (
    metadata.twitterDescription &&
    metadata.ogDescription &&
    metadata.twitterDescription !== metadata.ogDescription
  )
    issues.push("twitter_description_mismatch");
  if ((metadata.title?.length ?? 0) > 60) issues.push("title_too_long");
  if ((metadata.description?.length ?? 0) > 160)
    issues.push("description_too_long");
  if (
    metadata.ogImageWidth &&
    metadata.ogImageHeight &&
    (metadata.ogImageWidth !== "1200" || metadata.ogImageHeight !== "630")
  )
    issues.push("unexpected_og_dimensions");
  if (metadata.twitterCard && metadata.twitterCard !== "summary_large_image")
    issues.push("unexpected_twitter_card");
  return issues;
}

const emptyMetadata = (): ParsedPageMetadata => ({
  title: null,
  description: null,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogImageWidth: null,
  ogImageHeight: null,
  twitterCard: null,
  twitterTitle: null,
  twitterDescription: null,
  twitterImage: null,
  canonical: null,
});

async function auditPage(input: {
  site: URL;
  path: string;
  hubs: Set<string>;
}): Promise<WebsiteAuditEntry> {
  const url = new URL(input.path, input.site).href;
  let metadata = emptyMetadata();
  let fetchError: string | null = null;
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "GrowthWebsiteAudit/1.0" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok) {
      fetchError = `HTTP ${response.status}`;
    } else {
      metadata = parsePageMetadata(
        (await response.text()).slice(0, 250_000),
        url,
      );
    }
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Fetch failed";
  }
  const classification = classifyWebPage(input.path, input.hubs);
  const issues = auditIssues(metadata, fetchError);
  const complete = Boolean(
    !fetchError &&
    metadata.title &&
    metadata.description &&
    metadata.ogTitle &&
    metadata.ogDescription &&
    metadata.ogImage &&
    metadata.twitterCard,
  );
  return {
    url,
    path: input.path,
    pageType: classification.pageType,
    group: PAGE_TYPE_META[classification.pageType].label,
    ...metadata,
    fetchError,
    complete,
    issues,
  };
}

export async function auditBrandWebsite(input: {
  website: string;
}): Promise<WebsiteAuditResult> {
  const site = normalizeWebsite(input.website);
  const { sitemapUrl, entries } = await readSitemap(site);
  const selected = entries.slice(0, MAX_AUDIT_URLS);
  const hubs = deriveLocationHubs(entries.map((entry) => entry.path));
  const audited: WebsiteAuditEntry[] = [];
  for (let index = 0; index < selected.length; index += 8) {
    audited.push(
      ...(await Promise.all(
        selected
          .slice(index, index + 8)
          .map((entry) => auditPage({ site, path: entry.path, hubs })),
      )),
    );
  }
  const mismatchIssues = new Set<WebsiteAuditIssue>([
    "title_mismatch",
    "description_mismatch",
    "twitter_title_mismatch",
    "twitter_description_mismatch",
  ]);
  return {
    website: site.href,
    sitemapUrl,
    auditedAt: new Date().toISOString(),
    totalDiscovered: entries.length,
    audited: audited.length,
    truncated: entries.length > selected.length,
    summary: {
      complete: audited.filter((entry) => entry.complete).length,
      withIssues: audited.filter((entry) => entry.issues.length > 0).length,
      fetchErrors: audited.filter((entry) => entry.fetchError).length,
      missingTitle: audited.filter((entry) => !entry.fetchError && !entry.title)
        .length,
      missingDescription: audited.filter(
        (entry) => !entry.fetchError && !entry.description,
      ).length,
      missingOgImage: audited.filter(
        (entry) => !entry.fetchError && !entry.ogImage,
      ).length,
      metadataMismatches: audited.filter((entry) =>
        entry.issues.some((issue) => mismatchIssues.has(issue)),
      ).length,
    },
    entries: audited.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export async function syncBrandWebsite(input: {
  brandId: string;
  website: string;
}) {
  const site = normalizeWebsite(input.website);
  const { sitemapUrl, entries } = await readSitemap(site);
  const now = new Date();
  const hubs = deriveLocationHubs(entries.map((entry) => entry.path));
  const classified = entries.map((entry) => {
    const classification = classifyWebPage(entry.path, hubs);
    return {
      brandId: input.brandId,
      path: entry.path,
      url: new URL(entry.path, site).href,
      title: classification.title,
      pageType: classification.pageType,
      locationSlug: classification.locationSlug ?? null,
      citySlug: classification.citySlug ?? null,
      categorySlug: classification.categorySlug ?? null,
      lastmodAt: entry.lastmod,
      lastSeenAt: now,
      isActive: true,
      isSeed: false,
    } satisfies PageRow;
  });

  const typeCounts = new Map<WebPageType, number>();
  for (const row of classified) {
    typeCounts.set(row.pageType, (typeCounts.get(row.pageType) ?? 0) + 1);
  }
  const rolledTypes = new Set(
    [...typeCounts.entries()]
      .filter(([, count]) => count > ROLLUP_OVER)
      .map(([type]) => type),
  );
  const rows = classified.filter((row) => !rolledTypes.has(row.pageType));
  const rollups = [...rolledTypes].map((type) => {
    const group = classified.filter((row) => row.pageType === type);
    const byLocation: Record<string, number> = {};
    if (LOCATION_TYPES.includes(type)) {
      for (const row of group) {
        if (row.locationSlug) {
          byLocation[row.locationSlug] =
            (byLocation[row.locationSlug] ?? 0) + 1;
        }
      }
    }
    const metadata: WebPageRollupMeta = {
      rollup: true,
      count: group.length,
      samplePaths: group.slice(0, 8).map((row) => row.path),
      ...(Object.keys(byLocation).length > 0 ? { byLocation } : {}),
    };
    return {
      brandId: input.brandId,
      path: rollupPath(type),
      url: site.href,
      title: PAGE_TYPE_META[type].plural,
      pageType: type,
      lastmodAt: null,
      lastSeenAt: now,
      isActive: true,
      isSeed: false,
      metadata,
    } satisfies PageRow;
  });
  const keptPaths = [...rows, ...rollups].map((row) => row.path);

  for (const row of [...rows, ...rollups]) {
    await db
      .insert(webPageTable)
      .values(row)
      .onConflictDoUpdate({
        target: [webPageTable.brandId, webPageTable.path],
        set: {
          url: sql`excluded.url`,
          title: sql`excluded.title`,
          pageType: sql`excluded.page_type`,
          locationSlug: sql`excluded.location_slug`,
          citySlug: sql`excluded.city_slug`,
          categorySlug: sql`excluded.category_slug`,
          lastmodAt: sql`excluded.lastmod_at`,
          lastSeenAt: sql`excluded.last_seen_at`,
          isActive: true,
          metadata: sql`coalesce(${webPageTable.metadata}, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb)`,
          updatedAt: sql`now()`,
        },
      });
  }

  await db
    .update(webPageTable)
    .set({ isActive: false })
    .where(
      and(
        eq(webPageTable.brandId, input.brandId),
        eq(webPageTable.isActive, true),
        notInArray(webPageTable.path, keptPaths),
      ),
    );

  const enrichmentTargets = rows
    .filter((row) => ENRICHABLE.includes(row.pageType))
    .slice(0, 50);
  for (let index = 0; index < enrichmentTargets.length; index += 5) {
    await Promise.all(
      enrichmentTargets.slice(index, index + 5).map(async (row) => {
        const enrichment = await fetchPageMetadata(row.url).catch(() => null);
        if (!enrichment) return;
        const { metadata, ...columns } = enrichment;
        await db
          .update(webPageTable)
          .set({
            ...columns,
            metadata: sql`coalesce(${webPageTable.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
          })
          .where(
            and(
              eq(webPageTable.brandId, input.brandId),
              eq(webPageTable.path, row.path),
            ),
          );
      }),
    );
  }

  return {
    sitemapUrl,
    discovered: entries.length,
    stored: rows.length + rollups.length,
    rollups: rollups.length,
  };
}
