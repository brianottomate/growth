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
  wide: { width: 1920, height: 1080, label: "16:9" },
} as const;

export type PlaceholderFormat = keyof typeof PLACEHOLDER_FORMATS;

export type PlaceholderSpec = {
  title: string;
  description?: string;
  prompt?: string;
  format?: PlaceholderFormat;
};

export const PLACEHOLDER_PATH = "/api/placeholder";

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

export function placeholderImage(spec: PlaceholderSpec): MediaItem {
  const format = spec.format ?? "square";
  const params = new URLSearchParams({ title: spec.title, format });
  if (spec.description) params.set("description", spec.description);
  if (spec.prompt) params.set("prompt", spec.prompt);
  const { width, height } = PLACEHOLDER_FORMATS[format];
  return { url: `${PLACEHOLDER_PATH}?${params}`, type: "image", width, height };
}

export const isPlaceholderUrl = (url: string) =>
  url.startsWith(`${PLACEHOLDER_PATH}?`);

const FORMAT_FOR_SHAPE: Record<string, PlaceholderFormat> = {
  square: "square",
  portrait: "portrait",
  story: "story",
  wide: "wide",
};

/** The same placeholder brief, cut to another ad shape. */
export function placeholderForShape(url: string, shape: string) {
  const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  params.set("format", FORMAT_FOR_SHAPE[shape] ?? "square");
  return `${PLACEHOLDER_PATH}?${params}`;
}
