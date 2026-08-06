/**
 * Browser-side thumbnail generation.
 *
 * Content media routinely lands as multi-megabyte 2000px+ PNGs, and the pool
 * renders them into ~100px tiles. Downscaling in the browser before upload
 * costs nothing server-side and means the grid never streams the original.
 * The decode is shared with dimension reading so each file is decoded once.
 */

/** Longest edge of a generated tile, in CSS pixels. */
export const THUMBNAIL_MAX_EDGE = 640;
const THUMBNAIL_QUALITY = 0.82;
export const THUMBNAIL_MIME = "image/webp";

export type ThumbnailResult = {
  sourceWidth: number;
  sourceHeight: number;
  /** Null when the source is already small, animated, or undecodable. */
  thumbnail: Blob | null;
};

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, THUMBNAIL_MIME, THUMBNAIL_QUALITY),
  );
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode image"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Grab a poster frame from a video file, same contract as the image path.
 *
 * Video used to upload with no tile at all, so the library and the pickers
 * showed rows of anonymous film icons. The browser already has to decode the
 * file to play it, so one seek and one canvas draw gets a real poster for free.
 *
 * Seeks a little way in rather than to frame zero: the first frame of a phone
 * clip is very often black. Never throws, and resolves null for a codec the
 * browser cannot decode (HEVC 10-bit, most notably), which is exactly when
 * there is nothing useful to show anyway.
 */
export async function createVideoThumbnail(
  file: File,
): Promise<ThumbnailResult> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    return await new Promise<ThumbnailResult>((resolve) => {
      const empty = { sourceWidth: 0, sourceHeight: 0, thumbnail: null };
      // A decode that never fires an event must not hang the upload.
      const timer = setTimeout(() => resolve(empty), 10_000);
      const done = (result: ThumbnailResult) => {
        clearTimeout(timer);
        resolve(result);
      };

      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.onerror = () => done(empty);
      video.onloadedmetadata = () => {
        const { videoWidth, videoHeight, duration } = video;
        if (!videoWidth || !videoHeight) return done(empty);
        video.currentTime = Number.isFinite(duration)
          ? Math.min(1, duration / 2)
          : 0;
      };
      video.onseeked = () => {
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const longestEdge = Math.max(sourceWidth, sourceHeight);
        const scale = Math.min(1, THUMBNAIL_MAX_EDGE / longestEdge);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d");
        if (!context)
          return done({ sourceWidth, sourceHeight, thumbnail: null });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        void toBlob(canvas).then((thumbnail) =>
          done({ sourceWidth, sourceHeight, thumbnail }),
        );
      };
      video.src = objectUrl;
    });
  } catch {
    return { sourceWidth: 0, sourceHeight: 0, thumbnail: null };
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
  }
}

/**
 * Decode `file` once, returning its true dimensions plus a downscaled WebP tile
 * when one is worth making. Never throws — a failed decode degrades to
 * "no dimensions, no thumbnail" so an upload is never blocked by it.
 */
export async function createImageThumbnail(
  file: File,
): Promise<ThumbnailResult> {
  let source: ImageBitmap | HTMLImageElement | null = null;
  try {
    source = await decode(file);
    const sourceWidth =
      source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight =
      source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!sourceWidth || !sourceHeight) {
      return { sourceWidth: 0, sourceHeight: 0, thumbnail: null };
    }

    const longestEdge = Math.max(sourceWidth, sourceHeight);
    // Animated GIFs would lose their animation, and anything already tile-sized
    // gains nothing from a second copy.
    if (file.type === "image/gif" || longestEdge <= THUMBNAIL_MAX_EDGE) {
      return { sourceWidth, sourceHeight, thumbnail: null };
    }

    const scale = THUMBNAIL_MAX_EDGE / longestEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return { sourceWidth, sourceHeight, thumbnail: null };
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const thumbnail = await toBlob(canvas);
    // A tile bigger than its original is a pathological encode — drop it.
    return {
      sourceWidth,
      sourceHeight,
      thumbnail: thumbnail && thumbnail.size < file.size ? thumbnail : null,
    };
  } catch {
    return { sourceWidth: 0, sourceHeight: 0, thumbnail: null };
  } finally {
    if (source && "close" in source) source.close();
  }
}
