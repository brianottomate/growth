import {
  mapWebsite,
  isFirecrawlConfigured,
} from "@/server/clients/firecrawl.client";

// =====================================================
// TYPES
// =====================================================

type MetaTags = {
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

type PageAudit = {
  url: string;
  path: string;
  status: "ok" | "error" | "timeout";
  statusCode: number | null;
  meta: MetaTags;
  issues: string[];
};

type GroupStats = {
  total: number;
  withTitle: number;
  withDescription: number;
  withOgImage: number;
  withTwitterCard: number;
  withCanonical: number;
  avgScore: number;
  errorCount: number;
};

type PageGroup = {
  label: string;
  slug: string;
  pages: PageAudit[];
  /** When true, this group has many dynamic routes — show summary + samples */
  collapsed: boolean;
  /** 3-5 sample pages when collapsed */
  samples: PageAudit[];
  stats: GroupStats;
  /** Total URLs discovered (may be >> pages.length for bulk groups) */
  discoveredCount: number;
};

// =====================================================
// URL FILTERING
// =====================================================

/** File extensions that are NOT web pages — filter before fetching */
const NON_PAGE_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".xml",
  ".txt",
  ".css",
  ".js",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".map",
  ".ts",
  ".tsx",
  ".jsx",
  ".yaml",
  ".yml",
  ".csv",
  ".pdf",
]);

function isPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    // Check if path ends with a non-page extension
    for (const ext of NON_PAGE_EXTENSIONS) {
      if (path.endsWith(ext)) return false;
    }
    // Filter common non-page paths
    if (path.startsWith("/api/") || path.startsWith("/_next/")) return false;
    return true;
  } catch {
    return false;
  }
}

// =====================================================
// URL GROUPING
// =====================================================

function classifyUrl(url: string): string {
  const path = new URL(url).pathname;

  // Blog / Articles
  if (path.startsWith("/blog") || path.startsWith("/article")) return "blog";

  // Properties / Listings
  if (
    path.startsWith("/property") ||
    path.startsWith("/properties") ||
    path.startsWith("/homes") ||
    path.startsWith("/listings") ||
    path.startsWith("/home/")
  )
    return "properties";

  // Destinations / Locations — sub-grouped by URL depth & pattern
  const US_STATES_AND_COUNTRIES = new Set([
    "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
    "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
    "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
    "minnesota","mississippi","missouri","montana","nebraska","nevada",
    "new-hampshire","new-jersey","new-mexico","new-york","north-carolina",
    "north-dakota","ohio","oklahoma","oregon","pennsylvania","rhode-island",
    "south-carolina","south-dakota","tennessee","texas","utah","vermont",
    "virginia","washington","west-virginia","wisconsin","wyoming",
    "mexico","canada","colombia","dominican-republic","virgin-islands-us",
    "united-states","ca",
  ]);

  // Themed destination landing pages (depth 1, non-state)
  if (
    path.startsWith("/destinations") ||
    path.startsWith("/locations") ||
    path.startsWith("/cities") ||
    path.startsWith("/states") ||
    path.startsWith("/vacation-rentals") ||
    /^\/luxury-[\w-]+-vacation-rentals/.test(path) ||
    /^\/vacation-rentals-near-/.test(path)
  )
    return "destinations-themed";

  // State / country / city / filter pages
  const segments = path.split("/").filter(Boolean);
  const firstSeg = segments[0];
  if (firstSeg && US_STATES_AND_COUNTRIES.has(firstSeg)) {
    if (segments.length === 1) return "destinations-states";
    if (segments.length === 2) return "destinations-cities";
    return "destinations-filters";
  }

  // Help Center
  if (
    path.startsWith("/help") ||
    path.startsWith("/support") ||
    path.startsWith("/faq")
  )
    return "help";

  // Legal
  if (
    path.startsWith("/privacy") ||
    path.startsWith("/terms") ||
    path.startsWith("/tos") ||
    path.startsWith("/legal")
  )
    return "legal";

  // Search / Explore
  if (path.startsWith("/search") || path.startsWith("/explore"))
    return "search";

  // Marketing — root-level pages
  if (
    path === "/" ||
    path === "" ||
    path.startsWith("/about") ||
    path.startsWith("/pricing") ||
    path.startsWith("/careers") ||
    path.startsWith("/press") ||
    path.startsWith("/contact") ||
    path.startsWith("/list") ||
    path.startsWith("/partners") ||
    path.startsWith("/referral") ||
    path.startsWith("/gift") ||
    path.startsWith("/os") ||
    path.startsWith("/download") ||
    path.startsWith("/events") ||
    path.startsWith("/ambassadors") ||
    path.startsWith("/travel-agents") ||
    path.startsWith("/refer") ||
    path.startsWith("/reviews") ||
    path.startsWith("/corporate-rental") ||
    path.startsWith("/company-retreats") ||
    path.startsWith("/bachelorette-") ||
    path.startsWith("/bachelor-") ||
    path.startsWith("/micro-wedding") ||
    path.startsWith("/large-") ||
    path.startsWith("/spring-break") ||
    path.startsWith("/baby-shower") ||
    path.startsWith("/oceanfront-") ||
    path.startsWith("/galveston-") ||
    path.startsWith("/corolla-")
  )
    return "marketing";

  return "other";
}

const GROUP_LABELS: Record<string, string> = {
  marketing: "Marketing",
  properties: "Properties",
  "destinations-themed": "Destinations — Themed Landing Pages",
  "destinations-states": "Destinations — States & Countries",
  "destinations-cities": "Destinations — Cities",
  "destinations-filters": "Destinations — City Filters (pet-friendly, hot-tubs, etc.)",
  blog: "Blog",
  help: "Help Center",
  legal: "Legal",
  search: "Search / Explore",
  other: "Other",
};

const GROUP_ORDER = [
  "marketing",
  "destinations-themed",
  "destinations-states",
  "destinations-cities",
  "destinations-filters",
  "properties",
  "blog",
  "help",
  "legal",
  "search",
  "other",
];

/** Threshold: groups with more pages than this show summary + samples */
const COLLAPSE_THRESHOLD = 8;
/** Number of sample pages to show for collapsed groups */
const SAMPLE_COUNT = 5;

/** Route groups with many dynamic pages — only fetch meta for samples */
const BULK_GROUPS = new Set(["properties", "destinations-cities", "destinations-filters", "blog"]);
/** Number of sample pages to audit from bulk groups */
const BULK_SAMPLE_COUNT = 3;

// =====================================================
// META TAG EXTRACTION (plain fetch + regex)
// =====================================================

function extractMeta(tag: string, html: string): string | null {
  // <meta name="X" content="…"> or <meta property="X" content="…">
  const re = new RegExp(
    `<meta\\s+(?:[^>]*?)?(?:name|property)=["']${tag}["'][^>]*?content=["']([^"']*?)["']`,
    "i",
  );
  const match = html.match(re);
  if (match) return match[1] ?? null;

  // reversed attribute order: content before name/property
  const re2 = new RegExp(
    `<meta\\s+(?:[^>]*?)?content=["']([^"']*?)["'][^>]*?(?:name|property)=["']${tag}["']`,
    "i",
  );
  const match2 = html.match(re2);
  return match2?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function extractCanonical(html: string): string | null {
  const match = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*?)["']/i,
  );
  if (match) return match[1] ?? null;
  const match2 = html.match(
    /<link[^>]*href=["']([^"']*?)["'][^>]*rel=["']canonical["']/i,
  );
  return match2?.[1] ?? null;
}

function parseMetaTags(html: string): MetaTags {
  return {
    title: extractTitle(html),
    description: extractMeta("description", html),
    ogTitle: extractMeta("og:title", html),
    ogDescription: extractMeta("og:description", html),
    ogImage: extractMeta("og:image", html),
    ogImageWidth: extractMeta("og:image:width", html),
    ogImageHeight: extractMeta("og:image:height", html),
    twitterCard: extractMeta("twitter:card", html),
    twitterTitle: extractMeta("twitter:title", html),
    twitterDescription: extractMeta("twitter:description", html),
    twitterImage: extractMeta("twitter:image", html),
    canonical: extractCanonical(html),
  };
}

// =====================================================
// ISSUE DETECTION
// =====================================================

function detectIssues(meta: MetaTags): string[] {
  const issues: string[] = [];
  if (!meta.title) issues.push("Missing <title>");
  else if (meta.title.length > 60)
    issues.push(`Title too long (${meta.title.length} chars, max 60)`);
  if (!meta.description) issues.push("Missing meta description");
  else if (meta.description.length > 160)
    issues.push(
      `Description too long (${meta.description.length} chars, max 160)`,
    );
  if (!meta.ogTitle) issues.push("Missing og:title");
  if (!meta.ogDescription) issues.push("Missing og:description");
  if (!meta.ogImage) issues.push("Missing og:image");
  if (!meta.twitterCard) issues.push("Missing twitter:card");
  if (!meta.twitterImage && !meta.ogImage) issues.push("No social share image");
  if (!meta.canonical) issues.push("Missing canonical URL");
  return issues;
}

// =====================================================
// SCORING
// =====================================================

function computeScore(audit: PageAudit): number {
  if (audit.status !== "ok") return 0;
  const fields = [
    audit.meta.title,
    audit.meta.description,
    audit.meta.ogTitle,
    audit.meta.ogDescription,
    audit.meta.ogImage,
    audit.meta.twitterCard,
    audit.meta.canonical,
  ];
  const filled = fields.filter(Boolean).length;
  let score = Math.round((filled / fields.length) * 100);
  // Penalize over-length
  if (audit.meta.title && audit.meta.title.length > 60) score -= 5;
  if (audit.meta.description && audit.meta.description.length > 160)
    score -= 5;
  return Math.max(0, Math.min(100, score));
}

// =====================================================
// GROUP STATS
// =====================================================

function computeGroupStats(pages: PageAudit[]): GroupStats {
  const okPages = pages.filter((p) => p.status === "ok");
  const total = pages.length;
  return {
    total,
    withTitle: okPages.filter((p) => p.meta.title).length,
    withDescription: okPages.filter((p) => p.meta.description).length,
    withOgImage: okPages.filter((p) => p.meta.ogImage).length,
    withTwitterCard: okPages.filter((p) => p.meta.twitterCard).length,
    withCanonical: okPages.filter((p) => p.meta.canonical).length,
    avgScore:
      total > 0
        ? Math.round(pages.reduce((s, a) => s + computeScore(a), 0) / total)
        : 0,
    errorCount: pages.filter((p) => p.status !== "ok").length,
  };
}

/** Pick diverse samples: first page, last page, one with issues, one clean, one random */
function pickSamples(pages: PageAudit[], count: number): PageAudit[] {
  if (pages.length <= count) return pages;

  const samples = new Map<string, PageAudit>();

  // First and last (sorted alphabetically)
  samples.set(pages[0]!.url, pages[0]!);
  samples.set(pages[pages.length - 1]!.url, pages[pages.length - 1]!);

  // One with most issues
  const withIssues = [...pages].sort(
    (a, b) => b.issues.length - a.issues.length,
  );
  if (withIssues[0] && withIssues[0].issues.length > 0) {
    samples.set(withIssues[0].url, withIssues[0]);
  }

  // One clean page
  const clean = pages.find((p) => p.issues.length === 0 && p.status === "ok");
  if (clean) samples.set(clean.url, clean);

  // Fill remaining with evenly spaced pages
  const step = Math.max(1, Math.floor(pages.length / (count + 1)));
  for (let i = step; samples.size < count && i < pages.length; i += step) {
    samples.set(pages[i]!.url, pages[i]!);
  }

  return [...samples.values()].slice(0, count);
}

// =====================================================
// FETCH + AUDIT
// =====================================================

async function auditUrl(url: string): Promise<PageAudit> {
  const path = new URL(url).pathname || "/";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WanderGrowthBot/1.0; +https://www.wander.com)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        url,
        path,
        status: "error",
        statusCode: response.status,
        meta: {
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
        },
        issues: [`HTTP ${response.status}`],
      };
    }

    const html = await response.text();
    const meta = parseMetaTags(html);
    const issues = detectIssues(meta);

    return {
      url,
      path,
      status: "ok",
      statusCode: response.status,
      meta,
      issues,
    };
  } catch (error) {
    const isAbort =
      error instanceof DOMException && error.name === "AbortError";
    return {
      url,
      path,
      status: isAbort ? "timeout" : "error",
      statusCode: null,
      meta: {
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
      },
      issues: [isAbort ? "Timeout (10s)" : String(error)],
    };
  }
}

// =====================================================
// FALLBACK URLS
// =====================================================

const FALLBACK_PATHS = [
  "/",
  "/about",
  "/pricing",
  "/careers",
  "/contact",
  "/press",
  "/terms",
  "/privacy",
  "/faq",
  "/blog",
  "/blog/best-luxury-vacation-rentals",
  "/blog/wander-vs-airbnb",
  "/destinations",
  "/destinations/hawaii",
  "/destinations/colorado",
  "/destinations/florida",
  "/destinations/california",
  "/vacation-rentals",
  "/search",
  "/explore",
];

// =====================================================
// SITEMAP FETCH (plain fetch + regex, no XML parser)
// =====================================================

async function fetchSitemapUrls(): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch("https://www.wander.com/sitemap.xml", {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WanderGrowthBot/1.0; +https://www.wander.com)",
        Accept: "application/xml, text/xml, */*",
      },
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const xml = await response.text();

    // Extract all <loc> URLs
    const locs: string[] = [];
    const locRegex = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      const url = match[1]?.trim();
      if (url) locs.push(url);
    }

    // If this is a sitemap index, fetch each child sitemap
    if (xml.includes("<sitemapindex")) {
      const childResults = await Promise.all(
        locs.map(async (sitemapUrl) => {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 15_000);
            const res = await fetch(sitemapUrl, {
              signal: ctrl.signal,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (compatible; WanderGrowthBot/1.0; +https://www.wander.com)",
                Accept: "application/xml, text/xml, */*",
              },
            });
            clearTimeout(t);
            if (!res.ok) return [];
            const childXml = await res.text();
            const childLocs: string[] = [];
            const childLocRegex = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
            let m;
            while ((m = childLocRegex.exec(childXml)) !== null) {
              const u = m[1]?.trim();
              if (u) childLocs.push(u);
            }
            return childLocs;
          } catch {
            return [];
          }
        }),
      );
      return childResults.flat();
    }

    return locs;
  } catch {
    return [];
  }
}

// =====================================================
// DATA LOADING
// =====================================================

async function loadAuditData(): Promise<{
  urls: string[];
  filteredCount: number;
  audits: PageAudit[];
  groups: PageGroup[];
  source: "sitemap" | "sitemap+firecrawl" | "firecrawl" | "fallback";
  error?: string;
}> {
  let sitemapUrls: string[] = [];
  let firecrawlUrls: string[] = [];
  let source: "sitemap" | "sitemap+firecrawl" | "firecrawl" | "fallback" =
    "sitemap";
  let error: string | undefined;

  // 1. Primary source: wander.com/sitemap.xml
  sitemapUrls = await fetchSitemapUrls();

  // 2. Secondary source: Firecrawl map (only if sitemap returned few/no URLs)
  if (isFirecrawlConfigured && sitemapUrls.length < 20) {
    try {
      const result = await mapWebsite({
        url: "https://www.wander.com",
        limit: 200,
      });
      if (result?.links?.length) {
        firecrawlUrls = result.links;
      }
    } catch (e) {
      if (sitemapUrls.length === 0) {
        error = `Firecrawl error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  // Determine source label
  if (sitemapUrls.length > 0 && firecrawlUrls.length > 0) {
    source = "sitemap+firecrawl";
  } else if (sitemapUrls.length > 0) {
    source = "sitemap";
  } else if (firecrawlUrls.length > 0) {
    source = "firecrawl";
  } else {
    source = "fallback";
    error =
      error ??
      "Neither sitemap.xml nor Firecrawl returned URLs, using fallback list";
  }

  // Merge all discovered URLs
  const allUrls =
    source === "fallback"
      ? FALLBACK_PATHS.map((p) => `https://www.wander.com${p}`)
      : [...sitemapUrls, ...firecrawlUrls];

  // Deduplicate and filter to wander.com only
  const seen = new Set<string>();
  const uniqueUrls = allUrls.filter((u) => {
    try {
      const parsed = new URL(u);
      if (!parsed.hostname.endsWith("wander.com")) return false;
      // Normalize: strip trailing slash, fragment, query for dedup
      const key = parsed.origin + parsed.pathname.replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch {
      return false;
    }
  });

  // Filter out non-page URLs (.md, .json, .svg, images, etc.)
  const beforeFilter = uniqueUrls.length;
  const pageUrls = uniqueUrls.filter(isPageUrl);
  const filteredCount = beforeFilter - pageUrls.length;

  // Group URLs BEFORE fetching — bulk groups only get sampled
  const urlsByGroup = new Map<string, string[]>();
  for (const url of pageUrls) {
    const group = classifyUrl(url);
    if (!urlsByGroup.has(group)) urlsByGroup.set(group, []);
    urlsByGroup.get(group)!.push(url);
  }

  // Build the list of URLs to actually audit
  const urlsToAudit: string[] = [];
  const discoveredCounts = new Map<string, number>();

  for (const [group, urls] of urlsByGroup) {
    discoveredCounts.set(group, urls.length);

    if (BULK_GROUPS.has(group) && urls.length > BULK_SAMPLE_COUNT) {
      // Pick deterministic samples: first, middle, last (sorted by path)
      const sorted = [...urls].sort((a, b) => {
        const pa = new URL(a).pathname;
        const pb = new URL(b).pathname;
        return pa.localeCompare(pb);
      });
      const picks = new Set<string>();
      picks.add(sorted[0]!);
      picks.add(sorted[Math.floor(sorted.length / 2)]!);
      picks.add(sorted[sorted.length - 1]!);
      urlsToAudit.push(...picks);
    } else {
      urlsToAudit.push(...urls);
    }
  }

  // Fetch meta in parallel (concurrency of 10)
  const CONCURRENCY = 10;
  const audits: PageAudit[] = [];
  for (let i = 0; i < urlsToAudit.length; i += CONCURRENCY) {
    const batch = urlsToAudit.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(auditUrl));
    audits.push(...results);
  }

  // Group audited results
  const auditsByGroup = new Map<string, PageAudit[]>();
  for (const audit of audits) {
    const group = classifyUrl(audit.url);
    if (!auditsByGroup.has(group)) auditsByGroup.set(group, []);
    auditsByGroup.get(group)!.push(audit);
  }

  const groups: PageGroup[] = GROUP_ORDER.filter(
    (slug) =>
      auditsByGroup.has(slug) || (discoveredCounts.get(slug) ?? 0) > 0,
  ).map((slug) => {
    const pages = (auditsByGroup.get(slug) ?? []).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    const discovered = discoveredCounts.get(slug) ?? pages.length;
    const isBulk = BULK_GROUPS.has(slug) && discovered > BULK_SAMPLE_COUNT;
    const collapsed = isBulk || pages.length > COLLAPSE_THRESHOLD;
    const stats = computeGroupStats(pages);
    const samples =
      collapsed && !isBulk ? pickSamples(pages, SAMPLE_COUNT) : pages;

    return {
      label: GROUP_LABELS[slug] ?? slug,
      slug,
      pages,
      collapsed,
      samples,
      stats,
      discoveredCount: discovered,
    };
  });

  return { urls: urlsToAudit, filteredCount, audits, groups, source, error };
}

// =====================================================
// COMPONENTS
// =====================================================

function StatCard({
  label,
  value,
  color,
  subtitle,
}: {
  label: string;
  value: number | string;
  color?: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums ${color ?? "text-gray-900"}`}
      >
        {value}
      </div>
      {subtitle && (
        <div className="mt-0.5 text-[10px] text-gray-400">{subtitle}</div>
      )}
    </div>
  );
}

function IssueTag({ issue }: { issue: string }) {
  const isMissing = issue.toLowerCase().startsWith("missing");
  const isWarning = issue.includes("too long");
  const isError = issue.startsWith("HTTP") || issue === "Timeout (10s)";

  const color = isError
    ? "bg-red-50 text-red-700 border-red-200"
    : isMissing
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : isWarning
        ? "bg-yellow-50 text-yellow-700 border-yellow-200"
        : "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${color}`}
    >
      {issue}
    </span>
  );
}

function OgImagePreview({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-[52px] w-[100px] items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-[10px] text-gray-400">
        No image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="OG preview"
      className="h-[52px] w-[100px] rounded border border-gray-200 object-cover"
      loading="lazy"
    />
  );
}

// ---------------------------------------------------------------------------
// Multi-platform share previews
// ---------------------------------------------------------------------------

function OgThumb({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        className={`bg-gray-100 object-cover ${className ?? ""}`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center bg-gray-100 text-[10px] text-gray-400 ${className ?? ""}`}
    >
      No og:image
    </div>
  );
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function FacebookCard({ page }: { page: PageAudit }) {
  const title = page.meta.ogTitle ?? page.meta.title;
  const desc = page.meta.ogDescription ?? page.meta.description;
  const domain = getDomain(page.url);
  return (
    <div className="w-[200px] shrink-0 overflow-hidden rounded-md border bg-white shadow-sm">
      <OgThumb src={page.meta.ogImage} alt="" className="h-[105px] w-full" />
      <div className="space-y-0.5 px-2 pb-1.5 pt-1">
        <div className="text-[9px] uppercase text-gray-400">{domain}</div>
        <div className="line-clamp-2 text-[11px] font-semibold leading-tight text-[#1d2129]">
          {title ? (title.length > 50 ? title.slice(0, 50) + "…" : title) : "—"}
        </div>
        <div className="line-clamp-1 text-[10px] text-gray-500">
          {desc ? (desc.length > 70 ? desc.slice(0, 70) + "…" : desc) : "—"}
        </div>
      </div>
    </div>
  );
}

function LinkedInCard({ page }: { page: PageAudit }) {
  const title = page.meta.ogTitle ?? page.meta.title;
  const domain = getDomain(page.url);
  return (
    <div className="w-[200px] shrink-0 overflow-hidden rounded-md border bg-white shadow-sm">
      <OgThumb src={page.meta.ogImage} alt="" className="h-[105px] w-full" />
      <div className="space-y-0.5 border-t px-2 pb-1.5 pt-1">
        <div className="line-clamp-2 text-[11px] font-semibold leading-tight text-[#000000e6]">
          {title ? (title.length > 50 ? title.slice(0, 50) + "…" : title) : "—"}
        </div>
        <div className="text-[9px] text-gray-500">{domain}</div>
      </div>
    </div>
  );
}

function XCard({ page }: { page: PageAudit }) {
  const title = page.meta.twitterTitle ?? page.meta.ogTitle ?? page.meta.title;
  const domain = getDomain(page.url);
  return (
    <div className="w-[200px] shrink-0 overflow-hidden rounded-2xl border bg-black shadow-sm">
      <OgThumb
        src={page.meta.twitterImage ?? page.meta.ogImage}
        alt=""
        className="h-[105px] w-full"
      />
      <div className="px-2 pb-1.5 pt-1">
        <div className="line-clamp-1 text-[11px] font-medium leading-tight text-white">
          {title ? (title.length > 45 ? title.slice(0, 45) + "…" : title) : "—"}
        </div>
        <div className="mt-0.5 text-[9px] text-gray-500">{domain}</div>
      </div>
    </div>
  );
}

function IGCard({ page }: { page: PageAudit }) {
  const title = page.meta.ogTitle ?? page.meta.title;
  const domain = getDomain(page.url);
  return (
    <div className="w-[140px] shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm">
      <OgThumb src={page.meta.ogImage} alt="" className="h-[140px] w-full" />
      <div className="px-1.5 pb-1 pt-0.5">
        <div className="line-clamp-1 text-[10px] font-semibold text-gray-900">
          {title ? (title.length > 30 ? title.slice(0, 30) + "…" : title) : "—"}
        </div>
        <div className="text-[9px] text-gray-400">{domain}</div>
      </div>
    </div>
  );
}

function SharePreviews({ page }: { page: PageAudit }) {
  return (
    <div className="flex flex-wrap gap-3 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-medium text-gray-400">
          Facebook / WhatsApp
        </span>
        <FacebookCard page={page} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-medium text-gray-400">LinkedIn</span>
        <LinkedInCard page={page} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-medium text-gray-400">
          X (Twitter)
        </span>
        <XCard page={page} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-medium text-gray-400">
          Instagram DM
        </span>
        <IGCard page={page} />
      </div>
    </div>
  );
}

function CharCount({ value, max }: { value: string | null; max: number }) {
  if (!value) return <span className="text-gray-400">—</span>;
  const len = value.length;
  const isOver = len > max;
  return (
    <span className={isOver ? "font-medium text-amber-600" : "text-gray-500"}>
      {len}/{max}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-500"
      : score >= 50
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span
        className={`text-xs font-medium tabular-nums ${
          score >= 80
            ? "text-green-700"
            : score >= 50
              ? "text-yellow-700"
              : "text-red-700"
        }`}
      >
        {score}%
      </span>
    </div>
  );
}

function Pct({ n, total }: { n: number; total: number }) {
  if (total === 0) return <span className="text-gray-400">—</span>;
  const pct = Math.round((n / total) * 100);
  const color =
    pct >= 90
      ? "text-green-700"
      : pct >= 70
        ? "text-yellow-700"
        : "text-red-700";
  return (
    <span className={`font-medium ${color}`}>
      {pct}%{" "}
      <span className="font-normal text-gray-400">
        ({n}/{total})
      </span>
    </span>
  );
}

/** Summary row for collapsed groups — aggregate stats instead of per-page table */
function GroupSummary({ group }: { group: PageGroup }) {
  const { stats } = group;
  const okCount = stats.total - stats.errorCount;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Aggregate stats bar */}
      <div className="grid grid-cols-2 gap-4 border-b border-gray-100 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">
            Pages discovered
          </div>
          <div className="text-sm font-medium text-gray-900">
            {group.discoveredCount}
            {group.discoveredCount !== stats.total && (
              <span className="ml-1 text-xs text-gray-400">
                ({stats.total} sampled)
              </span>
            )}
            {stats.errorCount > 0 && (
              <span className="ml-1 text-xs text-red-500">
                ({stats.errorCount} errors)
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">
            Has title
          </div>
          <div className="text-sm">
            <Pct n={stats.withTitle} total={okCount} />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">
            Has description
          </div>
          <div className="text-sm">
            <Pct n={stats.withDescription} total={okCount} />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">
            Has og:image
          </div>
          <div className="text-sm">
            <Pct n={stats.withOgImage} total={okCount} />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">
            Has twitter:card
          </div>
          <div className="text-sm">
            <Pct n={stats.withTwitterCard} total={okCount} />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">
            Avg score
          </div>
          <div className="text-sm">
            <ScoreBar score={stats.avgScore} />
          </div>
        </div>
      </div>

      {/* Sample pages */}
      <div className="px-4 py-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">
          Sample pages ({group.samples.length} of {group.discoveredCount})
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Path
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Title
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-700">
                  Title len
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-700">
                  Desc len
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-700">
                  OG Image
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-700">
                  Score
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {group.samples.map((page) => (
                <PageRow key={page.url} page={page} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Reusable table row for a single page audit */
function PageRow({ page }: { page: PageAudit }) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="sticky left-0 z-10 bg-white px-3 py-2">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-blue-600 hover:underline"
            title={page.url}
          >
            {page.path.length > 50
              ? page.path.slice(0, 47) + "…"
              : page.path || "/"}
          </a>
          {page.status !== "ok" && (
            <span className="ml-1 text-[10px] text-red-500">
              {page.statusCode ?? page.status}
            </span>
          )}
        </td>
        <td className="max-w-[200px] truncate px-3 py-2 text-xs text-gray-700">
          {page.meta.title ?? <span className="text-red-400">—</span>}
        </td>
        <td className="px-3 py-2 text-center text-xs">
          <CharCount value={page.meta.title} max={60} />
        </td>
        <td className="px-3 py-2 text-center text-xs">
          <CharCount value={page.meta.description} max={160} />
        </td>
        <td className="px-3 py-2 text-center">
          <OgImagePreview url={page.meta.ogImage} />
        </td>
        <td className="px-3 py-2 text-center">
          <ScoreBar score={computeScore(page)} />
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {page.issues.length === 0 ? (
              <span className="text-[11px] text-green-600">✓ Clean</span>
            ) : (
              page.issues.map((issue) => <IssueTag key={issue} issue={issue} />)
            )}
          </div>
        </td>
      </tr>
      <tr className="border-b border-gray-100">
        <td colSpan={7} className="px-3 pb-3">
          <details className="group">
            <summary className="cursor-pointer text-[10px] font-medium text-gray-400 hover:text-gray-600 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">▶ Share previews</span>
              <span className="hidden group-open:inline">▼ Share previews</span>
            </summary>
            <SharePreviews page={page} />
          </details>
        </td>
      </tr>
    </>
  );
}

/** Full table for small groups that show every page */
function GroupTable({ group }: { group: PageGroup }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-700">
              Path
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">
              Title
            </th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">
              Title len
            </th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">
              Desc len
            </th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">
              OG Image
            </th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">
              Score
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">
              Issues
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {group.pages.map((page) => (
            <PageRow key={page.url} page={page} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================
// PAGE
// =====================================================

export default async function OgMapPage() {
  const startTime = Date.now();
  const { audits, filteredCount, groups, source, error } =
    await loadAuditData();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const totalDiscovered = groups.reduce((s, g) => s + g.discoveredCount, 0);

  // Summary stats (only count fetched/audited pages)
  const totalPages = audits.length;
  const okPages = audits.filter((a) => a.status === "ok").length;
  const errorPages = audits.filter((a) => a.status !== "ok").length;
  const withOgImage = audits.filter((a) => a.meta.ogImage).length;
  const missingOgImage = okPages - withOgImage;
  const withComplete = audits.filter((a) => a.issues.length === 0).length;
  const titleTooLong = audits.filter(
    (a) => a.meta.title && a.meta.title.length > 60,
  ).length;
  const descTooLong = audits.filter(
    (a) => a.meta.description && a.meta.description.length > 160,
  ).length;
  const avgScore =
    totalPages > 0
      ? Math.round(
          audits.reduce((s, a) => s + computeScore(a), 0) / totalPages,
        )
      : 0;

  return (
    <div className="min-h-screen bg-white p-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          OG / Meta Tag Audit
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Auditing <strong>wander.com</strong> — {totalDiscovered} pages
          discovered, {totalPages} audited in {elapsed}s via{" "}
          <span className="font-mono text-xs">
            {source === "sitemap+firecrawl"
              ? "sitemap.xml + Firecrawl + fetch"
              : source === "sitemap"
                ? "sitemap.xml + fetch"
                : source === "firecrawl"
                  ? "Firecrawl map + fetch"
                  : "fallback URLs + fetch"}
          </span>
          {filteredCount > 0 && (
            <span className="ml-1 text-gray-400">
              ({filteredCount} non-page URLs filtered out)
            </span>
          )}
        </p>
        {error && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠️ {error}
          </div>
        )}
      </header>

      {/* Info banner */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <strong>How this works:</strong> URLs discovered from
        wander.com/sitemap.xml (primary) merged with Firecrawl map. Bulk route
        groups (properties, destinations, blog) show {BULK_SAMPLE_COUNT} sampled
        pages to avoid excessive requests. Meta tags fetched server-side with
        plain HTML parsing (no JS rendering). Non-page URLs are automatically
        filtered out.
        {filteredCount > 0 && (
          <span className="ml-1 font-medium">
            {filteredCount} non-page URLs were excluded from this scan.
          </span>
        )}
      </div>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Pages scanned" value={totalPages} />
        <StatCard
          label="Successful"
          value={okPages}
          color="text-green-700"
        />
        <StatCard
          label="Errors"
          value={errorPages}
          color={errorPages > 0 ? "text-red-700" : undefined}
          subtitle={errorPages > 0 ? "HTTP errors / timeouts" : undefined}
        />
        <StatCard
          label="Complete meta"
          value={withComplete}
          color="text-green-700"
        />
        <StatCard
          label="Missing og:image"
          value={missingOgImage}
          color={missingOgImage > 0 ? "text-amber-600" : undefined}
        />
        <StatCard
          label="Title too long"
          value={titleTooLong}
          color={titleTooLong > 0 ? "text-amber-600" : undefined}
        />
        <StatCard
          label="Desc too long"
          value={descTooLong}
          color={descTooLong > 0 ? "text-amber-600" : undefined}
        />
        <StatCard
          label="Avg score"
          value={`${avgScore}%`}
          color={
            avgScore >= 80
              ? "text-green-700"
              : avgScore >= 50
                ? "text-yellow-700"
                : "text-red-700"
          }
        />
      </div>

      {/* Overall Score */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Overall Health
          </span>
          <ScoreBar score={avgScore} />
        </div>
      </div>

      {/* Grouped Sections */}
      {groups.map((group) => {
        const groupClean = group.pages.filter(
          (p) => p.issues.length === 0,
        ).length;
        const groupOk = group.stats.total - group.stats.errorCount;

        return (
          <section key={group.slug} className="mb-10" id={group.slug}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {group.label}
              </h2>
              <span className="text-xs text-gray-500">
                {group.discoveredCount !== group.stats.total ? (
                  <>
                    {group.discoveredCount} pages in sitemap ·{" "}
                    {group.stats.total} sampled
                  </>
                ) : (
                  <>
                    {group.stats.total} page
                    {group.stats.total !== 1 ? "s" : ""} · {groupClean}/
                    {groupOk} clean
                  </>
                )}
              </span>
              {group.collapsed && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  Showing {group.samples.length} samples
                </span>
              )}
            </div>

            {group.collapsed ? (
              <GroupSummary group={group} />
            ) : (
              <GroupTable group={group} />
            )}
          </section>
        );
      })}

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-400">
        <p>
          OG/Meta audit generated at {new Date().toISOString()} —{" "}
          {totalDiscovered} pages discovered, {totalPages} audited,{" "}
          {filteredCount} non-page URLs filtered, {elapsed}s elapsed. Source:{" "}
          {source}. Meta tags parsed via plain fetch + regex (no
          Firecrawl scrape credits used).
        </p>
      </footer>
    </div>
  );
}
