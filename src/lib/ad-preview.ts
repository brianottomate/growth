import { z } from "zod";
import type { AdContent } from "@/server/db/ads-schema";
import type { AdMockFrame, AdMockSurface } from "@/components/ad-mock";
import type { SocialMockCrop } from "@/components/social-mock";
import { AD_FORMATS, adFormat } from "./ad-format";
import { metaPreviewMedia } from "./meta-preview";
import { META_PLACEMENTS, type MetaPlacement } from "./meta-placement-plan";
import { META_DEFAULT_CALL_TO_ACTION } from "./zernio-ads";

/**
 * What a client is shown: both feeds and the 9:16. Reels is left out because
 * its mock is a labelled approximation, not something to sign off against.
 */
export const AD_PREVIEW_PLACEMENTS: MetaPlacement[] = [
  "facebook-feed",
  "instagram-feed",
  "instagram-story",
];

export type AdPreviewMedia = {
  url: string;
  type: "image" | "video";
  thumbnail?: string | null;
  headline?: string | null;
  description?: string | null;
};

export type AdPreviewPlacement = {
  id: MetaPlacement;
  label: string;
  publisher: "facebook" | "instagram";
  surface: AdMockSurface;
  kind: "feed" | "story" | "reel";
  frame?: AdMockFrame;
  crop?: SocialMockCrop;
  media: AdPreviewMedia[];
};

/** One ad as the preview page draws it. Public media URLs only. */
export type AdPreviewAd =
  | {
      kind: "creative";
      /** The home or property the ad is about; never the internal ad name. */
      title: string | null;
      format: string;
      headline: string;
      body: string;
      description: string | null;
      linkUrl: string | null;
      callToAction: string;
      placements: AdPreviewPlacement[];
    }
  | {
      kind: "text";
      title: string | null;
      format: string;
      headlines: string[];
      descriptions: string[];
      linkUrl: string | null;
    };

/** A live composition render needs a Growth session; a client cannot load it. */
function isPublicMedia(url: string) {
  return /^https:\/\//i.test(url) && !url.includes("/api/compositions/");
}

/**
 * What the preview page draws for one ad, through the same placement
 * resolution the studio preview and the push use. Null when nothing in the ad
 * can be shown outside Growth (no saved images yet).
 */
export function adPreviewAd(ad: {
  brandId: string;
  content: AdContent;
  homeName?: string | null;
}): AdPreviewAd | null {
  const content = ad.content;
  const format =
    AD_FORMATS.find((item) => item.id === adFormat(content))?.label ?? "Ad";
  if (!("media" in content))
    return {
      kind: "text",
      title: ad.homeName ?? null,
      format: "Search",
      headlines: content.headlines.filter(Boolean),
      descriptions: content.descriptions.filter(Boolean),
      linkUrl: content.linkUrl ?? null,
    };
  const shape = content.ideaStudio?.document.shapes.includes("square")
    ? "square"
    : content.ideaStudio?.document.shapes[0];
  const placements: AdPreviewPlacement[] = [];
  for (const id of AD_PREVIEW_PLACEMENTS) {
    const view = META_PLACEMENTS.find((p) => p.id === id)!;
    const resolved = metaPreviewMedia(content, id, ad.brandId);
    if (resolved.issue || !resolved.media.length) continue;
    const media = resolved.media.map((item) => ({
      url: item.url,
      type: item.type === "video" ? ("video" as const) : ("image" as const),
      thumbnail: "thumbnail" in item ? (item.thumbnail ?? null) : null,
      headline: "headline" in item ? (item.headline ?? null) : null,
      description: "description" in item ? (item.description ?? null) : null,
    }));
    if (!media.every((item) => isPublicMedia(item.url))) continue;
    placements.push({
      id,
      label: view.label,
      publisher: view.publisher,
      surface: view.surface,
      kind: view.kind,
      ...("frame" in view ? { frame: view.frame } : {}),
      crop:
        ("crop" in resolved ? resolved.crop : undefined) ??
        (shape === "square" ||
        shape === "portrait" ||
        shape === "story" ||
        shape === "wide"
          ? shape
          : undefined),
      media,
    });
  }
  if (!placements.length) return null;
  return {
    kind: "creative",
    title: content.propertyName || ad.homeName || null,
    format,
    headline: content.headline,
    body: content.body,
    description: content.description ?? null,
    linkUrl: content.linkUrl ?? null,
    callToAction: content.callToAction ?? META_DEFAULT_CALL_TO_ACTION,
    placements,
  };
}

export const createAdPreviewLinkInput = z
  .object({
    brandId: z.string().min(1),
    campaignId: z.string().min(1).nullable(),
    campaignAdIds: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(100)
      .nullable()
      .default(null),
    catalogExportId: z.string().min(1).nullable(),
    catalogCardIndexes: z
      .array(z.number().int().min(0).max(9999))
      .min(1)
      .max(500)
      .nullable()
      .default(null),
    expiresInDays: z.number().int().min(1).max(90).default(30),
  })
  .refine((input) => input.campaignId || input.catalogExportId, {
    message: "Choose a campaign, a catalog export, or both",
  });

/** A catalog card as an export froze it: the image Meta was sent, and its home. */
export type AdPreviewCatalogCard = {
  key: string;
  image: string;
  /** The export's feed title and description: what Meta shows under the card. */
  headline: string;
  description: string;
};
