"use client";

export type StoryboardProgress = {
  stage: "loading" | "sampling" | "composing" | "transcribing";
  progress: number;
  message: string;
};

export type LocalStoryboardBoard = {
  index: number;
  blob: Blob;
  width: number;
  height: number;
  firstFrame: number;
  lastFrame: number;
};

export type LocalStoryboardFrame = {
  index: number;
  timestampMs: number;
  boardIndex: number;
  row: number;
  column: number;
};

export type LocalStoryboard = {
  durationMs: number;
  sampleIntervalMs: number;
  gridSize: number;
  boards: LocalStoryboardBoard[];
  frames: LocalStoryboardFrame[];
};

export type LocalTranscript = {
  language?: string;
  text: string;
  words: Array<{ text: string; startMs: number; endMs: number }>;
};

type CapturedFrame = {
  bitmap: ImageBitmap;
  timestampMs: number;
};

import {
  MAX_STORYBOARD_BOARDS as MAX_BOARDS,
  MAX_STORYBOARD_DURATION_MS as MAX_DURATION_MS,
} from "@/lib/storyboard-limits";

function waitForVideoMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Video loading timed out.")),
      20_000,
    );
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(
        new Error(
          "The video could not be decoded in this browser. Refresh its source and try again.",
        ),
      );
    };
  });
}

function seekVideo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }, 4_000);
    const onSeeked = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    video.addEventListener("seeked", onSeeked);
    try {
      video.currentTime = seconds;
    } catch (error) {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas export failed.")),
      type,
      quality,
    );
  });
}

function storyboardPlan(durationMs: number) {
  const seconds = Math.max(1, Math.ceil(durationMs / 1_000));
  const gridSize = seconds <= 90 ? 3 : seconds <= 160 ? 4 : 5;
  const capacity = gridSize * gridSize * MAX_BOARDS;
  const sampleIntervalMs = Math.max(1_000, Math.ceil(durationMs / capacity));
  const frameCount = Math.min(
    capacity,
    Math.max(1, Math.ceil(durationMs / sampleIntervalMs)),
  );
  return { gridSize, sampleIntervalMs, frameCount };
}

function formatTimestamp(timestampMs: number) {
  const totalSeconds = timestampMs / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(seconds % 1 ? 1 : 0).padStart(2, "0")}`;
}

export async function renderVideoStoryboard(
  sourceUrl: string,
  onProgress?: (progress: StoryboardProgress) => void,
): Promise<LocalStoryboard> {
  onProgress?.({
    stage: "loading",
    progress: 0.02,
    message: "Loading durable video…",
  });
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;
  await waitForVideoMetadata(video);

  const durationMs = Math.min(
    MAX_DURATION_MS,
    Math.max(1_000, Math.floor(video.duration * 1_000)),
  );
  const { gridSize, sampleIntervalMs, frameCount } = storyboardPlan(durationMs);
  const sourceWidth = video.videoWidth || 720;
  const sourceHeight = video.videoHeight || 1_280;
  const scale = Math.min(1, 480 / Math.max(sourceWidth, sourceHeight));
  const cellWidth = Math.max(1, Math.round(sourceWidth * scale));
  const cellHeight = Math.max(1, Math.round(sourceHeight * scale));
  const capture = document.createElement("canvas");
  capture.width = cellWidth;
  capture.height = cellHeight;
  const captureContext = capture.getContext("2d");
  if (!captureContext)
    throw new Error("Canvas is unavailable in this browser.");

  const captured: CapturedFrame[] = [];
  try {
    for (let index = 0; index < frameCount; index++) {
      const timestampMs = Math.min(
        durationMs - 50,
        Math.round(index * sampleIntervalMs + sampleIntervalMs / 2),
      );
      await seekVideo(video, Math.max(0, timestampMs / 1_000));
      captureContext.drawImage(video, 0, 0, cellWidth, cellHeight);
      const blob = await canvasBlob(capture, "image/jpeg", 0.84);
      captured.push({
        bitmap: await createImageBitmap(blob),
        timestampMs,
      });
      onProgress?.({
        stage: "sampling",
        progress: 0.06 + ((index + 1) / frameCount) * 0.74,
        message: `Sampling frame ${index + 1} of ${frameCount}…`,
      });
    }

    const cellsPerBoard = gridSize * gridSize;
    const totalBoards = Math.ceil(captured.length / cellsPerBoard);
    const boards: LocalStoryboardBoard[] = [];
    const frames: LocalStoryboardFrame[] = [];
    for (let boardIndex = 0; boardIndex < totalBoards; boardIndex++) {
      const boardCanvas = document.createElement("canvas");
      boardCanvas.width = cellWidth * gridSize;
      boardCanvas.height = cellHeight * gridSize;
      const context = boardCanvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable in this browser.");
      context.fillStyle = "#000";
      context.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

      const first = boardIndex * cellsPerBoard;
      const last = Math.min(captured.length, first + cellsPerBoard);
      for (let localIndex = 0; localIndex < last - first; localIndex++) {
        const globalIndex = first + localIndex;
        const frame = captured[globalIndex]!;
        const row = Math.floor(localIndex / gridSize);
        const column = localIndex % gridSize;
        const x = column * cellWidth;
        const y = row * cellHeight;
        context.drawImage(frame.bitmap, x, y, cellWidth, cellHeight);

        const labelHeight = Math.max(24, Math.round(cellHeight * 0.09));
        context.fillStyle = "rgba(0,0,0,.72)";
        context.fillRect(
          x,
          y + cellHeight - labelHeight,
          cellWidth,
          labelHeight,
        );
        context.fillStyle = "white";
        context.font = `600 ${Math.max(14, Math.round(labelHeight * 0.52))}px ui-monospace, monospace`;
        context.textBaseline = "middle";
        context.fillText(
          `${globalIndex + 1} · ${formatTimestamp(frame.timestampMs)}`,
          x + 8,
          y + cellHeight - labelHeight / 2,
        );
        frames.push({
          index: globalIndex + 1,
          timestampMs: frame.timestampMs,
          boardIndex,
          row,
          column,
        });
      }

      boards.push({
        index: boardIndex,
        blob: await canvasBlob(boardCanvas, "image/png"),
        width: boardCanvas.width,
        height: boardCanvas.height,
        firstFrame: first + 1,
        lastFrame: last,
      });
      onProgress?.({
        stage: "composing",
        progress: 0.82 + ((boardIndex + 1) / totalBoards) * 0.16,
        message: `Composing board ${boardIndex + 1} of ${totalBoards}…`,
      });
    }

    return {
      durationMs,
      sampleIntervalMs,
      gridSize,
      boards,
      frames,
    };
  } finally {
    for (const frame of captured) frame.bitmap.close();
    video.removeAttribute("src");
    video.load();
  }
}
