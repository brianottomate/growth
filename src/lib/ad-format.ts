import type { AdContent } from "@/server/db/schema";

export const AD_FORMATS = [
  { id: "static", label: "Static" },
  { id: "carousel", label: "Carousel" },
  { id: "video", label: "Video" },
  { id: "text", label: "Text" },
  { id: "catalog", label: "Catalog" },
] as const;
export type AdFormat = (typeof AD_FORMATS)[number]["id"];

export function adFormat(content: AdContent): AdFormat {
  if (!("media" in content)) return "text";
  if (content.format === "catalog") return "catalog";
  if (
    content.format === "video" ||
    content.media.some((item) => item.type === "video")
  )
    return "video";
  if (content.format === "portfolio" || content.format === "carousel")
    return "carousel";
  return content.format ?? (content.media.length > 1 ? "carousel" : "static");
}
