import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import ffmpegStatic from "ffmpeg-static";

import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import { R2 } from "@/server/clients/r2.client";
import {
  parseFfmpegProbe,
  posterArgs,
  readVideoRenditions,
  renditionArgs,
  renditionPlan,
  type VideoRenditionFile,
  type VideoRenditions,
} from "@/lib/video-renditions";

/** Longer clips would not finish inside one 800s function on 2 vCPU. */
const MAX_SOURCE_DURATION_MS = 180_000;
/** A `processing` claim older than this is a function that died mid-run. */
const STALE_CLAIM_MS = 15 * 60_000;

function ffmpegPath() {
  const path = process.env.FFMPEG_BIN ?? ffmpegStatic;
  if (!path) throw new Error("No ffmpeg binary for this platform");
  return path;
}

function run(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-20_000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

async function probe(source: string) {
  // `ffmpeg -i` with no output exits 1 after printing the stream info.
  const { stderr } = await run(["-hide_banner", "-nostdin", "-i", source]);
  const probed = parseFfmpegProbe(stderr);
  if (!probed) throw new Error("ffmpeg could not read this video");
  return probed;
}

async function writeRenditions(mediaId: string, renditions: VideoRenditions) {
  await db
    .update(mediaAssetTable)
    .set({
      metadata: sql`coalesce(${mediaAssetTable.metadata}, '{}'::jsonb) || ${JSON.stringify({ renditions })}::jsonb`,
    })
    .where(eq(mediaAssetTable.id, mediaId));
}

/**
 * Claim the asset for one run. The conditional update is the lock: a second
 * caller sees the fresh `processing` claim and backs off.
 */
async function claim(mediaId: string, force: boolean) {
  const startedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const claimed = await db
    .update(mediaAssetTable)
    .set({
      metadata: sql`coalesce(${mediaAssetTable.metadata}, '{}'::jsonb) || ${JSON.stringify(
        {
          renditions: { version: 1, status: "processing", startedAt },
        },
      )}::jsonb`,
    })
    .where(
      and(
        eq(mediaAssetTable.id, mediaId),
        eq(mediaAssetTable.kind, "video"),
        eq(mediaAssetTable.provider, "r2"),
        eq(mediaAssetTable.status, "ready"),
        isNull(mediaAssetTable.deletedAt),
        force
          ? sql`(coalesce(${mediaAssetTable.metadata}->'renditions'->>'status', '') <> 'processing'
              or ${mediaAssetTable.metadata}->'renditions'->>'startedAt' < ${staleBefore})`
          : sql`(${mediaAssetTable.metadata}->'renditions' is null
              or ${mediaAssetTable.metadata}->'renditions'->>'status' = 'error'
              or (${mediaAssetTable.metadata}->'renditions'->>'status' = 'processing'
                and ${mediaAssetTable.metadata}->'renditions'->>'startedAt' < ${staleBefore}))`,
      ),
    )
    .returning();
  return claimed[0] ?? null;
}

/**
 * Cut the delivery file, a 4:5 feed crop when the source is taller than 4:5,
 * and a poster for each, from one decode of the uploaded master. Idempotent:
 * ready renditions are left alone unless `force`.
 */
export async function renderVideoRenditions(
  mediaId: string,
  options: { force?: boolean; threads?: number } = {},
): Promise<VideoRenditions | null> {
  const asset = await claim(mediaId, options.force ?? false);
  if (!asset?.url || !asset.r2Key) return null;
  const startedAt =
    readVideoRenditions(asset.metadata)?.startedAt ?? new Date().toISOString();
  const dir = await mkdtemp(join(tmpdir(), "renditions-"));
  try {
    const source = await probe(asset.url);
    if (source.durationMs > MAX_SOURCE_DURATION_MS) {
      throw new Error(
        `This video runs ${Math.round(source.durationMs / 1000)}s; renditions are cut for clips up to ${MAX_SOURCE_DURATION_MS / 1000}s`,
      );
    }
    const plan = renditionPlan(source);
    const deliveryPath = join(dir, "delivery.mp4");
    const feedPath = join(dir, "feed.mp4");
    const encoded = await run(
      renditionArgs({
        source: asset.url,
        plan,
        deliveryPath,
        feedPath,
        threads: options.threads ?? availableParallelism(),
      }),
    );
    if (encoded.code !== 0) {
      throw new Error(
        `ffmpeg failed: ${encoded.stderr.trim().split("\n").slice(-3).join(" ")}`,
      );
    }

    const upload = async (
      path: string,
      name: string,
      mimeType: string,
      size: { width: number; height: number },
    ): Promise<VideoRenditionFile> => {
      const key = R2.buildRenditionKey(asset.r2Key!, name);
      const stored = await R2.putFile(key, path, mimeType);
      return { url: stored.url, key, size: stored.size, mimeType, ...size };
    };
    const poster = async (
      video: string,
      name: string,
      size: { width: number; height: number },
    ) => {
      const path = join(dir, `${name}.jpg`);
      const cut = await run(
        posterArgs({ video, poster: path, durationMs: source.durationMs }),
      );
      if (cut.code !== 0)
        throw new Error(`Poster failed: ${cut.stderr.trim().slice(-300)}`);
      return upload(path, `${name}.jpg`, "image/jpeg", size);
    };

    const renditions: VideoRenditions = {
      version: 1,
      status: "ready",
      startedAt,
      finishedAt: new Date().toISOString(),
      source,
      vertical: plan.vertical,
      delivery: await upload(
        deliveryPath,
        "delivery.mp4",
        "video/mp4",
        plan.delivery,
      ),
      deliveryPoster: await poster(deliveryPath, "delivery", plan.delivery),
      ...(plan.feed
        ? {
            feed: await upload(feedPath, "feed.mp4", "video/mp4", {
              width: plan.feed.width,
              height: plan.feed.height,
            }),
            feedPoster: await poster(feedPath, "feed", {
              width: plan.feed.width,
              height: plan.feed.height,
            }),
          }
        : {}),
    };

    await db
      .update(mediaAssetTable)
      .set({
        width: source.width,
        height: source.height,
        duration: Math.round(source.durationMs / 1000),
        ...(asset.thumbnailUrl
          ? {}
          : { thumbnailUrl: renditions.deliveryPoster!.url }),
      })
      .where(eq(mediaAssetTable.id, mediaId));
    await writeRenditions(mediaId, renditions);
    return renditions;
  } catch (error) {
    const failed: VideoRenditions = {
      version: 1,
      status: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      error: (error instanceof Error ? error.message : String(error)).slice(
        0,
        500,
      ),
    };
    await writeRenditions(mediaId, failed);
    return failed;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Library videos from the last month that never got renditions, oldest claim first. */
export async function pendingVideoRenditions(limit: number) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const rows = await db
    .select({ id: mediaAssetTable.id })
    .from(mediaAssetTable)
    .where(
      and(
        eq(mediaAssetTable.kind, "video"),
        eq(mediaAssetTable.provider, "r2"),
        eq(mediaAssetTable.status, "ready"),
        isNull(mediaAssetTable.deletedAt),
        gt(mediaAssetTable.createdAt, since),
        sql`(${mediaAssetTable.metadata}->'renditions' is null
          or (${mediaAssetTable.metadata}->'renditions'->>'status' = 'processing'
            and ${mediaAssetTable.metadata}->'renditions'->>'startedAt' < ${staleBefore}))`,
      ),
    )
    .orderBy(desc(mediaAssetTable.createdAt))
    .limit(limit);
  return rows.map((row) => row.id);
}
