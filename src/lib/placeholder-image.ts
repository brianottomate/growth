import type { MediaItem } from "@/server/db/content-schema";

/**
 * A stand-in image for a creative that hasn't been made yet. The URL is the
 * brief: `title` and `description` are drawn, `prompt` rides along undrawn so
 * whoever makes the real asset (a person or a model) reads it off the URL.
 * Rendered on demand by `/api/placeholder`; nothing is stored.
 */
export const PLACEHOLDER_FORMATS = {
  square: { width: 1080, height: 1080, label: "1:1" },
  portrait: { width: 1080, height: 1350, label: "4:5" },
  story: { width: 1080, height: 1920, label: "9:16" },
  landscape: { width: 1200, height: 628, label: "1.91:1" },
} as const;

export type PlaceholderFormat = keyof typeof PLACEHOLDER_FORMATS;

export type PlaceholderSpec = {
  title: string;
  description?: string;
  prompt?: string;
  format?: PlaceholderFormat;
};

export const PLACEHOLDER_PATH = "/api/placeholder";
const PRODUCTION_ORIGIN = "https://growth-red.vercel.app";

export function readPlaceholderParams(params: URLSearchParams) {
  const format = params.get("format");
  return {
    title: (params.get("title")?.trim() || "Creative needed").slice(0, 120),
    description: (params.get("description") ?? "").trim().slice(0, 280),
    prompt: (params.get("prompt") ?? "").trim().slice(0, 4000),
    format: (format && Object.hasOwn(PLACEHOLDER_FORMATS, format)
      ? format
      : "square") as PlaceholderFormat,
  };
}

/** Absolute so server-side readers (push, copy calls) can fetch it too. */
export function placeholderImage(
  spec: PlaceholderSpec,
  origin = PRODUCTION_ORIGIN,
): MediaItem {
  const format = spec.format ?? "square";
  const params = new URLSearchParams({ title: spec.title, format });
  if (spec.description) params.set("description", spec.description);
  if (spec.prompt) params.set("prompt", spec.prompt);
  const { width, height } = PLACEHOLDER_FORMATS[format];
  return {
    url: `${origin}${PLACEHOLDER_PATH}?${params.toString()}`,
    type: "image",
    width,
    height,
  };
}

export function isPlaceholderUrl(url: string) {
  try {
    return new URL(url, PRODUCTION_ORIGIN).pathname === PLACEHOLDER_PATH;
  } catch {
    return false;
  }
}
