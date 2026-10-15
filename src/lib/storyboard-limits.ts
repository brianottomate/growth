/**
 * Shared between the browser renderer that cuts storyboards and the server
 * that stores and reads them. One definition, so the caps cannot drift.
 */

/** Boards per clip. Ten 3×3 boards already cover a five-minute clip. */
export const MAX_STORYBOARD_BOARDS = 10;

/**
 * The renderer clamps here. A clip past this is sampled only to this point,
 * so its reported duration is the clamp, not the truth.
 */
export const MAX_STORYBOARD_DURATION_MS = 300_000;

/**
 * Frames and grid for a clip: one frame a second at most, 3×3 boards up to
 * 90s, 4×4 to 160s, 5×5 beyond, never more than MAX_STORYBOARD_BOARDS boards.
 * Browser and server cut the same storyboard from this.
 */
export function storyboardPlan(durationMs: number) {
  const seconds = Math.max(1, Math.ceil(durationMs / 1_000));
  const gridSize = seconds <= 90 ? 3 : seconds <= 160 ? 4 : 5;
  const capacity = gridSize * gridSize * MAX_STORYBOARD_BOARDS;
  const sampleIntervalMs = Math.max(1_000, Math.ceil(durationMs / capacity));
  // Rounded, not ceiled: a tail shorter than half an interval is a sliver
  // past the last picture more often than a moment worth a frame.
  const frameCount = Math.min(
    capacity,
    Math.max(1, Math.round(durationMs / sampleIntervalMs)),
  );
  // Mid-interval, so a frame stands for its whole slice of the clip.
  const timestampsMs = Array.from({ length: frameCount }, (_, index) =>
    Math.min(
      durationMs - 50,
      Math.round(index * sampleIntervalMs + sampleIntervalMs / 2),
    ),
  );
  return { gridSize, sampleIntervalMs, frameCount, timestampsMs };
}

/** "m:ss" with a tenth when the frame is off the second, as boards label it. */
export function formatStoryboardTimestamp(timestampMs: number) {
  const totalSeconds = timestampMs / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(seconds % 1 ? 1 : 0).padStart(2, "0")}`;
}
