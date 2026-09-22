import type { AdCreativeContent } from "@/server/db/ads-schema";
import { metaPlacementMedia, type MetaPlacement } from "./meta-placement-plan";

/** Previews resolve exactly the same assets and blockers as publishing. */
export function metaPreviewPlacements(
  _content: AdCreativeContent,
  planned: MetaPlacement[],
) {
  return planned;
}
export const metaPreviewMedia = metaPlacementMedia;
export function importedPlacementLabel(adSets: Record<string, unknown>[]) {
  if (!adSets.length) return "Imported placements · review source settings";
  const automatic = adSets.map((set) => {
    const targeting = set.targeting as Record<string, unknown> | undefined;
    return (
      targeting &&
      ![
        "publisher_platforms",
        "facebook_positions",
        "instagram_positions",
        "messenger_positions",
        "audience_network_positions",
      ].some((key) => Array.isArray(targeting[key]) && targeting[key].length)
    );
  });
  return automatic.every(Boolean)
    ? "Automatic placements · imported from Meta"
    : "Imported placement rules · see source settings";
}
