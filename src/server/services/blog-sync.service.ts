import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { channelTable, platformPostTable } from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { fetchPageMetadata } from "@/server/services/website-sync.service";

type FeedArticle = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  publishedAt: Date;
  tags: string[];
};

function siteUrl(value: string): URL {
  return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
}

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { "user-agent": "GrowthBlogSync/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  return response.text();
}

async function discoverFeed(website: string) {
  const site = siteUrl(website);
  const candidates = [
    new URL("/blog/feed.xml", site).href,
    new URL("/feed.xml", site).href,
    new URL("/rss.xml", site).href,
    new URL("/blog/rss.xml", site).href,
  ];
  for (const page of [site.href, new URL("/blog", site).href]) {
    const html = await fetchText(page).catch(() => null);
    if (!html) continue;
    for (const match of html.matchAll(
      /<link[^>]+(?:type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["']|href=["']([^"']+)["'][^>]+type=["']application\/(?:rss|atom)\+xml["'])/gi,
    )) {
      const href = match[1] ?? match[2];
      if (href) candidates.unshift(new URL(href, site).href);
    }
  }
  for (const candidate of [...new Set(candidates)]) {
    const xml = await fetchText(candidate).catch(() => null);
    if (xml && /<(rss|feed)[\s>]/i.test(xml)) {
      return { feedUrl: candidate, xml };
    }
  }
  throw new Error(`No RSS or Atom feed found for ${site.hostname}`);
}

function element(block: string, name: string): string | null {
  const match = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
    "i",
  ).exec(block);
  return match?.[1] ? decodeXml(match[1]) : null;
}

function parseFeed(xml: string): FeedArticle[] {
  const articles: FeedArticle[] = [];
  const rssItems = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  for (const match of rssItems) {
    const block = match[1] ?? "";
    const title = element(block, "title");
    const url = element(block, "link");
    const published = element(block, "pubDate") ?? element(block, "dc:date");
    if (!title || !url || !published) continue;
    const publishedAt = new Date(published);
    if (Number.isNaN(publishedAt.getTime())) continue;
    articles.push({
      id: element(block, "guid") ?? url,
      title,
      url,
      description:
        element(block, "description") ?? element(block, "content:encoded"),
      publishedAt,
      tags: [
        ...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi),
      ]
        .map((category) => decodeXml(category[1] ?? ""))
        .filter(Boolean),
    });
  }
  if (articles.length > 0) return articles;

  for (const match of xml.matchAll(
    /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi,
  )) {
    const block = match[1] ?? "";
    const title = element(block, "title");
    const href = /<link[^>]+href=["']([^"']+)["']/i.exec(block)?.[1];
    const published = element(block, "published") ?? element(block, "updated");
    if (!title || !href || !published) continue;
    const publishedAt = new Date(published);
    if (Number.isNaN(publishedAt.getTime())) continue;
    articles.push({
      id: element(block, "id") ?? href,
      title,
      url: decodeXml(href),
      description: element(block, "summary") ?? element(block, "content"),
      publishedAt,
      tags: [...block.matchAll(/<category[^>]+term=["']([^"']+)["']/gi)]
        .map((category) => decodeXml(category[1] ?? ""))
        .filter(Boolean),
    });
  }
  return articles;
}

export async function syncBrandBlog(input: {
  brandId: string;
  brandName: string;
  website: string;
}) {
  const { feedUrl, xml } = await discoverFeed(input.website);
  const articles = parseFeed(xml);
  if (articles.length === 0) {
    throw new Error(`The feed at ${feedUrl} contains no readable articles`);
  }

  let channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, input.brandId),
      eq(channelTable.kind, "blog"),
    ),
  });
  if (!channel) {
    [channel] = await db
      .insert(channelTable)
      .values({
        id: createId("chan"),
        brandId: input.brandId,
        kind: "blog",
        platform: "blog",
        displayName: `${input.brandName} Blog`,
        profileUrl: new URL("/blog", siteUrl(input.website)).href,
        defaultProvider: "native",
        connectionStatus: "connected",
        metadata: { sourceType: "rss", sourceUrl: feedUrl },
      })
      .returning();
  } else {
    await db
      .update(channelTable)
      .set({
        metadata: {
          ...(channel.metadata ?? {}),
          sourceType: "rss",
          sourceUrl: feedUrl,
        },
      })
      .where(eq(channelTable.id, channel.id));
  }

  const existing = await db.query.platformPostTable.findMany({
    where: and(
      eq(platformPostTable.brandId, input.brandId),
      eq(platformPostTable.externalKind, "blog_article"),
    ),
  });
  const byExternalId = new Map(
    existing.map((post) => [post.externalId ?? post.externalUrl, post]),
  );
  let inserted = 0;
  let updated = 0;

  for (let index = 0; index < articles.length; index += 5) {
    await Promise.all(
      articles.slice(index, index + 5).map(async (article) => {
        const page = await fetchPageMetadata(article.url).catch(() => null);
        const media = page?.ogImage
          ? [{ url: page.ogImage, type: "image" as const }]
          : undefined;
        const values = {
          channelId: channel?.id ?? null,
          platform: "blog" as const,
          username: siteUrl(input.website).hostname,
          source: "owned" as const,
          status: "published" as const,
          origin: "human" as const,
          provider: "native" as const,
          ingestProvider: "rss",
          text: article.title,
          media,
          externalId: article.id,
          externalUrl: article.url,
          externalKind: "blog_article",
          cleanupStatus: "keep" as const,
          isSeed: false,
          metadata: {
            description: page?.description ?? article.description,
            metaDescription: page?.description ?? article.description,
            ogImage: page?.ogImage,
            slug: new URL(article.url).pathname.replace(/^\/blog\/?/, ""),
            tags: article.tags,
            sourceFeedUrl: feedUrl,
          },
          publishedAt: article.publishedAt,
        };
        const prior =
          byExternalId.get(article.id) ?? byExternalId.get(article.url);
        if (prior) {
          const priorMetadata =
            prior.metadata && typeof prior.metadata === "object"
              ? (prior.metadata as Record<string, unknown>)
              : {};
          values.metadata = {
            ...values.metadata,
            ...(priorMetadata.aiAnalysis
              ? { aiAnalysis: priorMetadata.aiAnalysis }
              : {}),
          };
          await db
            .update(platformPostTable)
            .set(values)
            .where(eq(platformPostTable.id, prior.id));
          updated++;
        } else {
          await db.insert(platformPostTable).values({
            id: createId("pp"),
            brandId: input.brandId,
            createdAt: article.publishedAt,
            ...values,
          });
          inserted++;
        }
      }),
    );
  }

  return { feedUrl, articles: articles.length, inserted, updated };
}
