/**
 * True when a chat-attachment URL is one WE host (public R2 bucket) AND lives
 * under the calling operator's own chat-upload prefix. Chat images are written
 * by `MediaService.createChatR2Upload` to
 * `R2.buildUploadKey("chat", userId, …)`, i.e.
 * `…/uploads/chat/{userId}/…` under `R2_PUBLIC_BASE_URL`.
 *
 * Reads `process.env` directly (not `@/env`) so this stays a dependency-free
 * pure helper that unit tests can exercise. Fails closed when the public base
 * URL is not configured.
 */
export function isOwnedChatImageUrl(url: string, userId: string): boolean {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return false;
  // Mirror the key sanitation in r2BuildUploadKey so the ownership check
  // matches the key we actually wrote.
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "-") || "misc";
  try {
    const baseUrl = new URL(base);
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === baseUrl.hostname &&
      parsed.pathname.includes(`/uploads/chat/${safeUserId}/`)
    );
  } catch {
    return false;
  }
}
