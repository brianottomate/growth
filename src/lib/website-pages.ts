/**
 * Classify a marketing-site URL path into a WebPageType + location parts.
 * Pure + rule-based so the sitemap importer, UI, and any future cron share
 * one source of truth. Dynamic pages (locations/properties/articles) number
 * in the thousands, so grouping quality lives or dies here.
 *
 * Order of precedence: MANUAL_OVERRIDES → fixed prefixes (/property,
 * /article, /help, legal set, brand set) → location grammar
 * (/{hub}[/{city}][/{category}]) → seo_landing for remaining root slugs.
 */
import type { WebPageType } from "@/server/db/website-schema";

export type WebPageClassification = {
  pageType: WebPageType;
  title: string;
  locationSlug?: string;
  citySlug?: string;
  categorySlug?: string;
};

/**
 * The map's job is to separate STATIC pages (hand-built, worth a row each)
 * from TEMPLATE pages (stamped out by the thousands). Any page type whose
 * count exceeds the importer's rollup threshold (default 20) is stored as
 * ONE rollup row — path `/{key}/*`, metadata below — instead of per-page
 * rows, so the DB holds the site's structure, not a copy of it.
 */
export type WebPageRollupMeta = {
  rollup: true;
  count: number;
  samplePaths: string[];
  /** Optional label for AI-spec groups that don't map to a WebPageType. */
  label?: string;
  /** For location types: pages per hub slug — powers the hub list UI. */
  byLocation?: Record<string, number>;
};

export const rollupPath = (key: string) => `/${key}/*`;

/** Display name for a location hub slug, honoring manual overrides. */
export const hubLabel = (slug: string) =>
  MANUAL_OVERRIDES[`/${slug}`]?.title ?? humanizeSlug(slug);

export function rollupMeta(metadata: unknown): WebPageRollupMeta | null {
  const m = metadata as WebPageRollupMeta | null;
  return m?.rollup === true ? m : null;
}

/** Amenity/audience category slugs used by location pages (observed set). */
export const LOCATION_CATEGORY_SLUGS = new Set([
  "families",
  "hot-tubs",
  "large-groups",
  "private-pool",
  "pet-friendly",
  "beachfront",
  "lakefront",
  "oceanfront",
]);

/** Hand-built marketing pages at the root — label map doubles as the set. */
export const BRAND_PAGE_LABELS: Record<string, string> = {
  "/about": "About",
  "/blog": "Blog index",
  "/careers": "Careers",
  "/locations": "Locations map",
  "/download": "Download app",
  "/list": "List your home",
  "/os": "WanderOS",
  "/events": "Events",
  "/ambassadors": "Ambassadors",
  "/travel-agents": "Travel agents",
  "/welcome": "Welcome",
  "/faq": "FAQ",
};

const LEGAL_PATHS = new Set([
  "/legal",
  "/cookies",
  "/booking-policy",
  "/good-neighbor-policy",
  "/accessibility",
  "/licensing",
  "/privacy",
  "/tos",
]);

const NON_LOCATION_ROOTS = new Set([
  "article",
  "blog",
  "help",
  "help-center",
  "mortgage-calculator",
  "property",
]);

/**
 * Manual escape hatch — sitemap classification is heuristic, and some slugs
 * need a human call (e.g. "/ca" is Canada, not California). Add entries here
 * when the wall shows a page in the wrong group; re-run the importer after.
 */
export const MANUAL_OVERRIDES: Record<
  string,
  Partial<WebPageClassification>
> = {
  "/ca": { pageType: "location_hub", title: "Canada", locationSlug: "ca" },
  "/united-states": {
    pageType: "location_hub",
    title: "United States",
    locationSlug: "united-states",
  },
  "/virgin-islands-us": {
    pageType: "location_hub",
    title: "U.S. Virgin Islands",
    locationSlug: "virgin-islands-us",
  },
  "/llms.txt": { pageType: "other", title: "llms.txt" },
};

export const CATEGORY_LABELS: Record<string, string> = {
  families: "Families",
  "hot-tubs": "Hot tubs",
  "large-groups": "Large groups",
  "private-pool": "Private pool",
  "pet-friendly": "Pet-friendly",
  beachfront: "Beachfront",
  lakefront: "Lakefront",
  oceanfront: "Oceanfront",
};

export const PAGE_TYPE_META: Record<
  WebPageType,
  { label: string; plural: string; color: string }
> = {
  home: { label: "Home", plural: "Home", color: "#f472b6" },
  brand: { label: "Brand page", plural: "Brand pages", color: "#38bdf8" },
  seo_landing: {
    label: "SEO landing",
    plural: "SEO landing pages",
    color: "#a78bfa",
  },
  location_hub: {
    label: "Location hub",
    plural: "Location hubs",
    color: "#34d399",
  },
  location_city: { label: "City page", plural: "City pages", color: "#4ade80" },
  location_category: {
    label: "Location category",
    plural: "Location category pages",
    color: "#a3e635",
  },
  property: { label: "Property", plural: "Property pages", color: "#f59e0b" },
  article: { label: "Article", plural: "Articles", color: "#fb7185" },
  legal: { label: "Legal", plural: "Legal pages", color: "#94a3b8" },
  help: { label: "Help", plural: "Help pages", color: "#67e8f9" },
  other: { label: "Other", plural: "Other pages", color: "#64748b" },
};

/** "luxury-vacation-rentals-park-city" → "Luxury Vacation Rentals Park City" */
export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Normalize sitemap quirks: double slashes, trailing slashes. */
export function normalizePath(path: string): string {
  const collapsed = path.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

/**
 * Classify one normalized path. `locationHubs` is the set of depth-1 slugs
 * known to be location hubs — derived by the caller from the sitemap itself
 * (a depth-1 slug that also appears as a prefix of deeper location URLs),
 * so new states/countries group correctly without code changes.
 */
export function classifyWebPage(
  path: string,
  locationHubs: Set<string>,
): WebPageClassification {
  const segments = path.split("/").filter(Boolean);
  const [first, second, third] = segments;

  const base: WebPageClassification = ((): WebPageClassification => {
    if (path === "/") return { pageType: "home", title: "Home" };

    if (first === "property") {
      const slug = second ?? "";
      return {
        pageType: "property",
        title: /^\d+$/.test(slug) ? `Property ${slug}` : humanizeSlug(slug),
      };
    }
    if (first === "article")
      return { pageType: "article", title: humanizeSlug(second ?? "") };
    if (first === "blog" && segments.length >= 2) {
      if (segments.length === 2 && second === "engineering") {
        return { pageType: "brand", title: "Engineering blog" };
      }
      return {
        pageType: "article",
        title: humanizeSlug(segments[segments.length - 1] ?? ""),
      };
    }
    if (first === "help" || first === "help-center")
      return {
        pageType: "help",
        title: humanizeSlug(segments[segments.length - 1] ?? "help"),
      };
    if (LEGAL_PATHS.has(path) || first === "terms-and-conditions")
      return { pageType: "legal", title: humanizeSlug(segments.join("-")) };

    const brandLabel = BRAND_PAGE_LABELS[path];
    if (brandLabel) return { pageType: "brand", title: brandLabel };

    // Location grammar: /{hub}[/{city-or-category}][/{category}]
    if (first && locationHubs.has(first)) {
      // Overridden hub titles (e.g. /ca → Canada) carry into child pages.
      const hubTitle =
        MANUAL_OVERRIDES[`/${first}`]?.title ?? humanizeSlug(first);
      if (segments.length === 1)
        return {
          pageType: "location_hub",
          title: hubTitle,
          locationSlug: first,
        };
      if (segments.length === 2) {
        if (LOCATION_CATEGORY_SLUGS.has(second!))
          return {
            pageType: "location_category",
            title: `${CATEGORY_LABELS[second!] ?? humanizeSlug(second!)} · ${hubTitle}`,
            locationSlug: first,
            categorySlug: second,
          };
        return {
          pageType: "location_city",
          title: `${humanizeSlug(second!)}, ${hubTitle}`,
          locationSlug: first,
          citySlug: second,
        };
      }
      if (segments.length === 3 && LOCATION_CATEGORY_SLUGS.has(third!))
        return {
          pageType: "location_category",
          title: `${CATEGORY_LABELS[third!] ?? humanizeSlug(third!)} · ${humanizeSlug(second!)}, ${hubTitle}`,
          locationSlug: first,
          citySlug: second,
          categorySlug: third,
        };
    }

    // Remaining root-level slugs are SEO landing pages
    // (/luxury-vacation-rentals-*, occasion pages, …).
    if (segments.length === 1)
      return { pageType: "seo_landing", title: humanizeSlug(first!) };

    return { pageType: "other", title: humanizeSlug(segments.join("-")) };
  })();

  const override = MANUAL_OVERRIDES[path];
  return override ? { ...base, ...override } : base;
}

/**
 * Derive the set of depth-1 location-hub slugs from all sitemap paths: a
 * root slug is a hub when deeper URLs exist under it whose second segment is
 * a city or category (e.g. /florida + /florida/miami). Manual hubs from
 * MANUAL_OVERRIDES are always included.
 */
export function deriveLocationHubs(paths: string[]): Set<string> {
  const roots = new Set<string>();
  const withChildren = new Set<string>();
  for (const p of paths) {
    const segs = p.split("/").filter(Boolean);
    if (segs.length === 1) roots.add(segs[0]!);
    if (segs.length >= 2 && !NON_LOCATION_ROOTS.has(segs[0]!))
      withChildren.add(segs[0]!);
  }
  const hubs = new Set([...roots].filter((r) => withChildren.has(r)));
  for (const [path, o] of Object.entries(MANUAL_OVERRIDES))
    if (o.pageType === "location_hub") hubs.add(path.replace(/^\//, ""));
  // "help" has child pages but is never a location hub.
  for (const root of NON_LOCATION_ROOTS) hubs.delete(root);
  return hubs;
}
