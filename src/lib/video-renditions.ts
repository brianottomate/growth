/**
 * What the server cuts from an uploaded library video, and how to read it.
 *
 * The uploaded file stays the master. Publishing and ad pushes use these
 * renditions, because platforms reject what editors export (4K, HEVC 10-bit,
 * 25+ Mbps, moov atom at the end). See docs/media-renditions.md.
 */

export type VideoRenditionFile = {
  url: string;
  key: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
};

export type VideoRenditions = {
  version: 1;
  status: "processing" | "ready" | "error";
  startedAt: string;
  finishedAt?: string;
  error?: string;
  source?: {
    width: number;
    height: number;
    durationMs: number;
    videoCodec?: string;
    hasAudio: boolean;
  };
  /** Source aspect, H.264, at most 1080 wide (portrait) or 1920 wide. */
  delivery?: VideoRenditionFile;
  deliveryPoster?: VideoRenditionFile;
  /** 4:5 center crop, for feed placements, cut only from sources taller than 4:5. */
  feed?: VideoRenditionFile;
  feedPoster?: VideoRenditionFile;
  /** True when `delivery` is 9:16 and can serve Reels, Stories and TikTok. */
  vertical?: boolean;
};

export type VideoProbe = {
  width: number;
  height: number;
  durationMs: number;
  videoCodec?: string;
  hasAudio: boolean;
};

export type RenditionPlan = {
  delivery: { width: number; height: number };
  feed: {
    cropWidth: number;
    cropHeight: number;
    width: number;
    height: number;
  } | null;
  vertical: boolean;
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Read `ffmpeg -i` stderr. Width and height are the displayed ones (rotation applied). */
export function parseFfmpegProbe(stderr: string): VideoProbe | null {
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const videoLine = stderr
    .split("\n")
    .find((line) => /Stream #\d+:\d+.*: Video:/.test(line));
  const size = videoLine
    ? /,\s*(\d{2,5})x(\d{2,5})[\s,[]/.exec(videoLine)
    : null;
  if (!duration || !size) return null;
  const durationMs = Math.round(
    (Number(duration[1]) * 3600 +
      Number(duration[2]) * 60 +
      Number(duration[3])) *
      1000,
  );
  let width = Number(size[1]);
  let height = Number(size[2]);
  const rotation = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(stderr);
  if (rotation && Math.abs(Math.round(Number(rotation[1]))) % 180 === 90) {
    [width, height] = [height, width];
  }
  return {
    width,
    height,
    durationMs,
    videoCodec: videoLine
      ? /Video:\s*([a-z0-9_]+)/i.exec(videoLine)?.[1]
      : undefined,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(stderr),
  };
}

const NINE_SIXTEEN = 9 / 16;
const FOUR_FIVE = 4 / 5;

export function renditionPlan(
  source: Pick<VideoProbe, "width" | "height">,
): RenditionPlan {
  const aspect = source.width / source.height;
  const portrait = aspect < 1;
  const box = portrait
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
  const scale = Math.min(
    1,
    box.width / source.width,
    box.height / source.height,
  );
  const delivery = {
    width: even(source.width * scale),
    height: even(source.height * scale),
  };

  const feed =
    aspect < FOUR_FIVE - 0.01
      ? (() => {
          const cropWidth = even(source.width);
          const cropHeight = even(source.width / FOUR_FIVE);
          const width = even(Math.min(1080, cropWidth));
          return {
            cropWidth,
            cropHeight,
            width,
            height: even(width / FOUR_FIVE),
          };
        })()
      : null;

  return { delivery, feed, vertical: Math.abs(aspect - NINE_SIXTEEN) < 0.02 };
}

const H264 = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "20",
  "-maxrate",
  "12M",
  "-bufsize",
  "24M",
  "-profile:v",
  "high",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  "-write_tmcd",
  "0",
];

/** One decode of the source, split into the delivery file and (when cut) the 4:5 crop. */
export function renditionArgs(input: {
  source: string;
  plan: RenditionPlan;
  deliveryPath: string;
  feedPath: string;
  threads: number;
}): string[] {
  const { plan } = input;
  const scale = `scale=${plan.delivery.width}:${plan.delivery.height}:flags=lanczos,setsar=1`;
  const filter = plan.feed
    ? `[0:v]split=2[d0][f0];[d0]${scale}[d];[f0]crop=${plan.feed.cropWidth}:${plan.feed.cropHeight},scale=${plan.feed.width}:${plan.feed.height}:flags=lanczos,setsar=1[f]`
    : `[0:v]${scale}[d]`;
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-threads",
    String(input.threads),
    "-i",
    input.source,
    "-filter_complex",
    filter,
    "-map",
    "[d]",
    "-map",
    "0:a:0?",
    ...H264,
    "-threads",
    String(input.threads),
    input.deliveryPath,
    ...(plan.feed
      ? [
          "-map",
          "[f]",
          "-map",
          "0:a:0?",
          ...H264,
          "-threads",
          String(input.threads),
          input.feedPath,
        ]
      : []),
  ];
}

/** A still from a rendition, one second in (or halfway through a shorter clip). */
export function posterArgs(input: {
  video: string;
  poster: string;
  durationMs: number;
}): string[] {
  const at = Math.min(1, input.durationMs / 2000);
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    at.toFixed(2),
    "-i",
    input.video,
    "-frames:v",
    "1",
    "-update",
    "1",
    "-q:v",
    "3",
    input.poster,
  ];
}

export function readVideoRenditions(metadata: unknown): VideoRenditions | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { renditions?: unknown }).renditions;
  if (!value || typeof value !== "object") return null;
  return (value as VideoRenditions).version === 1
    ? (value as VideoRenditions)
    : null;
}
