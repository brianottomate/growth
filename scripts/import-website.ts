/**
 * Import a marketing site's page map from its public sitemap.xml into the
 * growth DB — the persistent-pages counterpart to the blog and newsletter
 * imports (`import-blog.ts`). Defaults to wander.com / the wander brand.
 *
 *   bun run scripts/import-website.ts                    # sync (structure mode)
 *   bun run scripts/import-website.ts --enrich           # + OG tags for static pages
 *   bun run scripts/import-website.ts --rollup-over=5000 # keep big groups per-page
 *   bun run scripts/import-website.ts --sitemap=https://competitor.com/sitemap.xml \
 *     --brand=competitor --ai-spec                       # AI-classified foreign site
 *
 * The map's job is separating STATIC pages from TEMPLATE output, so any page
 * type with more than --rollup-over pages (default 20) is stored as ONE
 * rollup row ({rollup, count, samplePaths, byLocation}) instead of per-page
 * rows. Runs prune whichever representation the previous mode left behind.
 * Pages that drop out of the sitemap flip isActive=false (never deleted).
 *
 * Scale safeguards (an Airbnb-sized sitemap is ~8M URLs):
 *   - Parse budget: reading stops at --max-urls (default 25k, loudly logged)
 *     — this bounds counting, while --rollup-over bounds storage. Sitemap
 *     indexes (nested <sitemapindex> files) are followed within the budget.
 *   - Enrichment fetches OG tags for STATIC page types only, capped at 200.
 *
 * Classification: wander.com uses the deterministic rules in
 * src/lib/website-pages.ts (manual overrides included). For foreign sites,
 * --ai-spec discovers the group structure with one generateText +
 * Output.object call (house AI pattern) and classifies against that spec;
 * AI-spec groups store pageType="other" with the group key in metadata.
 * Inline here (not a service) because services are `server-only`.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  PAGE_TYPE_META,
  classifyWebPage,
  deriveLocationHubs,
  humanizeSlug,
  normalizePath,
  rollupPath,
  type WebPageRollupMeta,
} from "@/lib/website-pages";
import { db } from "@/server/db";
import { brandTable, organizationTable, webPageTable } from "@/server/db/schema";
import type { WebPageType } from "@/server/db/website-schema";

const strArg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`${name}=`))?.split("=")[1] ?? fallback;
const intArg = (name: string, fallback: number) => {
  const raw = process.argv.find((a) => a.startsWith(`${name}=`))?.split("=")[1];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const SITEMAP_URL = strArg("--sitemap", "https://www.wander.com/sitemap.xml");
const BASE_URL = new URL(SITEMAP_URL).origin;
const BRAND_SLUG = strArg("--brand", "wander");
const ENRICH = process.argv.includes("--enrich");
const AI_SPEC = process.argv.includes("--ai-spec");
const MAX_URLS = intArg("--max-urls", 25_000);
const ROLLUP_OVER = intArg("--rollup-over", 20); // 0 = never roll up
const ENRICHABLE: WebPageType[] = ["home", "brand", "seo_landing", "location_hub"];
const ENRICH_CONCURRENCY = 6;
const ENRICH_CAP = 200;
const LOCATION_TYPES: WebPageType[] = [
  "location_hub",
  "location_city",
  "location_category",
];

type SitemapEntry = { path: string; lastmod: Date | null };
type PageRow = typeof webPageTable.$inferInsert;

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "wander-growth-sitemap-sync" } });
  if (!r.ok) throw new Error(`sitemap fetch ${r.status}: ${url}`);
  return r.text();
}

/** Parse one urlset document into the shared map. Returns true if truncated. */
function parseUrlset(xml: string, byPath: Map<string, SitemapEntry>): boolean {
  for (const m of xml.matchAll(
    /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g,
  )) {
    if (byPath.size >= MAX_URLS) return true;
    const loc = m[1]!.trim();
    if (!loc.startsWith(BASE_URL)) continue;
    const path = normalizePath(loc.slice(BASE_URL.length) || "/");
    if (!byPath.has(path)) byPath.set(path, { path, lastmod: m[2] ? new Date(m[2]) : null });
  }
  return false;
}

async function fetchSitemap(): Promise<SitemapEntry[]> {
  const root = await fetchText(SITEMAP_URL);
  // Sitemap index (big sites split into child files) vs plain urlset.
  const children = [...root.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1]!.trim(),
  );
  const byPath = new Map<string, SitemapEntry>();
  let truncated = false;
  if (children.length) {
    console.log(`… sitemap index with ${children.length} child sitemaps`);
    for (const child of children) {
      if (byPath.size >= MAX_URLS) {
        truncated = true;
        break;
      }
      truncated = parseUrlset(await fetchText(child), byPath) || truncated;
    }
  } else {
    truncated = parseUrlset(root, byPath);
  }
  if (truncated)
    console.warn(
      `⚠️  parse budget hit — read ${byPath.size} URLs, more exist (raise with --max-urls=N)`,
    );
  // The homepage isn't always listed in the sitemap — include it.
  if (!byPath.has("/")) byPath.set("/", { path: "/", lastmod: null });
  return [...byPath.values()];
}

// ---- AI site spec (foreign sitemaps) --------------------------------

const SPEC_SCHEMA = z.object({
  groups: z
    .array(
      z.object({
        key: z.string().describe("short kebab-case group id, e.g. 'listing'"),
        label: z.string().describe("human label, e.g. 'Listing pages'"),
        prefixes: z
          .array(z.string())
          .describe("path prefixes that select this group, e.g. ['/rooms/']"),
        isTemplate: z
          .boolean()
          .describe("true = stamped-out template pages, false = hand-built static"),
      }),
    )
    .describe("ordered, first match wins; cover the whole site"),
});
type SiteSpec = z.infer<typeof SPEC_SCHEMA>;

/**
 * One Output.object call turns a structural sample of the sitemap into a
 * classification spec: which URL groups exist, and which are templates.
 */
async function generateSiteSpec(paths: string[]): Promise<SiteSpec> {
  const bySegment = new Map<string, { count: number; samples: string[] }>();
  for (const p of paths) {
    const seg = p === "/" ? "/" : `/${p.split("/").find(Boolean)!}`;
    const e = bySegment.get(seg) ?? { count: 0, samples: [] };
    e.count++;
    if (e.samples.length < 4) e.samples.push(p);
    bySegment.set(seg, e);
  }
  const summary = [...bySegment.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 80)
    .map(([seg, e]) => `${seg} — ${e.count} pages, e.g. ${e.samples.join(" ")}`)
    .join("\n");

  const { output } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    output: Output.object({ schema: SPEC_SCHEMA }),
    prompt: `You are mapping a marketing website's sitemap (${BASE_URL}, ${paths.length} URLs) into page groups. Below is a histogram of first path segments with counts and sample paths. Produce classification groups that cover the whole site: hand-built static pages vs stamped-out template groups (listings, articles, location pages, …). Prefer few, meaningful groups.\n\n${summary}`,
  });
  return output;
}

/** Classify all paths against an AI spec → per-page rows + rollups. */
function classifyWithSpec(
  spec: SiteSpec,
  entries: SitemapEntry[],
  brandId: string,
  now: Date,
): { rows: PageRow[]; rollups: PageRow[] } {
  const groupOf = (path: string) =>
    spec.groups.find((g) => g.prefixes.some((pre) => path.startsWith(pre)));
  const byGroup = new Map<string, SitemapEntry[]>();
  for (const e of entries) {
    const key = groupOf(e.path)?.key ?? "unmatched";
    byGroup.set(key, [...(byGroup.get(key) ?? []), e]);
  }
  const rows: PageRow[] = [];
  const rollups: PageRow[] = [];
  for (const [key, group] of byGroup) {
    const g = spec.groups.find((x) => x.key === key);
    const roll =
      ROLLUP_OVER > 0 && ((g?.isTemplate ?? false) || group.length > ROLLUP_OVER);
    if (roll) {
      const metadata: WebPageRollupMeta = {
        rollup: true,
        count: group.length,
        samplePaths: group.slice(0, 8).map((e) => e.path),
        label: g?.label ?? key,
      };
      rollups.push({
        brandId,
        path: rollupPath(key),
        url: BASE_URL,
        title: g?.label ?? humanizeSlug(key),
        pageType: "other",
        lastmodAt: null,
        lastSeenAt: now,
        isActive: true,
        isSeed: false,
        metadata,
      });
    } else {
      for (const e of group)
        rows.push({
          brandId,
          path: e.path,
          url: `${BASE_URL}${e.path === "/" ? "" : e.path}`,
          title: humanizeSlug(e.path.split("/").filter(Boolean).pop() ?? "home"),
          pageType: "other",
          lastmodAt: e.lastmod,
          lastSeenAt: now,
          isActive: true,
          isSeed: false,
          metadata: { aiGroup: key },
        });
    }
  }
  return { rows, rollups };
}

// ---- OG enrichment ---------------------------------------------------

/** Pull og:image / meta description out of a page's HTML head. */
async function fetchOg(
  url: string,
): Promise<{ ogImage: string | null; description: string | null }> {
  const r = await fetch(url, { headers: { "user-agent": "wander-growth-sitemap-sync" } });
  if (!r.ok) throw new Error(`${r.status}`);
  const html = (await r.text()).slice(0, 200_000);
  const meta = (attr: "name" | "property", val: string) =>
    new RegExp(
      `<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${val}["']`,
      "i",
    )
      .exec(html)
      ?.slice(1)
      .find(Boolean) ?? null;
  return {
    ogImage: meta("property", "og:image"),
    description: meta("name", "description") ?? meta("property", "og:description"),
  };
}

// ---- main ------------------------------------------------------------

async function main() {
  const org = await db.query.organizationTable.findFirst({
    where: eq(organizationTable.slug, "wander"),
  });
  if (!org) throw new Error("No 'wander' org — run the seed first.");
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.slug, BRAND_SLUG), eq(brandTable.organizationId, org.id)),
  });
  if (!brand) throw new Error(`No '${BRAND_SLUG}' brand.`);
  console.log(`✓ target: brand=${brand.id} sitemap=${SITEMAP_URL}`);

  const entries = await fetchSitemap();
  console.log(`✓ fetched ${entries.length} sitemap URLs`);
  const now = new Date();

  let rows: PageRow[];
  let rollups: PageRow[];
  if (AI_SPEC) {
    const spec = await generateSiteSpec(entries.map((e) => e.path));
    console.log(
      "✓ AI site spec:",
      spec.groups
        .map((g) => `${g.key}${g.isTemplate ? "*" : ""}(${g.prefixes.join(",")})`)
        .join(" "),
    );
    ({ rows, rollups } = classifyWithSpec(spec, entries, brand.id, now));
  } else {
    const hubs = deriveLocationHubs(entries.map((e) => e.path));
    const allRows = entries.map((e) => {
      const c = classifyWebPage(e.path, hubs);
      return {
        brandId: brand.id,
        path: e.path,
        url: `${BASE_URL}${e.path === "/" ? "" : e.path}`,
        title: c.title,
        pageType: c.pageType,
        locationSlug: c.locationSlug ?? null,
        citySlug: c.citySlug ?? null,
        categorySlug: c.categorySlug ?? null,
        lastmodAt: e.lastmod,
        lastSeenAt: now,
        isActive: true,
        isSeed: false,
      } satisfies PageRow;
    });

    const typeCounts = new Map<WebPageType, number>();
    for (const r of allRows)
      typeCounts.set(r.pageType, (typeCounts.get(r.pageType) ?? 0) + 1);
    console.log(
      "  by type:",
      Object.fromEntries([...typeCounts.entries()].sort((a, b) => b[1] - a[1])),
    );

    // Static vs template: types over the threshold become one rollup row.
    const rolledTypes = new Set(
      ROLLUP_OVER > 0
        ? [...typeCounts.entries()].filter(([, n]) => n > ROLLUP_OVER).map(([t]) => t)
        : [],
    );
    if (rolledTypes.size)
      console.log(
        `… rolling up ${[...rolledTypes].join(", ")} (over ${ROLLUP_OVER} pages/type)`,
      );
    rows = allRows.filter((r) => !rolledTypes.has(r.pageType));
    rollups = [...rolledTypes].map((t) => {
      const group = allRows.filter((r) => r.pageType === t);
      const byLocation: Record<string, number> = {};
      if (LOCATION_TYPES.includes(t))
        for (const r of group)
          if (r.locationSlug)
            byLocation[r.locationSlug] = (byLocation[r.locationSlug] ?? 0) + 1;
      const metadata: WebPageRollupMeta = {
        rollup: true,
        count: group.length,
        samplePaths: group.slice(0, 8).map((r) => r.path),
        ...(Object.keys(byLocation).length ? { byLocation } : {}),
      };
      return {
        brandId: brand.id,
        path: rollupPath(t),
        url: BASE_URL,
        title: PAGE_TYPE_META[t].plural,
        pageType: t,
        lastmodAt: null,
        lastSeenAt: now,
        isActive: true,
        isSeed: false,
        metadata,
      } satisfies PageRow;
    });
  }

  // Prune whatever the previous run's mode left behind: per-page rows that
  // are now rolled up, and rollup rows (path "/…/*") that are now per-page.
  const keptPaths = [...rows.map((r) => r.path), ...rollups.map((r) => r.path)];
  const pruned = await db
    .delete(webPageTable)
    .where(
      and(
        eq(webPageTable.brandId, brand.id),
        notInArray(webPageTable.path, keptPaths),
        rollups.length
          ? inArray(
              webPageTable.pageType,
              [...new Set(rollups.map((r) => r.pageType))],
            )
          : like(webPageTable.path, "%/*"),
      ),
    )
    .returning({ path: webPageTable.path });
  if (pruned.length)
    console.log(`✓ pruned ${pruned.length} rows superseded by the current mode`);

  for (const r of rollups) {
    await db
      .insert(webPageTable)
      .values(r)
      .onConflictDoUpdate({
        target: [webPageTable.brandId, webPageTable.path],
        set: {
          title: sql`excluded.title`,
          metadata: sql`excluded.metadata`,
          lastSeenAt: sql`excluded.last_seen_at`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });
  }

  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(webPageTable)
      .values(rows.slice(i, i + 200))
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
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });
  }
  console.log(
    `✓ upserted ${rows.length} static pages${rollups.length ? ` + ${rollups.length} template rollups` : ""}`,
  );

  const gone = await db
    .update(webPageTable)
    .set({ isActive: false })
    .where(
      and(
        eq(webPageTable.brandId, brand.id),
        eq(webPageTable.isActive, true),
        notInArray(webPageTable.path, keptPaths),
      ),
    )
    .returning({ path: webPageTable.path });
  if (gone.length) console.log(`✓ deactivated ${gone.length} pages no longer in sitemap`);

  if (ENRICH) {
    const enrichable = AI_SPEC
      ? rows
      : rows.filter((r) => ENRICHABLE.includes(r.pageType));
    const targets = enrichable.slice(0, ENRICH_CAP);
    if (enrichable.length > targets.length)
      console.warn(`⚠️  enrichment capped at ${ENRICH_CAP} of ${enrichable.length}`);
    console.log(`… enriching ${targets.length} static pages (og tags)`);
    let done = 0;
    let failed = 0;
    const queue = [...targets];
    await Promise.all(
      Array.from({ length: ENRICH_CONCURRENCY }, async () => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          try {
            // Titles stay classification-owned (deterministic, overridable
            // via MANUAL_OVERRIDES); enrichment only adds covers + copy.
            const og = await fetchOg(t.url);
            await db
              .update(webPageTable)
              .set({ ogImage: og.ogImage, description: og.description })
              .where(
                and(eq(webPageTable.brandId, t.brandId), eq(webPageTable.path, t.path)),
              );
            done++;
          } catch {
            failed++;
          }
        }
      }),
    );
    console.log(`✓ enriched ${done} pages${failed ? ` (${failed} failed)` : ""}`);
  }

  console.log("\n🗺️  Website import complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Website import failed:", err);
  process.exit(1);
});
