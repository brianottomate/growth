import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import type { AdCard, MediaItem } from "@/server/db/schema";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import {
  readVideoRenditions,
  type VideoRenditions,
} from "@/lib/video-renditions";

// Reads the renditions `video-rendition.service` cuts. Kept apart from it so
// publishing and ad code never import the ffmpeg package.

async function renditionsByItem(items: MediaItem[]) {
  const videos = items.filter((item) => item.type === "video");
  if (!videos.length)
    return new Map<
      MediaItem,
      { id: string; renditions: VideoRenditions | null }
    >();
  const ids = videos
    .flatMap((item) => [item.assetId, item.derivedFrom])
    .filter((id): id is string => Boolean(id));
  const assets = await db
    .select({
      id: mediaAssetTable.id,
      url: mediaAssetTable.url,
      metadata: mediaAssetTable.metadata,
    })
    .from(mediaAssetTable)
    .where(
      and(
        eq(mediaAssetTable.kind, "video"),
        isNull(mediaAssetTable.deletedAt),
        or(
          ...(ids.length ? [inArray(mediaAssetTable.id, ids)] : []),
          inArray(
            mediaAssetTable.url,
            videos.map((item) => item.url),
          ),
        ),
      ),
    );
  const found = new Map<
    MediaItem,
    { id: string; renditions: VideoRenditions | null }
  >();
  for (const item of videos) {
    const asset = assets.find(
      (row) =>
        row.id === item.assetId ||
        row.id === item.derivedFrom ||
        row.url === item.url,
    );
    if (asset)
      found.set(item, {
        id: asset.id,
        renditions: readVideoRenditions(asset.metadata),
      });
  }
  return found;
}

export type DeliveryShape = "vertical" | "feed";

/**
 * Swap each library video for the rendition the platform should get. Items
 * that are not library videos, or whose renditions never ran, pass through.
 * Refuses a video whose renditions are still being cut, so a Reel never goes
 * out as the 4K master by accident.
 */
export async function deliveryMediaFor<T extends MediaItem>(
  items: T[],
  shape: DeliveryShape = "vertical",
): Promise<T[]> {
  const found = await renditionsByItem(items);
  return items.map((item) => {
    const asset = found.get(item);
    if (!asset) return item;
    const { renditions } = asset;
    if (renditions?.status === "processing") {
      throw new Error(
        "This video is still being prepared for publishing. Try again in a minute.",
      );
    }
    if (renditions?.status !== "ready" || !renditions.delivery) return item;
    const file =
      shape === "feed" && renditions.feed
        ? renditions.feed
        : renditions.delivery;
    const poster =
      file === renditions.feed
        ? renditions.feedPoster
        : renditions.deliveryPoster;
    return {
      ...item,
      url: file.url,
      width: file.width,
      height: file.height,
      thumbnail: poster?.url ?? item.thumbnail,
      assetId: undefined,
      derivedFrom: asset.id,
    };
  });
}

/**
 * A video ad card cut from one library video: the 4:5 crop for feeds, with
 * the 9:16 file as its story for Stories and Reels. Null when the video has
 * no ready renditions, so the caller keeps the item as it is.
 */
export async function videoAdCardFor(item: MediaItem): Promise<AdCard | null> {
  if (item.type !== "video") return null;
  const asset = (await renditionsByItem([item])).get(item);
  const renditions = asset?.renditions;
  if (!asset || renditions?.status !== "ready" || !renditions.delivery)
    return null;
  const file = (
    rendition: NonNullable<VideoRenditions["delivery"]>,
    poster: VideoRenditions["deliveryPoster"],
  ): MediaItem => ({
    url: rendition.url,
    type: "video",
    width: rendition.width,
    height: rendition.height,
    ...(poster ? { thumbnail: poster.url } : {}),
    derivedFrom: asset.id,
  });
  const delivery = file(renditions.delivery, renditions.deliveryPoster);
  if (!renditions.vertical) return delivery;
  return {
    ...(renditions.feed
      ? file(renditions.feed, renditions.feedPoster)
      : delivery),
    story: { ...delivery, via: "crop" },
  };
}
