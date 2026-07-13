import type { MediaItem } from "@/server/db/content-schema";

// CDN hosts that hard-block cross-origin hotlinking (403 even server-side, with
// any headers/referer). Their URLs can't render in an <img>, so we treat such
// media as absent until we re-host it (e.g. to Blob). Facebook's photo/video CDN
// is the main offender; Instagram + Twitter CDNs serve cross-origin fine.
const BLOCKED_HOSTS = ["fbcdn.net"];

function isBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * The image to show for a post in a feed/card. Videos store an .mp4 in `url`
 * (which can't render in an <img>), so prefer the poster `thumbnail`; fall back
 * to `url` for photos. Returns null for media on a hotlink-blocked host so the
 * card shows a clean placeholder instead of a broken image.
 */
export function displayPoster(
  media: MediaItem[] | null | undefined,
): string | null {
  const m = media?.[0];
  if (!m) return null;
  const url = m.thumbnail ?? m.url;
  if (!url || isBlocked(url)) return null;
  return url;
}
