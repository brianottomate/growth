"use client";

import {
  renderVideoStoryboard,
  type LocalStoryboard,
} from "@/lib/video-storyboard";

export { MAX_STORYBOARD_BOARDS } from "@/lib/storyboard-limits";

/**
 * Cut the storyboard for a video file the browser is holding.
 *
 * Only a browser can decode video, and upload is the one moment it reliably
 * has the file, so the boards are made here and stored beside the clip. That
 * is what lets analysis run later from the library, chat, or MCP with no
 * browser in the loop. Best-effort: an undecodable codec or a slow machine
 * yields null, and the upload proceeds without a storyboard rather than
 * failing over one.
 */
export async function captureVideoStoryboard(
  file: File,
  timeoutMs = 45_000,
): Promise<LocalStoryboard | null> {
  const objectUrl = URL.createObjectURL(file);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      renderVideoStoryboard(objectUrl),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    // On a timeout the renderer is still seeking; the media element already
    // holds the decoded source, so revoking here starves nothing it needs, and
    // its own `finally` releases the bitmaps when it gives up.
    URL.revokeObjectURL(objectUrl);
  }
}

/** Boards are PNG so the frame-number labels stay legible to the model. */
export const STORYBOARD_BOARD_MIME = "image/png";

/**
 * PUT each board to its presigned slot. Returns the indices that landed; a
 * board that did not is simply left out of the descriptor, so the server never
 * records a URL with nothing behind it.
 */
export async function uploadStoryboardBoards(
  storyboard: LocalStoryboard,
  uploadUrlForIndex: (index: number) => string | undefined,
): Promise<Set<number>> {
  const landed = new Set<number>();
  await Promise.all(
    storyboard.boards.map(async (board) => {
      const uploadUrl = uploadUrlForIndex(board.index);
      if (!uploadUrl) return;
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": STORYBOARD_BOARD_MIME },
        body: board.blob,
      }).catch(() => null);
      if (put?.ok) landed.add(board.index);
    }),
  );
  return landed;
}

/**
 * The storyboard as the server wants to hear about it: geometry and frame map
 * for the boards that actually landed, and no URLs, which the server derives.
 * Null when nothing landed, so the caller sends nothing at all.
 */
export function storyboardDescriptor(
  storyboard: LocalStoryboard,
  landed: Set<number>,
) {
  const boards = storyboard.boards
    .filter((board) => landed.has(board.index))
    .map(({ index, width, height, firstFrame, lastFrame }) => ({
      index,
      width,
      height,
      firstFrame,
      lastFrame,
    }));
  if (boards.length === 0) return null;
  const kept = new Set(boards.map((board) => board.index));
  return {
    durationMs: storyboard.durationMs,
    sampleIntervalMs: storyboard.sampleIntervalMs,
    gridSize: storyboard.gridSize,
    boards,
    frames: storyboard.frames.filter((frame) => kept.has(frame.boardIndex)),
  };
}
