import type { AdCreativeContent } from "@/server/db/ads-schema";
import { ideaPreviewUrl } from "./ad-idea-studio";
import {
  isFeedPlacement,
  showsSquare,
  metaPlacementMedia,
  type MetaPlacement,
} from "./meta-placement-plan";

/** Previews resolve exactly the same assets and blockers as publishing. */
export function metaPreviewPlacements(
  _content: AdCreativeContent,
  planned: MetaPlacement[],
) {
  // Facebook's profile feed and Explore home draw the same frame as the feed
  // beside them; Marketplace, the right column, notifications and Explore
  // have their own frame, and Instagram's profile feed shows the square.
  return planned.filter((id) => PREVIEWED.has(id));
}
const PREVIEWED = new Set<MetaPlacement>([
  "facebook-feed",
  "instagram-feed",
  "facebook-story",
  "instagram-story",
  "facebook-reel",
  "instagram-reel",
  "facebook-marketplace",
  "facebook-right-column",
  "facebook-notification",
  "instagram-explore",
  "instagram-profile-feed",
]);
/**
 * What a placement shows. An approved ad draws its saved images once the push
 * has frozen them, and a draft or approved design live until then; the push
 * itself reads `metaPlacementMedia`, which never accepts a live render.
 */
export function metaPreviewMedia(
  content: AdCreativeContent,
  id: MetaPlacement,
  brandId: string,
) {
  const resolved = metaPlacementMedia(content, id);
  const vertical = !isFeedPlacement(id);
  // After the push a carousel whose every card has a 9:16 image shows those
  // cards in Stories and Reels (the placement swap that follows the push), so
  // the preview shows them too rather than the feed cards letterboxed.
  if (
    vertical &&
    !resolved.issue &&
    content.media.length > 1 &&
    content.media.every((card) => card.type === "image" && card.story?.url)
  )
    return {
      media: content.media.map((card) => ({
        ...card.story!,
        type: "image" as const,
      })),
      issue: null,
    };
  const doc = content.ideaStudio?.document;
  // Placements that show a card square (Facebook's feeds, Instagram's
  // profile feed and Explore) get the square cards, the same swap the push
  // makes; once frozen, the saved square renders.
  const squareOnFacebook = showsSquare(id) && (doc?.cards.length ?? 0) > 0;
  const squares = content.ideaStudio?.approval?.renders.square;
  if (
    squareOnFacebook &&
    !resolved.issue &&
    !("pending" in resolved) &&
    squares?.length === doc!.cards.length
  )
    return {
      media: squares.map((render) => ({
        type: "image" as const,
        url: render.url,
      })),
      issue: null,
      crop: "square" as const,
    };
  const draft =
    !content.ideaStudio?.approval && !content.metaImport?.issues.length;
  if (!doc || !("pending" in resolved || draft)) return resolved;
  const base = doc.shapes.includes("portrait") ? "portrait" : doc.shapes[0]!;
  // As delivered: Stories and Reels get the 9:16 cards when the idea has
  // them; a carousel without them keeps its feed cards, a static needs one.
  const single = doc.cards.length === 1;
  if (vertical && single && !doc.shapes.includes("story"))
    return { media: [], issue: "Prepare and approve a vertical (9:16) image." };
  const shape =
    vertical && doc.shapes.includes("story")
      ? "story"
      : squareOnFacebook && doc.shapes.includes("square")
        ? "square"
        : base;
  return {
    media: doc.cards.flatMap((card) => {
      const url = ideaPreviewUrl(brandId, card, shape);
      return url ? [{ type: "image" as const, url }] : [];
    }),
    issue: null,
    ...(shape === "square" ? { crop: "square" as const } : {}),
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
