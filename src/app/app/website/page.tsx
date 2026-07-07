import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { CoverWall, type CoverItem } from "@/components/cover-wall";
import {
  CATEGORY_LABELS,
  PAGE_TYPE_META,
  hubLabel,
  humanizeSlug,
  rollupMeta,
} from "@/lib/website-pages";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, memberTable, webPageTable } from "@/server/db/schema";
import type { WebPage, WebPageType } from "@/server/db/website-schema";

/**
 * Website wall — the marketing-site counterpart to the Blog / Newsletters
 * walls. One row per public wander.com page (synced from sitemap.xml by
 * scripts/import-website.ts), grouped by page type because dynamic pages
 * (locations/properties/articles) measure in the thousands.
 */

type GroupKey = "brand" | "seo" | "locations" | "property" | "article" | "other";

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
  href: p.url,
  title: p.title,
  subtitle: p.description ?? p.path,
  date: p.lastmodAt
    ? p.lastmodAt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
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
          <span className="text-muted-foreground w-4 shrink-0 text-right text-xs">↗</span>
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
function LocationTree({ pages, full }: { pages: WebPage[]; full: boolean }) {
  const hubs = new Map<
    string,
    { hub?: WebPage; cities: Map<string, WebPage>; categories: Map<string, number>; total: number }
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
    if (p.pageType === "location_city" && p.citySlug) h.cities.set(p.citySlug, p);
    if (p.pageType === "location_category" && p.categorySlug)
      h.categories.set(p.categorySlug, (h.categories.get(p.categorySlug) ?? 0) + 1);
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
              href={h.hub?.url ?? `https://www.wander.com/${slug}`}
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
                .map(([cat, n]) => `${CATEGORY_LABELS[cat] ?? humanizeSlug(cat)} ${n}`)
                .join(" · ")}
            </p>
          )}
        </div>
      ))}
      {!full && sorted.length > shown.length && (
        <Link href="/app/website?group=locations" className="text-muted-foreground text-xs hover:underline">
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
function HubList({ pages }: { pages: WebPage[] }) {
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
          href={`https://www.wander.com/${hub}`}
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
}: {
  info: { count: number; samplePaths: string[] };
  label: string;
  note: string;
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
              href={`https://www.wander.com${p}`}
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

function SectionHeading({ title, count, href }: { title: string; count: number; href?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
        {title} · {count}
      </h2>
      {href && (
        <Link href={href} className="text-muted-foreground text-xs hover:underline">
          View all →
        </Link>
      )}
    </div>
  );
}

export default async function WebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { group: groupParam } = await searchParams;
  const group = GROUPS.find((g) => g.key === groupParam) ?? null;

  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
  });
  const brandIds = brands.map((b) => b.id);

  // Graceful before first provisioning: `web_page` may not exist yet
  // (schema ships in this repo; `bun run db:push` creates it).
  let pages: WebPage[] = [];
  let tableMissing = false;
  try {
    pages = brandIds.length
      ? await db.query.webPageTable.findMany({
          where: and(
            inArray(webPageTable.brandId, brandIds),
            eq(webPageTable.isActive, true),
            isNull(webPageTable.deletedAt),
          ),
          orderBy: [desc(webPageTable.lastmodAt)],
        })
      : [];
  } catch {
    tableMissing = true;
  }

  const byType = new Map<WebPageType, WebPage[]>();
  for (const p of pages) {
    const arr = byType.get(p.pageType) ?? [];
    arr.push(p);
    byType.set(p.pageType, arr);
  }
  const ofGroup = (g: (typeof GROUPS)[number]) => g.types.flatMap((t) => byType.get(t) ?? []);
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

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {totalCount ? `${totalCount.toLocaleString()} pages` : "No pages synced yet"} ·
            wander.com · via sitemap.xml
            {lastSynced
              ? ` · synced ${lastSynced.toLocaleDateString([], { month: "short", day: "numeric" })}`
              : ""}
          </p>
        </div>
        <a
          href="https://www.wander.com/sitemap.xml"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-accent rounded-full border px-3 py-1.5 text-xs font-medium"
        >
          sitemap.xml ↗
        </a>
      </div>

      {/* group facets */}
      <div className="mt-5 flex flex-wrap gap-2 border-b pb-4">
        <Link href="/app/website" className={chip(!group)}>
          All · {totalCount.toLocaleString()}
        </Link>
        {GROUPS.map((g) => (
          <Link key={g.key} href={`/app/website?group=${g.key}`} className={chip(group?.key === g.key)}>
            {g.label} · {groupCount(g).toLocaleString()}
          </Link>
        ))}
      </div>

      {(tableMissing || pages.length === 0) && (
        <div className="mt-8 rounded-xl border p-6 text-sm">
          <p className="font-medium">No website pages yet.</p>
          <p className="text-muted-foreground mt-2">
            {tableMissing
              ? "The web_page table isn't provisioned yet — run `bun run db:push`, then sync:"
              : "Sync the page map from the live sitemap:"}
          </p>
          <pre className="bg-muted mt-3 rounded-lg p-3 text-xs">
            bun run scripts/import-website.ts --enrich
          </pre>
        </div>
      )}

      {!group && pages.length > 0 && (
        <>
          <section className="mt-8">
            <SectionHeading title="Brand pages" count={brandPages.length} href="/app/website?group=brand" />
            <CoverWall items={brandPages.map(toCoverItem)} />
          </section>
          <section className="mt-10">
            <SectionHeading title="SEO landing pages" count={seo.count} href="/app/website?group=seo" />
            {seo.isRollup ? (
              <BulkSummary
                info={seo}
                label="SEO landing pages"
                note="Template group — stored as an aggregate."
              />
            ) : (
              <CoverWall items={seoPages.slice(0, 12).map(toCoverItem)} />
            )}
          </section>
          <section className="mt-10">
            <SectionHeading
              title="Locations"
              count={pageCount(locationPages)}
              href="/app/website?group=locations"
            />
            {locationsRolled ? (
              <HubList pages={locationPages} />
            ) : (
              <LocationTree pages={locationPages} full={false} />
            )}
          </section>
          <section className="mt-10 grid gap-4 sm:grid-cols-2">
            <Link
              href="/app/website?group=property"
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
              href="/app/blog"
              className="hover:border-foreground/30 rounded-xl border p-5 transition-colors"
            >
              <div className="text-2xl font-semibold tabular-nums">
                {article.count.toLocaleString()}
              </div>
              <div className="text-muted-foreground mt-1 text-sm">
                Articles · /article/[slug] → Blog wall
              </div>
            </Link>
          </section>
          {otherPages.length > 0 && (
            <section className="mt-10">
              <SectionHeading title="Legal · Help · Other" count={otherPages.length} />
              <PathList pages={otherPages} />
            </section>
          )}
        </>
      )}

      {group?.key === "brand" && <div className="mt-6"><CoverWall items={brandPages.map(toCoverItem)} /></div>}
      {group?.key === "seo" && (
        <div className="mt-6">
          {seo.isRollup ? (
            <BulkSummary
              info={seo}
              label="SEO landing pages"
              note="Template group — stored as an aggregate. Raise the threshold (`--rollup-over=N`) to keep per-page rows."
            />
          ) : (
            <CoverWall items={seoPages.map(toCoverItem)} />
          )}
        </div>
      )}
      {group?.key === "locations" && (
        <div className="mt-6">
          {locationsRolled ? (
            <HubList pages={locationPages} />
          ) : (
            <LocationTree pages={locationPages} full />
          )}
        </div>
      )}
      {group?.key === "property" && (
        <div className="mt-6">
          {property.isRollup ? (
            <BulkSummary
              info={property}
              label="property pages"
              note="Template group — the map tracks the count, not a row per property. Run the importer with `--rollup-over=5000` for per-page rows (e.g. churn analysis)."
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
            <Link href="/app/blog" className="underline">
              open the Blog wall
            </Link>
            .
          </p>
          {article.isRollup ? (
            <BulkSummary
              info={article}
              label="articles"
              note="Stored as an aggregate here; the Blog wall is the per-article surface."
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
