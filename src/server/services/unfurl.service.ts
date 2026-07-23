import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { platformPostTable } from "@/server/db/schema";

// Simulate how a link will unfurl on social platforms. Two paths:
//   - PREDICTED: the URL belongs to one of our own platform_posts (e.g. an
//     unpublished wander.com article that currently 307s to /blog). We
//     synthesize the card from the draft itself — title, description, hero —
//     because that IS what the platform will see once it goes live.
//   - LIVE: any other URL. Fetch the page and read its og:/twitter: meta,
//     the same tags X and LinkedIn read when they build their cards.

export type LinkCard = {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  /** True when synthesized from our own draft instead of a live fetch. */
  predicted: boolean;
};

const URL_RE = /https?:\/\/[^\s<>()"']+/;

export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = URL_RE.exec(text);
  return match ? match[0].replace(/[.,;:!?]+$/, "") : null;
}

// Meta tags are read with regexes rather than a full HTML parse: unfurls only
// need <head> tag soup, and platforms' own crawlers are similarly tolerant.
function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return null;
}

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");

/** First markdown h1, mirroring how blog-publish derives the article title. */
function h1Of(markdown: string): string | null {
  const first = markdown.trim().split("\n")[0];
  return first?.startsWith("# ") ? first.slice(2).trim() : null;
}

function firstParagraph(markdown: string): string | null {
  return (
    markdown
      .split("\n\n")
      .map((paragraph) => paragraph.trim())
      .find((paragraph) => paragraph && !paragraph.startsWith("#")) ?? null
  );
}

async function predictedCard(url: string): Promise<LinkCard | null> {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.externalUrl, url),
    with: { contentPost: { columns: { title: true, hook: true, media: true } } },
  });
  if (!spot || spot.status === "published") return null;
  const title =
    (spot.text ? h1Of(spot.text) : null) ?? spot.contentPost?.title ?? null;
  const media = spot.media?.[0] ?? spot.contentPost?.media?.[0];
  return {
    url,
    domain: new URL(url).hostname.replace(/^www\./, ""),
    title,
    description:
      spot.contentPost?.hook ?? (spot.text ? firstParagraph(spot.text) : null),
    image: media?.thumbnail ?? media?.url ?? null,
    predicted: true,
  };
}

// Small TTL cache so timelines don't refetch the same link every render.
const cache = new Map<string, { card: LinkCard | null; at: number }>();
const TTL_MS = 10 * 60 * 1000;

async function liveCard(url: string): Promise<LinkCard | null> {
  const parsed = new URL(url);
  // Internal preview tool, but still: never unfurl into the local network.
  if (
    parsed.hostname === "localhost" ||
    /^(\d+\.){3}\d+$/.test(parsed.hostname)
  ) {
    return null;
  }
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(6000),
    headers: { "User-Agent": "wander-growth-unfurl/1.0 (link preview)" },
  });
  if (!res.ok) return null;
  const html = (await res.text()).slice(0, 200_000);
  const title =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || null);
  if (!title) return null;
  return {
    url,
    domain: parsed.hostname.replace(/^www\./, ""),
    title,
    description:
      metaContent(html, "og:description") ??
      metaContent(html, "twitter:description") ??
      metaContent(html, "description"),
    image:
      metaContent(html, "og:image") ?? metaContent(html, "twitter:image"),
    predicted: false,
  };
}

export async function resolveLinkCard(url: string): Promise<LinkCard | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.card;
  let card: LinkCard | null = null;
  try {
    card = (await predictedCard(url)) ?? (await liveCard(url));
  } catch {
    card = null;
  }
  cache.set(url, { card, at: Date.now() });
  return card;
}
