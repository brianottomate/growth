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
