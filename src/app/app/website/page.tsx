import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { CoverWall, type CoverItem } from "@/components/cover-wall";
import { WebsitePortfolioAnalysisPanel } from "@/components/website-portfolio-analysis";
import { WebsiteLiveAudit } from "@/components/website-live-audit";
import { readWebsitePortfolioAnalysis } from "@/lib/content-analysis";
import {
  CATEGORY_LABELS,
  PAGE_TYPE_META,
  hubLabel,
  humanizeSlug,
  rollupMeta,
} from "@/lib/website-pages";
import { readSocialPreviewMode } from "@/lib/social-preview";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, memberTable, webPageTable } from "@/server/db/schema";
import type { WebPage, WebPageType } from "@/server/db/website-schema";
import { WebsiteControls } from "./WebsiteControls";

/**
 * Website wall — the marketing-site counterpart to the Blog / Newsletters
 * walls. One row per public page discovered from the selected owned brand's
 * sitemap, grouped by page type because dynamic pages can number in the
 * thousands.
 */

type GroupKey =
  | "brand"
  | "seo"
  | "locations"
  | "property"
  | "article"
  | "other";

const GROUPS: { key: GroupKey; label: string; types: WebPageType[] }[] = [
  { key: "brand", label: "Brand", types: ["home", "brand"] },
  { key: "seo", label: "SEO landing", types: ["seo_landing"] },
  {
    key: "locations",
    label: "Locations",
    types: ["location_hub", "location_city", "location_category"],
  },
  { key: "property", label: "Properties", types: ["property"] },
  { key: "article", label: "Articles", types: ["article"] },
  { key: "other", label: "Other", types: ["legal", "help", "other"] },
];

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "bg-foreground text-background border-foreground"
      : "border-border text-muted-foreground hover:bg-accent"
  }`;

/**
 * Bulk types (property/article) are usually stored as one rollup row with
 * `{rollup, count, samplePaths}` metadata; a heavy `--include-bulk` sync
 * stores per-page rows instead. Both shapes render.
 */
const bulkInfo = (arr: WebPage[]) => {
  const roll = arr.map((p) => rollupMeta(p.metadata)).find(Boolean);
  return roll
    ? { count: roll.count, samplePaths: roll.samplePaths, isRollup: true }
    : { count: arr.length, samplePaths: [], isRollup: false };
};

const toCoverItem = (p: WebPage): CoverItem => ({
  id: p.id,
  href: `/app/website/${p.id}`,
  title: p.title,
  subtitle: p.description ?? p.path,
  date: p.lastmodAt
    ? p.lastmodAt.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—",
  badge: {
    label: PAGE_TYPE_META[p.pageType].label,
    color: PAGE_TYPE_META[p.pageType].color,
  },
  coverImage: p.ogImage,
});

function PathList({ pages, cap }: { pages: WebPage[]; cap?: number }) {
  const shown = cap ? pages.slice(0, cap) : pages;
  return (
    <div className="flex flex-col">
      {shown.map((p) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-accent/40 -mx-2 flex items-center gap-3 rounded-lg border-b px-2 py-2.5 text-sm transition-colors last:border-0"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: PAGE_TYPE_META[p.pageType].color }}
            title={PAGE_TYPE_META[p.pageType].label}
          />
          <span className="min-w-0 flex-1 truncate">{p.title}</span>
          <span className="text-muted-foreground hidden min-w-0 shrink truncate text-xs sm:block">
            {p.path}
          </span>
          <span className="text-muted-foreground w-4 shrink-0 text-right text-xs">
            ↗
          </span>
        </a>
      ))}
      {cap && pages.length > cap && (
        <p className="text-muted-foreground mt-2 text-xs">
          Showing {cap} of {pages.length}.
        </p>
      )}
    </div>
  );
}

/** Location pages grouped hub → cities → category coverage. */
function LocationTree({
  pages,
  full,
  baseUrl,
  allHref,
}: {
  pages: WebPage[];
  full: boolean;
  baseUrl: string;
  allHref: string;
}) {
  const hubs = new Map<
    string,
    {
      hub?: WebPage;
      cities: Map<string, WebPage>;
      categories: Map<string, number>;
      total: number;
    }
  >();
  for (const p of pages) {
    if (!p.locationSlug) continue;
    let h = hubs.get(p.locationSlug);
    if (!h) {
      h = { cities: new Map(), categories: new Map(), total: 0 };
      hubs.set(p.locationSlug, h);
    }
    h.total++;
    if (p.pageType === "location_hub") h.hub = p;
    if (p.pageType === "location_city" && p.citySlug)
      h.cities.set(p.citySlug, p);
    if (p.pageType === "location_category" && p.categorySlug)
      h.categories.set(
        p.categorySlug,
        (h.categories.get(p.categorySlug) ?? 0) + 1,
      );
  }
  const sorted = [...hubs.entries()].sort((a, b) => b[1].total - a[1].total);
  const shown = full ? sorted : sorted.slice(0, 8);
  const cityCap = full ? Infinity : 14;

  return (
    <div className="flex flex-col gap-5">
      {shown.map(([slug, h]) => (
        <div key={slug} className="rounded-xl border p-4">
          <div className="flex items-baseline justify-between gap-2">
            <a
              href={h.hub?.url ?? new URL(slug, baseUrl).href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold hover:underline"
            >
              {h.hub?.title ?? hubLabel(slug)} ↗
            </a>
            <span className="text-muted-foreground text-xs">
              {h.total} pages · {h.cities.size} cities
            </span>
          </div>
          {h.cities.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...h.cities.values()].slice(0, cityCap).map((c) => (
                <a
                  key={c.id}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border text-muted-foreground hover:bg-accent rounded-full border px-2 py-0.5 text-[11px]"
                >
                  {c.citySlug ? humanizeSlug(c.citySlug) : c.title}
                </a>
              ))}
              {h.cities.size > cityCap && (
                <span className="text-muted-foreground px-1 py-0.5 text-[11px]">
                  +{h.cities.size - cityCap} more
                </span>
              )}
            </div>
          )}
          {h.categories.size > 0 && (
            <p className="text-muted-foreground mt-2 text-[11px]">
              Category pages:{" "}
              {[...h.categories.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(
                  ([cat, n]) =>
                    `${CATEGORY_LABELS[cat] ?? humanizeSlug(cat)} ${n}`,
                )
                .join(" · ")}
            </p>
          )}
        </div>
      ))}
      {!full && sorted.length > shown.length && (
        <Link
          href={allHref}
          className="text-muted-foreground text-xs hover:underline"
        >
          Show all {sorted.length} locations →
        </Link>
      )}
    </div>
  );
}

/**
 * Location groups rolled up: render the per-hub page counts stored in the
 * rollup metadata (`byLocation`) — the structural view without per-page rows.
 */
function HubList({ pages, baseUrl }: { pages: WebPage[]; baseUrl: string }) {
  const totals = new Map<string, number>();
  for (const p of pages) {
    const roll = rollupMeta(p.metadata);
    if (!roll?.byLocation) continue;
    for (const [hub, n] of Object.entries(roll.byLocation))
      totals.set(hub, (totals.get(hub) ?? 0) + n);
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  return (
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map(([hub, n]) => (
        <a
          key={hub}
          href={new URL(hub, baseUrl).href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-accent/40 -mx-2 flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
        >
          <span className="truncate">{hubLabel(hub)}</span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {n} pages
          </span>
        </a>
      ))}
    </div>
  );
}

/** Aggregate view for a rolled-up bulk group (no per-page rows). */
function BulkSummary({
  info,
  label,
  note,
  baseUrl,
}: {
  info: { count: number; samplePaths: string[] };
  label: string;
  note: string;
  baseUrl: string;
}) {
  return (
    <div className="rounded-xl border p-6">
      <div className="text-3xl font-semibold tabular-nums">
        {info.count.toLocaleString()}
      </div>
      <div className="text-muted-foreground mt-1 text-sm">{label}</div>
      {info.samplePaths.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {info.samplePaths.map((p) => (
            <a
              key={p}
              href={new URL(p, baseUrl).href}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border text-muted-foreground hover:bg-accent rounded-full border px-2 py-0.5 text-[11px]"
            >
              {p}
            </a>
          ))}
        </div>
      )}
      <p className="text-muted-foreground mt-4 text-xs">{note}</p>
    </div>
  );
}

function SectionHeading({
  title,
  count,
  href,
}: {
  title: string;
  count: number;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        {title} · {count}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-muted-foreground text-xs hover:underline"
        >
          View all →
        </Link>
      )}
    </div>
  );
}

export default async function WebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; brand?: string; preview?: string }>;
}) {
  const {
    group: groupParam,
    brand: brandParam,
    preview: previewParam,
  } = await searchParams;
  const preview = readSocialPreviewMode(previewParam);
  const group = GROUPS.find((g) => g.key === groupParam) ?? null;

  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    orderBy: (brand, { asc }) => asc(brand.createdAt),
  });
  if (brands.length === 0) {
    return (
      <div className="text-muted-foreground">
        Add an owned brand before mapping a website.
      </div>
    );
  }
  const selectedBrand = brandParam
    ? (brands.find((brand) => brand.slug === brandParam) ?? null)
    : null;
  const scopedBrandIds = selectedBrand
    ? [selectedBrand.id]
    : brands.map((brand) => brand.id);

  // Graceful before first provisioning: `web_page` may not exist yet
  // (schema ships in this repo; `bun run db:push` creates it).
  let pages: WebPage[] = [];
  let tableMissing = false;
  try {
    pages = await db.query.webPageTable.findMany({
      where: and(
        inArray(webPageTable.brandId, scopedBrandIds),
        eq(webPageTable.isActive, true),
        isNull(webPageTable.deletedAt),
      ),
      orderBy: [desc(webPageTable.lastmodAt)],
    });
  } catch {
    tableMissing = true;
  }

  const byType = new Map<WebPageType, WebPage[]>();
  for (const p of pages) {
    const arr = byType.get(p.pageType) ?? [];
    arr.push(p);
    byType.set(p.pageType, arr);
  }
  const ofGroup = (g: (typeof GROUPS)[number]) =>
    g.types.flatMap((t) => byType.get(t) ?? []);
  const lastSynced = pages.reduce<Date | null>(
    (acc, p) => (!acc || p.lastSeenAt > acc ? p.lastSeenAt : acc),
    null,
  );

  const brandPages = ofGroup(GROUPS[0]!);
  const seoPages = ofGroup(GROUPS[1]!);
  const locationPages = ofGroup(GROUPS[2]!);
  const propertyPages = byType.get("property") ?? [];
  const articlePages = byType.get("article") ?? [];
  const otherPages = ofGroup(GROUPS[5]!);

  const property = bulkInfo(propertyPages);
  const article = bulkInfo(articlePages);
  const seo = bulkInfo(seoPages);
  const locationsRolled = locationPages.some((p) => rollupMeta(p.metadata));
  // Rollup rows count as their aggregate, everything else as 1.
  const pageCount = (arr: WebPage[]) =>
    arr.reduce((n, p) => n + (rollupMeta(p.metadata)?.count ?? 1), 0);
  const groupCount = (g: (typeof GROUPS)[number]) => pageCount(ofGroup(g));
  const totalCount = pageCount(pages);
  const portfolioAnalysis = selectedBrand
    ? readWebsitePortfolioAnalysis(
        pages.find((page) => page.pageType === "home")?.metadata ??
          pages.find((page) => page.path === "/")?.metadata ??
          pages[0]?.metadata,
      )
    : null;
  const ogToolUrl =
    selectedBrand?.links?.find(
      (link) =>
        link.url &&
        /(?:og|open graph).*(?:generator|preview)|(?:generator|preview).*(?:og|open graph)/i.test(
          link.label,
        ),
    )?.url ?? null;
  const baseUrl = selectedBrand?.website
    ? new URL(
        /^https?:\/\//i.test(selectedBrand.website)
          ? selectedBrand.website
          : `https://${selectedBrand.website}`,
      ).origin + "/"
    : pages[0]
      ? new URL(pages[0].url).origin + "/"
      : null;
  const domain = baseUrl
    ? new URL(baseUrl).hostname.replace(/^www\./, "")
    : null;
  const websiteHref = (nextGroup?: GroupKey) => {
    const params = new URLSearchParams();
    if (selectedBrand?.slug) params.set("brand", selectedBrand.slug);
    if (preview !== "original") params.set("preview", preview);
    if (nextGroup) params.set("group", nextGroup);
    return `/app/website?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {totalCount
              ? `${totalCount.toLocaleString()} pages`
              : "No pages synced yet"}
            {selectedBrand
              ? domain
                ? ` · ${domain} · via sitemap.xml`
                : " · no website added"
              : ` · across ${brands.length} brands`}
            {lastSynced
              ? ` · synced ${lastSynced.toLocaleDateString([], { month: "short", day: "numeric" })}`
              : ""}
          </p>
        </div>
        <WebsiteControls
          brands={brands.flatMap((brand) =>
            brand.slug
              ? [
                  {
                    id: brand.id,
                    slug: brand.slug,
                    name: brand.name,
                    website: brand.website,
                  },
                ]
              : [],
          )}
          selectedBrandSlug={selectedBrand?.slug ?? null}
        />
      </div>

      {/* group facets */}
      <div className="mt-5 flex flex-wrap gap-2 border-b pb-4">
        <Link href={websiteHref()} className={chip(!group)}>
          All · {totalCount.toLocaleString()}
        </Link>
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={websiteHref(g.key)}
            className={chip(group?.key === g.key)}
          >
            {g.label} · {groupCount(g).toLocaleString()}
          </Link>
        ))}
      </div>

      {selectedBrand && (
        <WebsiteLiveAudit
          brandId={selectedBrand.id}
          brandName={selectedBrand.name}
          ogToolUrl={ogToolUrl}
        />
      )}

      <WebsitePortfolioAnalysisPanel
        brandId={selectedBrand?.id ?? null}
        scopeLabel={selectedBrand?.name ?? "all owned brands"}
        pageCount={pages.length}
        initialAnalysis={portfolioAnalysis}
      />

      {(tableMissing || pages.length === 0) && (
        <div className="mt-8 rounded-xl border p-6 text-sm">
          <p className="font-medium">No website pages yet.</p>
          <p className="text-muted-foreground mt-2">
            {tableMissing
              ? "Website storage is not provisioned in this environment yet."
              : selectedBrand && baseUrl
                ? "Use Sync sitemap above to map the live site. The workspace will classify the pages and keep this view current."
                : selectedBrand
                  ? "Add a website URL to this brand, then return here to sync its sitemap."
                  : "Choose a brand above, then sync its sitemap. Website remains an all-brand overview by default."}
          </p>
        </div>
      )}

      {!group && pages.length > 0 && (
        <>
          <section className="mt-8">
            <SectionHeading
              title="Brand pages"
              count={brandPages.length}
              href={websiteHref("brand")}
            />
            <CoverWall
              items={brandPages.map(toCoverItem)}
              variant="og"
              preview={preview}
            />
          </section>
          <section className="mt-10">
            <SectionHeading
              title="SEO landing pages"
              count={seo.count}
              href={websiteHref("seo")}
            />
            {seo.isRollup ? (
              <BulkSummary
                info={seo}
                label="SEO landing pages"
                note="Template group — stored as an aggregate."
                baseUrl={baseUrl!}
              />
            ) : (
              <CoverWall
                items={seoPages.slice(0, 12).map(toCoverItem)}
                variant="og"
                preview={preview}
              />
            )}
          </section>
          <section className="mt-10">
            <SectionHeading
              title="Locations"
              count={pageCount(locationPages)}
              href={websiteHref("locations")}
            />
            {locationsRolled ? (
              <HubList pages={locationPages} baseUrl={baseUrl!} />
            ) : (
              <LocationTree
                pages={locationPages}
                full={false}
                baseUrl={baseUrl!}
                allHref={websiteHref("locations")}
              />
            )}
          </section>
          <section className="mt-10 grid gap-4 sm:grid-cols-2">
            <Link
              href={websiteHref("property")}
              className="hover:border-foreground/30 rounded-xl border p-5 transition-colors"
            >
              <div className="text-2xl font-semibold tabular-nums">
                {property.count.toLocaleString()}
              </div>
              <div className="text-muted-foreground mt-1 text-sm">
                Property pages · /property/[id]
              </div>
            </Link>
            <Link
              href={
                selectedBrand?.slug
                  ? `/app/blog?brand=${selectedBrand.slug}`
                  : "/app/blog"
              }
              className="hover:border-foreground/30 rounded-xl border p-5 transition-colors"
            >
              <div className="text-2xl font-semibold tabular-nums">
                {article.count.toLocaleString()}
              </div>
              <div className="text-muted-foreground mt-1 text-sm">
                Published article pages → Blog wall
              </div>
            </Link>
          </section>
          {otherPages.length > 0 && (
            <section className="mt-10">
              <SectionHeading
                title="Legal · Help · Other"
                count={otherPages.length}
              />
              <PathList pages={otherPages} />
            </section>
          )}
        </>
      )}

      {group?.key === "brand" && (
        <div className="mt-6">
          <CoverWall
            items={brandPages.map(toCoverItem)}
            variant="og"
            preview={preview}
          />
        </div>
      )}
      {group?.key === "seo" && (
        <div className="mt-6">
          {seo.isRollup ? (
            <BulkSummary
              info={seo}
              label="SEO landing pages"
              note="Template group — stored as an aggregate to keep the site map useful at scale."
              baseUrl={baseUrl!}
            />
          ) : (
            <CoverWall
              items={seoPages.map(toCoverItem)}
              variant="og"
              preview={preview}
            />
          )}
        </div>
      )}
      {group?.key === "locations" && (
        <div className="mt-6">
          {locationsRolled ? (
            <HubList pages={locationPages} baseUrl={baseUrl!} />
          ) : (
            <LocationTree
              pages={locationPages}
              full
              baseUrl={baseUrl!}
              allHref={websiteHref("locations")}
            />
          )}
        </div>
      )}
      {group?.key === "property" && (
        <div className="mt-6">
          {property.isRollup ? (
            <BulkSummary
              info={property}
              label="property pages"
              note="Template group — the map tracks the count without storing thousands of repetitive rows."
              baseUrl={baseUrl!}
            />
          ) : (
            <PathList pages={propertyPages} cap={120} />
          )}
        </div>
      )}
      {group?.key === "article" && (
        <div className="mt-6">
          <p className="text-muted-foreground mb-4 text-sm">
            Articles have their own wall with topics and covers —{" "}
            <Link
              href={
                selectedBrand?.slug
                  ? `/app/blog?brand=${selectedBrand.slug}`
                  : "/app/blog"
              }
              className="underline"
            >
              open the Blog wall
            </Link>
            .
          </p>
          {article.isRollup ? (
            <BulkSummary
              info={article}
              label="articles"
              note="Stored as an aggregate here; the Blog wall is the per-article surface."
              baseUrl={baseUrl!}
            />
          ) : (
            <PathList pages={articlePages} cap={60} />
          )}
        </div>
      )}
      {group?.key === "other" && (
        <div className="mt-6">
          <PathList pages={otherPages} />
        </div>
      )}
    </div>
  );
}
