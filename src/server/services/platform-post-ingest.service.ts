import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import {
  contentIngestRunTable,
  platformPostTable,
  type MediaItem,
  type PlatformPostInsert,
} from "@/server/db/schema";
import { reconcileAmplificationTargetsForPosts } from "@/server/services/amplification.service";

type Json = Record<string, unknown>;

const keyOf = (row: Pick<PlatformPostInsert, "platform" | "externalId">) =>
  row.externalId ? `${row.platform}:${row.externalId}` : null;

// Instagram mirrors do not agree on their numeric post ID: Zernio may expose
// the delivery ID while Instagram/Apify returns the media ID. The canonical
// permalink is stable across both, so it is a safe secondary identity.
const urlKey = (platform: string, url: string | null | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${platform}:${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return `${platform}:${url.replace(/\/+$/, "")}`;
  }
};

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

/** Keep a durable poster for social hosts whose URLs expire or reject embeds. */
async function stabilizeMedia(
  media: MediaItem[] | null | undefined,
  brandId: string,
  externalId: string,
): Promise<{ media: MediaItem[] | null | undefined; rehosted: number }> {
  if (!media?.length) return { media, rehosted: 0 };
  let rehosted = 0;
  const stable = await Promise.all(
    media.map(async (item, index) => {
      const poster = item.thumbnail ?? item.url;
      if (!poster || !R2.needsRehost(poster)) return item;
      try {
        const url = await R2.putFromUrl(
          R2.buildPosterKey(brandId, `${externalId}-${index}`),
          poster,
        );
        rehosted++;
        return { ...item, thumbnail: url };
      } catch {
        return item;
      }
    }),
  );
  return { media: stable, rehosted };
}

/**
 * Canonical sink shared by owned connectors and public scrapers.
 * Identity is brand + platform + externalId, with the canonical permalink as
 * a secondary identity for providers that expose different platform IDs.
 */
export async function ingestPlatformPosts(input: {
  brandId: string;
  ingestProvider: string;
  rows: PlatformPostInsert[];
}): Promise<{
  candidates: number;
  inserted: number;
  updated: number;
  rehosted: number;
  insertedIds: string[];
}> {
  const canonical = new Map<string, PlatformPostInsert>();
  for (const row of input.rows) {
    const key = keyOf(row);
    if (key)
      canonical.set(key, { ...row, ingestProvider: input.ingestProvider });
  }
  const rows = [...canonical.values()];
  // URL comparison needs slash/canonicalization normalization, which Postgres
  // cannot apply to an `IN` list here. Read the small per-brand/platform set
  // and resolve identity below so Zernio and public scrapers merge reliably.
  const platforms = [...new Set(rows.map((row) => row.platform))];
  const existing = platforms.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          eq(platformPostTable.brandId, input.brandId),
          inArray(platformPostTable.platform, platforms),
        ),
      })
    : [];
  const existingByKey = new Map<string, (typeof existing)[number]>(
    existing.map((row) => [`${row.platform}:${row.externalId}`, row] as const),
  );
  const existingByUrl = new Map<string, (typeof existing)[number]>();
  for (const row of [...existing].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    const key = urlKey(row.platform, row.externalUrl);
    if (key && !existingByUrl.has(key)) existingByUrl.set(key, row);
  }

  let inserted = 0;
  let updated = 0;
  let rehosted = 0;
  const fresh: PlatformPostInsert[] = [];
  const insertedIds: string[] = [];
  const touchedIds: string[] = [];

  for (const row of rows) {
    const key = keyOf(row)!;
    const prior =
      (urlKey(row.platform, row.externalUrl)
        ? existingByUrl.get(urlKey(row.platform, row.externalUrl)!)
        : undefined) ?? existingByKey.get(key);
    const media = await stabilizeMedia(
      row.media,
      input.brandId,
      row.externalId!,
    );
    rehosted += media.rehosted;
    row.media = media.media;

    if (!prior) {
      fresh.push(row);
      inserted++;
      continue;
    }

    const priorMeta = object(prior.metadata);
    const nextMeta = object(row.metadata);
    const providers = new Set<string>(
      Array.isArray(priorMeta.ingestProviders)
        ? priorMeta.ingestProviders.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    );
    if (prior.ingestProvider) providers.add(prior.ingestProvider);
    providers.add(input.ingestProvider);

    await db
      .update(platformPostTable)
      .set({
        channelId: row.channelId ?? prior.channelId,
        contentPostId: prior.contentPostId ?? row.contentPostId,
        username: row.username ?? prior.username,
        format: row.format ?? prior.format,
        archetype: row.archetype ?? prior.archetype,
        template: row.template ?? prior.template,
        source:
          prior.source === "owned" || row.source === "owned"
            ? "owned"
            : "scraped",
        status: row.status ?? prior.status,
        provider: row.provider ?? prior.provider,
        ingestProvider: input.ingestProvider,
        text: row.text ?? prior.text,
        media: row.media?.length ? row.media : prior.media,
        stats: { ...object(prior.stats), ...object(row.stats) },
        externalUrl: row.externalUrl ?? prior.externalUrl,
        externalKind: row.externalKind ?? prior.externalKind,
        amplifiedFrom: row.amplifiedFrom ?? prior.amplifiedFrom,
        publishedAt: row.publishedAt ?? prior.publishedAt,
        scrapedAt: row.scrapedAt ?? new Date(),
        metadata: {
          ...priorMeta,
          ...nextMeta,
          ingestProviders: [...providers],
        },
      })
      .where(eq(platformPostTable.id, prior.id));
    touchedIds.push(prior.id);
    updated++;
  }

  for (let index = 0; index < fresh.length; index += 200) {
    const created = await db
      .insert(platformPostTable)
      .values(fresh.slice(index, index + 200))
      .returning({ id: platformPostTable.id });
    insertedIds.push(...created.map((row) => row.id));
    touchedIds.push(...created.map((row) => row.id));
  }

  // Reconciliation must not make a successful content ingest fail. The target
  // can be picked up on a later refresh if the best-effort pass is interrupted.
  await reconcileAmplificationTargetsForPosts(touchedIds).catch((error) =>
    console.error("Amplification target reconciliation failed", error),
  );

  return {
    candidates: rows.length,
    inserted,
    updated,
    rehosted,
    insertedIds,
  };
}

export async function startContentIngestRun(input: {
  brandId: string;
  requestedById?: string;
  mode: "owned_backfill" | "peer_scrape";
  provider: string;
  requestedFrom?: Date;
  requestedTo?: Date;
}) {
  const [run] = await db
    .insert(contentIngestRunTable)
    .values(input)
    .returning({ id: contentIngestRunTable.id });
  if (!run) throw new Error("Could not create content ingest run");
  return run.id;
}

export async function finishContentIngestRun(
  id: string,
  result: Record<string, unknown>,
  provider?: string,
) {
  await db
    .update(contentIngestRunTable)
    .set({
      status: "completed",
      result,
      ...(provider && { provider }),
      completedAt: new Date(),
    })
    .where(eq(contentIngestRunTable.id, id));
}

export async function failContentIngestRun(id: string, error: unknown) {
  await db
    .update(contentIngestRunTable)
    .set({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
    })
    .where(eq(contentIngestRunTable.id, id));
}
