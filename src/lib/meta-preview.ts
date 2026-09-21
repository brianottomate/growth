import type { AdCreativeContent } from "@/server/db/ads-schema";
import type { MetaPlacement } from "./meta-placement-plan";

/** Viewing recovered artwork never grants approval or changes the delivery plan. */
export function metaPreviewPlacements(
  content: AdCreativeContent,
  planned: MetaPlacement[],
) {
  return planned.length
    ? planned
    : content.metaImport
      ? (content.ideaStudio?.document.intendedPlacements ?? [])
      : [];
}
export function metaPreviewMedia(
  content: AdCreativeContent,
  placement: MetaPlacement,
) {
  const studio = content.ideaStudio;
  const vertical = !placement.endsWith("-feed");
  const shape = vertical
    ? "story"
    : studio?.document.shapes.includes("portrait")
      ? "portrait"
      : (studio?.document.shapes[0] ?? "portrait");
  // Frozen exports win. Before approval, imported supplied artwork uses its recovered
  // original URL, never an on-demand render or a feed-to-story crop.
  const media = studio?.approval
    ? (studio.approval.renders[shape]?.map((r) => ({
        url: r.url,
        type: "image" as const,
      })) ?? [])
    : content.metaImport && studio
      ? studio.document.cards.flatMap((card) => {
          const source =
            card.sourceOverrides?.[shape] ??
            (!vertical || studio.document.shapes[0] === "story"
              ? card.source
              : undefined);
          return source?.url
            ? [{ url: source.url, type: "image" as const }]
            : [];
        })
      : vertical
        ? content.media.flatMap((card) =>
            card.story ? [{ ...card.story, type: "image" as const }] : [],
          )
        : content.media;
  const expected = studio?.document.cards.length ?? content.media.length;
  return {
    media: media.length === expected ? media : [],
    issue:
      !expected || media.length !== expected
        ? `Missing ${vertical ? "vertical (9:16)" : "feed"} creative. Review the ad to prepare this placement.`
        : null,
  };
}
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
