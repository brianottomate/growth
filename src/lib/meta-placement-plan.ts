import { z } from "zod";
import type { AdCreativeContent } from "@/server/db/ads-schema";

export const META_PLACEMENTS = [
  {
    id: "facebook-feed",
    label: "Facebook Feed",
    publisher: "facebook",
    position: "feed",
    surface: "facebook",
    kind: "feed",
  },
  {
    id: "instagram-feed",
    label: "Instagram Feed",
    publisher: "instagram",
    position: "stream",
    surface: "instagram",
    kind: "feed",
  },
  {
    id: "facebook-story",
    label: "Facebook Stories",
    publisher: "facebook",
    position: "story",
    surface: "story",
    kind: "story",
  },
  {
    id: "instagram-story",
    label: "Instagram Stories",
    publisher: "instagram",
    position: "story",
    surface: "story",
    kind: "story",
  },
  {
    id: "facebook-reel",
    label: "Facebook Reels",
    publisher: "facebook",
    position: "facebook_reels",
    surface: "story",
    kind: "reel",
  },
  {
    id: "instagram-reel",
    label: "Instagram Reels",
    publisher: "instagram",
    position: "reels",
    surface: "story",
    kind: "reel",
  },
] as const;
export type MetaPlacement = (typeof META_PLACEMENTS)[number]["id"];
export const metaPlacementSchema = z.enum([
  "facebook-feed",
  "instagram-feed",
  "facebook-story",
  "instagram-story",
  "facebook-reel",
  "instagram-reel",
]);
export const metaPlacementPlanSchema = z
  .array(metaPlacementSchema)
  .min(1)
  .max(6)
  .refine((p) => new Set(p).size === p.length, "Choose each placement once");
export function metaProviderPlacements(ids: MetaPlacement[]) {
  const selected = META_PLACEMENTS.filter((p) => ids.includes(p.id));
  return {
    publisherPlatforms: [...new Set(selected.map((p) => p.publisher))],
    ...(selected.some((p) => p.publisher === "facebook")
      ? {
          facebookPositions: selected
            .filter((p) => p.publisher === "facebook")
            .map((p) => p.position),
        }
      : {}),
    ...(selected.some((p) => p.publisher === "instagram")
      ? {
          instagramPositions: selected
            .filter((p) => p.publisher === "instagram")
            .map((p) => p.position),
        }
      : {}),
  };
}
/** Shared review/push contract. Never invent a vertical crop to cover a missing mapping. */
export function metaPlacementMedia(
  content: AdCreativeContent,
  id: MetaPlacement,
) {
  if (content.metaImport?.issues.length)
    return {
      media: [],
      issue:
        "Imported creative needs review: " +
        content.metaImport.issues.join(" "),
    };
  if (!content.media.length) return { media: [], issue: "Add creative." };
  if (id.endsWith("-feed")) return { media: content.media, issue: null };
  // Zernio shares the ordered carousel across the ad set’s placements.
  if (content.media.length > 1) return { media: content.media, issue: null };
  const first = content.media[0]!;
  if (first.type === "video")
    return {
      media: [],
      issue: "Vertical video mapping needs verification before delivery.",
    };
  if (!first.story)
    return { media: [], issue: "Prepare and approve a vertical (9:16) image." };
  return { media: [{ ...first.story, type: "image" as const }], issue: null };
}
