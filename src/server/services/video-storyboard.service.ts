import "server-only";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";

import {
  formatStoryboardTimestamp,
  MAX_STORYBOARD_DURATION_MS,
  storyboardPlan,
} from "@/lib/storyboard-limits";
import { R2 } from "@/server/clients/r2.client";
import type { MediaStoryboard, VideoAnalysisFrame } from "@/server/db/schema";

/** Seeks run side by side; each is its own ffmpeg process. */
const FRAME_CONCURRENCY = 6;

type Ffmpeg = (args: string[]) => Promise<{ code: number; stderr: string }>;

// Seven-segment glyphs drawn as paths: the server has no fonts to render
// text with, and the labels must stay legible to a model.
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

function labelPaths(text: string, x: number, y: number, height: number) {
  const w = height * 0.55;
  const t = Math.max(2, height * 0.13);
  const half = height / 2;
  const rect = (rx: number, ry: number, rw: number, rh: number) =>
    `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"/>`;
  let cursor = x;
  const parts: string[] = [];
  for (const char of text) {
    const segments = SEGMENTS[char];
    if (segments) {
      const s = {
        a: rect(cursor, y, w, t),
        b: rect(cursor + w - t, y, t, half),
        c: rect(cursor + w - t, y + half, t, half),
        d: rect(cursor, y + height - t, w, t),
        e: rect(cursor, y + half, t, half),
        f: rect(cursor, y, t, half),
        g: rect(cursor, y + half - t / 2, w, t),
      };
      for (const key of segments) parts.push(s[key as keyof typeof s]);
      cursor += w + height * 0.25;
    } else if (char === ":") {
      parts.push(rect(cursor, y + height * 0.25, t, t));
      parts.push(rect(cursor, y + height * 0.7, t, t));
      cursor += t + height * 0.25;
    } else if (char === ".") {
      parts.push(rect(cursor, y + height - t, t, t));
      cursor += t + height * 0.25;
    } else if (char === "·") {
      parts.push(rect(cursor, y + half - t / 2, t, t));
      cursor += t + height * 0.25;
    } else {
      cursor += height * 0.35;
    }
  }
  return parts.join("");
}

/**
 * Cut a clip's storyboard on the server: the same plan, layout and labels as
 * the browser renderer, uploaded to the keys derived from the video's own key.
 * `source` is anything ffmpeg reads, a local rendition or the public URL;
 * input seeks mean a remote source is range-read, not downloaded whole.
 */
export async function cutVideoStoryboard(input: {
  ffmpeg: Ffmpeg;
  source: string;
  videoKey: string;
  durationMs: number;
  width: number;
  height: number;
}): Promise<MediaStoryboard> {
  const durationMs = Math.min(
    MAX_STORYBOARD_DURATION_MS,
    Math.max(1_000, input.durationMs),
  );
  const { gridSize, sampleIntervalMs, timestampsMs } =
    storyboardPlan(durationMs);
  const scale = Math.min(1, 480 / Math.max(input.width, input.height));
  // Even sizes keep ffmpeg's scaler and the board arithmetic exact.
  const cellWidth = Math.max(2, Math.round((input.width * scale) / 2) * 2);
  const cellHeight = Math.max(2, Math.round((input.height * scale) / 2) * 2);

  const dir = await mkdtemp(join(tmpdir(), "storyboard-"));
  try {
    const frames: Buffer[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: FRAME_CONCURRENCY }, async () => {
        while (next < timestampsMs.length) {
          const index = next++;
          const path = join(dir, `${index}.jpg`);
          const cut = await input.ffmpeg([
            ...["-nostdin", "-hide_banner", "-loglevel", "error", "-y"],
            ...["-ss", (timestampsMs[index]! / 1_000).toFixed(3)],
            ...["-i", input.source, "-frames:v", "1"],
            ...["-vf", `scale=${cellWidth}:${cellHeight}`, "-q:v", "3", path],
          ]);
          if (cut.code !== 0)
            throw new Error(
              `Storyboard frame ${index + 1} failed: ${cut.stderr.trim().slice(-300)}`,
            );
          frames[index] = await readFile(path);
        }
      }),
    );

    const labelHeight = Math.max(24, Math.round(cellHeight * 0.09));
    const glyph = Math.round(labelHeight * 0.52);
    const perBoard = gridSize * gridSize;
    const storyboard: MediaStoryboard = {
      durationMs,
      sampleIntervalMs,
      gridSize,
      boards: [],
      frames: [],
    };
    for (let first = 0; first < frames.length; first += perBoard) {
      const boardIndex = first / perBoard;
      const last = Math.min(frames.length, first + perBoard);
      const tiles: OverlayOptions[] = [];
      let labels = "";
      for (let index = first; index < last; index++) {
        const local = index - first;
        const row = Math.floor(local / gridSize);
        const column = local % gridSize;
        const x = column * cellWidth;
        const y = row * cellHeight;
        tiles.push({ input: frames[index]!, left: x, top: y });
        labels +=
          `<rect x="${x}" y="${y + cellHeight - labelHeight}" width="${cellWidth}" height="${labelHeight}" fill="rgba(0,0,0,.72)"/>` +
          `<g fill="#fff">${labelPaths(
            `${index + 1} · ${formatStoryboardTimestamp(timestampsMs[index]!)}`,
            x + 8,
            y + cellHeight - labelHeight + (labelHeight - glyph) / 2,
            glyph,
          )}</g>`;
        storyboard.frames.push({
          index: index + 1,
          timestampMs: timestampsMs[index]!,
          boardIndex,
          row,
          column,
        } satisfies VideoAnalysisFrame);
      }
      const width = cellWidth * gridSize;
      const height = cellHeight * gridSize;
      tiles.push({
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels}</svg>`,
        ),
        left: 0,
        top: 0,
      });
      const board = await sharp({
        create: { width, height, channels: 3, background: "#000" },
      })
        .composite(tiles)
        .png()
        .toBuffer();
      const pathname = R2.buildStoryboardKey(input.videoKey, boardIndex);
      await R2.putBuffer(pathname, board, "image/png");
      storyboard.boards.push({
        index: boardIndex,
        url: R2.publicUrl(pathname),
        pathname,
        width,
        height,
        firstFrame: first + 1,
        lastFrame: last,
      });
    }
    return storyboard;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
