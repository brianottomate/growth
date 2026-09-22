import { ideaSource, type IdeaImage, type IdeaShape } from "./ad-idea-studio";
import { getCompositionFormat } from "./compositions";

/** Asset must already be resolved as ready, brand-owned R2 media by the server. */
export function reusableApprovalAsset(
  card: IdeaImage,
  shape: IdeaShape,
  asset?: {
    id: string;
    url: string;
    width: number | null;
    height: number | null;
    mimeType: string | null;
  },
) {
  const format = getCompositionFormat(shape);
  if (
    card.mode !== "supplied" ||
    !asset ||
    ideaSource(card, shape)?.assetId !== asset.id ||
    asset.width !== format.width ||
    asset.height !== format.height ||
    !["image/jpeg", "image/png"].includes(asset.mimeType ?? "")
  )
    return null;

  // Freeze the canonical library URL, never a client-provided source URL.
  return { assetId: asset.id, url: asset.url, reused: true as const };
}
