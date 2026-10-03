import { z } from "zod";
import { classifyFetchUrl } from "@/server/ai/url-safety";

export const webPagePreviewSchema = z.strictObject({
  title: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  siteName: z.string().optional(),
});

export type WebPagePreview = z.infer<typeof webPagePreviewSchema>;

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/\s+/g, " ").trim().slice(0, limit) || undefined;
}

/** Provider metadata is external evidence, including its image URLs. */
export function publicPreviewUrl(
  value: unknown,
  pageUrl?: string,
): string | undefined {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    return undefined;
  try {
    const result = classifyFetchUrl(new URL(value, pageUrl).href);
    return result.ok ? result.url : undefined;
  } catch {
    return undefined;
  }
}

/** Prefer the site's social preview, then its ordinary page metadata. */
export function webPagePreview(
  pageUrl: string,
  metadata: Record<string, unknown>,
): WebPagePreview {
  return {
    title:
      text(metadata.ogTitle, 300) ??
      text(metadata["twitter:title"], 300) ??
      text(metadata.title, 300),
    description:
      text(metadata.ogDescription, 600) ??
      text(metadata["twitter:description"], 600) ??
      text(metadata.description, 600),
    imageUrl:
      publicPreviewUrl(metadata.ogImage, pageUrl) ??
      publicPreviewUrl(metadata["twitter:image"], pageUrl) ??
      publicPreviewUrl(metadata.image, pageUrl),
    siteName: text(metadata.ogSiteName, 120),
  };
}
