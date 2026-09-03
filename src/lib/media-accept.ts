/**
 * What the media library will store, in one place.
 *
 * These lists were copied into four files — the dropzone's `accept` map, the
 * library page, the upload hook and the server's `kindForMime` — and drifted:
 * the picker's zone advertised `image/*`, so an iPhone HEIC passed the drop
 * and was rejected a moment later by the hook that actually uploads it. Every
 * surface now reads the same table, and a new format is one line.
 */
export const MEDIA_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export const MEDIA_GIF_MIME_TYPES = ["image/gif"] as const;

export const MEDIA_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

/** Grouped the way `kindForMime` needs it: GIF is its own media kind. */
export const MEDIA_MIME = {
  image: MEDIA_IMAGE_MIME_TYPES,
  gif: MEDIA_GIF_MIME_TYPES,
  video: MEDIA_VIDEO_MIME_TYPES,
} as const;

/** Everything an <img> can render — the image kinds plus GIF. */
export const MEDIA_STILL_MIME_TYPES = [
  ...MEDIA_IMAGE_MIME_TYPES,
  ...MEDIA_GIF_MIME_TYPES,
] as const;

const EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
};

function acceptMapFor(mimeTypes: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(
    mimeTypes.map((mimeType) => [mimeType, EXTENSIONS[mimeType] ?? []]),
  );
}

/**
 * `accept` maps for react-dropzone. Spelled out per MIME type rather than
 * `image/*`: a wildcard lets HEIC, TIFF and SVG through the zone and into an
 * uploader that refuses them.
 */
export const STILL_MEDIA_ACCEPT = acceptMapFor(MEDIA_STILL_MIME_TYPES);
export const MEDIA_ACCEPT = acceptMapFor([
  ...MEDIA_STILL_MIME_TYPES,
  ...MEDIA_VIDEO_MIME_TYPES,
]);

export function isStillMediaType(mimeType: string): boolean {
  return (MEDIA_STILL_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isVideoMediaType(mimeType: string): boolean {
  return (MEDIA_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Human-facing list for the "that file will not do" message. */
export const MEDIA_TYPES_HINT = "JPEG, PNG, WebP, AVIF, GIF, MP4, WebM or MOV";

/**
 * Caps. The image one is ours; the video one is the ceiling
 * `media.createUploadUrl` enforces, restated client-side so an oversized clip
 * is refused before the browser spends a minute cutting a poster and a
 * storyboard for it and then hits a zod error.
 */
export const MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 250 * 1024 * 1024;

export function maxUploadBytesFor(mimeType: string): number | null {
  if (isStillMediaType(mimeType)) return MAX_IMAGE_UPLOAD_BYTES;
  if (isVideoMediaType(mimeType)) return MAX_VIDEO_UPLOAD_BYTES;
  return null;
}

export function formatUploadLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/**
 * Uploads in flight at once. A folder pick is routinely a hundred files, and
 * a hundred simultaneous decodes, presigns and PUTs exhausts the browser's
 * connection pool — the uploads all stall together and read as a hang.
 */
export const UPLOAD_CONCURRENCY = 3;
