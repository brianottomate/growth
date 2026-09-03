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
