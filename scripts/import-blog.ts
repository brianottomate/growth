/**
 * Import wander.com blog articles (DatoCMS Content Delivery API) into the growth
 * DB as the strategic-layer mirror — same pattern as the Customer.io import.
 * Read-only against Dato; idempotent (wipes prior blog rows for the brand).
 *
 *   DATOCMS_API_TOKEN=... bun run scripts/import-blog.ts
 *
 * Maps: blog article → platform_post (platform=blog, externalKind=blog_article).
 * Stores OG image as media, title as text, description+slug+tags in metadata.
 * Scope: most recent N (CAP) published.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  organizationTable,
  platformPostTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

const TOKEN = process.env.DATOCMS_API_TOKEN;
if (!TOKEN) {
  console.error("Set DATOCMS_API_TOKEN (read-only CDA token).");
  process.exit(1);
}
const CAP = 300;
// Articles live at /article/{slug}; /blog/{n} is the paginated listing route.
const BLOG_BASE = "https://www.wander.com/article";

type SeoTag = { tag: string; attributes: Record<string, string> | null; content: string | null };
type Article = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  _publishedAt: string;
  tags: { name: string }[];
  image: { responsiveImage: { src: string } | null; url: string } | null;
  _seoMetaTags: SeoTag[];
};

const Q = `query($first: IntType, $skip: IntType) {
  allBlogArticles(first: $first, skip: $skip, orderBy: _publishedAt_DESC) {
    id title url description _publishedAt
    tags { name }
    image { responsiveImage(imgixParams: { w: 800, h: 420, fit: crop }) { src } url }
    _seoMetaTags { tag attributes content }
  }
}`;

/** Pull a value out of the rendered SEO meta tags by attribute match. */
function seoValue(tags: SeoTag[], attr: "name" | "property", val: string): string | null {
  return tags.find((t) => t.attributes?.[attr] === val)?.attributes?.content ?? null;
}

async function dato(skip: number): Promise<Article[]> {
  const r = await fetch("https://graphql.datocms.com/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "X-Exclude-Invalid": "true",
    },
    body: JSON.stringify({ query: Q, variables: { first: 100, skip } }),
  });
  if (!r.ok) throw new Error(`Dato ${r.status}`);
  const j = (await r.json()) as {
    data?: { allBlogArticles?: Article[] };
    errors?: unknown;
  };
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data?.allBlogArticles ?? [];
}

async function main() {
  const org = await db.query.organizationTable.findFirst({
    where: eq(organizationTable.slug, "wander"),
  });
  if (!org) throw new Error("No 'wander' org — run the seed first.");
  const wander = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.slug, "wander"), eq(brandTable.organizationId, org.id)),
  });
  if (!wander) throw new Error("No 'wander' brand.");
  const blogChannel = await db.query.channelTable.findFirst({
    where: and(eq(channelTable.brandId, wander.id), eq(channelTable.kind, "blog")),
  });
  console.log(`✓ target: brand=${wander.id} blogChannel=${blogChannel?.id ?? "—"}`);

  const articles: Article[] = [];
  for (let skip = 0; skip < CAP; skip += 100) {
    const batch = await dato(skip);
    articles.push(...batch);
    if (batch.length < 100) break;
  }
  console.log(`✓ fetched ${articles.length} blog articles`);

  await db
    .delete(platformPostTable)
    .where(
      and(
        eq(platformPostTable.brandId, wander.id),
        eq(platformPostTable.externalKind, "blog_article"),
      ),
    );

  const rows: (typeof platformPostTable.$inferInsert)[] = articles.map((a) => {
    const img = a.image?.responsiveImage?.src ?? a.image?.url ?? null;
    const at = new Date(a._publishedAt);
    return {
      id: createId("pp"),
      brandId: wander.id,
      channelId: blogChannel?.id ?? null,
      platform: "blog",
      username: "wander.com/blog",
      source: "owned",
      status: "published",
      origin: "human",
      provider: "native",
      text: a.title,
      media: img ? [{ url: img, type: "image" }] : undefined,
      externalId: a.id,
      externalKind: "blog_article",
      externalUrl: `${BLOG_BASE}/${a.url}`,
      cleanupStatus: "keep",
      isSeed: false, // real imported content, not demo data

      metadata: {
        description: a.description,
        metaDescription: seoValue(a._seoMetaTags, "name", "description"),
        ogTitle: seoValue(a._seoMetaTags, "property", "og:title"),
        ogImage: seoValue(a._seoMetaTags, "property", "og:image"),
        slug: a.url,
        tags: a.tags.map((t) => t.name),
      },
      publishedAt: at,
      createdAt: at,
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(platformPostTable).values(rows.slice(i, i + 200));
  }
  console.log(`✓ inserted ${rows.length} blog platform_posts`);
  console.log("\n📝 Blog import complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Blog import failed:", err);
  process.exit(1);
});
