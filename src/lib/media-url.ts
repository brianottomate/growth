import type { MediaItem } from "@/server/db/schema";

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi)(?:[?#]|$)/i;

/**
 * What a media URL most likely is when nothing better (a library row, a
 * Content-Type) has said. Extensions lie occasionally; a stored asset's kind
 * always wins over this.
 */
export function mediaTypeForUrl(url: string): MediaItem["type"] {
  return VIDEO_EXTENSIONS.test(url) ? "video" : "image";
}

/**
 * A still that an `<img>` can actually render, or nothing.
 *
 * The rule the pickers learned the hard way: a video's poster or nothing at
 * all. Falling back to the item's own `url` for a clip points an `<img>` at an
 * .mp4, which paints the broken-image glyph and pulls the whole file down to
 * do it. A `thumbnail` equal to `url` is the same trap wearing a different
 * field name, so it is refused too.
 */
export function posterForMedia(
  item:
    | {
        url?: string | null;
        thumbnail?: string | null;
        /** Loose on purpose: several call sites carry their own row type
         * with `type?: string`, and the only thing this rule asks is
         * whether the item is a video. */
        type?: string | null;
      }
    | null
    | undefined,
): string | undefined {
  if (!item) return undefined;
  const poster =
    item.thumbnail && item.thumbnail !== item.url ? item.thumbnail : null;
  if (poster) return poster;
  if (item.type === "video") return undefined;
  return item.url ?? undefined;
}
