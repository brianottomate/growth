import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, type Database, type TransactionClient } from "@/server/db";
type Client = Database | TransactionClient;
import {
  brandTable,
  homeTable,
  mediaAssetTable,
  mediaFolderTable,
} from "@/server/db/schema";
import { scrapeSiteImages } from "@/server/clients/firecrawl.client";
import { isFirecrawlConfigured } from "@/server/clients/firecrawl.client";
import { classifyFetchUrl } from "@/server/ai/url-safety";
import { GrowthActionError } from "@/server/ai/kernel/errors";
import { fetchPublicImage } from "./media.service";
import { R2 } from "@/server/clients/r2.client";
import { candidateImageUrls } from "@/lib/media-review";

async function ownedBrand(orgId: string, brandId: string, client: Client = db) {
  const brand = await client.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, website: true },
  });
  if (!brand)
    throw new GrowthActionError(
      "not_found",
      "Brand not found in this workspace",
    );
  return brand;
}
export async function listMediaSuggestions(
  orgId: string,
  brandId: string,
  client: Client = db,
) {
  await ownedBrand(orgId, brandId, client);
  const rows = await client.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.reviewStatus, "suggested"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: {
      id: true,
      title: true,
      thumbnailUrl: true,
      discoveredSourceUrl: true,
      metadata: true,
    },
    limit: 120,
  });
  return rows.map(({ metadata, ...asset }) => ({
    ...asset,
    sourcePage:
      metadata &&
      typeof metadata === "object" &&
      "sourcePage" in metadata &&
      typeof metadata.sourcePage === "string"
        ? metadata.sourcePage
        : null,
  }));
}
export async function discoverMediaSuggestions(orgId: string, brandId: string) {
  const brand = await ownedBrand(orgId, brandId);
  if (!isFirecrawlConfigured)
    throw new Error("Website image discovery is not configured.");
  const website = brand.website
    ? new URL(
        brand.website.startsWith("http")
          ? brand.website
          : `https://${brand.website}`,
      ).toString()
    : null;
  if (!website || !classifyFetchUrl(website).ok)
    throw new Error("Add a public website to this brand first.");
  const homes = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brandId), isNull(homeTable.deletedAt)),
    columns: { url: true },
    orderBy: asc(homeTable.createdAt),
    limit: 20,
  });
  const pages = [
    website,
    ...homes
      .map((h) => h.url)
      .filter((url) => {
        try {
          return (
            new URL(url).hostname === new URL(website).hostname &&
            classifyFetchUrl(url).ok
          );
        } catch {
          return false;
        }
      }),
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);
  let added = 0;
  const failures: string[] = [];
  for (const page of pages) {
    try {
      const images = candidateImageUrls(await scrapeSiteImages(page));
      for (const url of images) {
        if (!classifyFetchUrl(url).ok) continue;
        const existing = await db.query.mediaAssetTable.findFirst({
          where: and(
            eq(mediaAssetTable.brandId, brandId),
            sql`${mediaAssetTable.metadata}->>'sourceUrl' = ${url}`,
          ),
          columns: { id: true },
        });
        if (existing) continue;
        const inserted = await db
          .insert(mediaAssetTable)
          .values({
            brandId,
            provider: "external",
            kind: "image",
            status: "ready",
            reviewStatus: "suggested",
            discoveredSourceUrl: url,
            externalUrl: url,
            thumbnailUrl: url,
            title: "From their website",
            sourceProvider: "website",
            metadata: {
              source: "firecrawl",
              sourceUrl: url,
              sourcePage: page,
              discoveredAt: new Date().toISOString(),
            },
          })
          .onConflictDoNothing({
            target: [
              mediaAssetTable.brandId,
              mediaAssetTable.discoveredSourceUrl,
            ],
          })
          .returning();
        added += inserted.length;
      }
    } catch {
      failures.push(page);
    }
  }
  if (failures.length === pages.length)
    throw new Error("Website image discovery failed. Please try again.");
  return { added, pages: pages.length, failedPages: failures.length };
}
export async function reviewMediaSuggestion(
  orgId: string,
  userId: string,
  input: { brandId: string; mediaId: string; decision: "approve" | "reject" },
  client: Client = db,
) {
  await ownedBrand(orgId, input.brandId, client);
  const asset = await client.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, input.mediaId),
      eq(mediaAssetTable.brandId, input.brandId),
      isNull(mediaAssetTable.deletedAt),
    ),
  });
  if (!asset?.discoveredSourceUrl)
    throw new Error("Website suggestion not found.");
  if (input.decision === "reject") {
    if (asset.reviewStatus === "approved")
      throw new Error("This image is already approved.");
    const rejected = await client
      .update(mediaAssetTable)
      .set({
        reviewStatus: "rejected",
        metadata: {
          ...(asset.metadata as Record<string, unknown>),
          rejectedAt: new Date().toISOString(),
          rejectedBy: userId,
        },
      })
      .where(
        and(
          eq(mediaAssetTable.id, asset.id),
          eq(mediaAssetTable.reviewStatus, "suggested"),
        ),
      )
      .returning();
    if (!rejected.length && asset.reviewStatus !== "rejected")
      throw new Error(
        "Suggestion changed during rejection. Reload and try again.",
      );
    return { id: asset.id, url: null, reviewStatus: "rejected" as const };
  }
  if (asset.reviewStatus === "approved")
    return { id: asset.id, url: asset.url, reviewStatus: "approved" as const };
  if (asset.reviewStatus === "rejected")
    throw new Error("This suggestion has been rejected.");
  const image = await fetchPublicImage(asset.discoveredSourceUrl);
  const filename = `website-photo.${image.contentType.split("/")[1] ?? "jpg"}`;
  const key = R2.buildKey(input.brandId, asset.id, filename);
  const url = await R2.putBuffer(key, image.body, image.contentType);
  await client
    .insert(mediaFolderTable)
    .values({ brandId: input.brandId, name: "Pitch" })
    .onConflictDoNothing({
      target: [mediaFolderTable.brandId, mediaFolderTable.name],
    });
  const folder = await client.query.mediaFolderTable.findFirst({
    where: and(
      eq(mediaFolderTable.brandId, input.brandId),
      eq(mediaFolderTable.name, "Pitch"),
    ),
    columns: { id: true },
  });
  const rows = await client
    .update(mediaAssetTable)
    .set({
      reviewStatus: "approved",
      provider: "r2",
      url,
      thumbnailUrl: url,
      r2Key: key,
      filename,
      mimeType: image.contentType,
      size: image.body.byteLength,
      uploadedBy: userId,
      folderId: folder?.id,
      metadata: {
        ...(asset.metadata as Record<string, unknown>),
        approvedAt: new Date().toISOString(),
        approvedBy: userId,
      },
    })
    .where(
      and(
        eq(mediaAssetTable.id, asset.id),
        eq(mediaAssetTable.reviewStatus, "suggested"),
      ),
    )
    .returning();
  if (!rows[0]) {
    const current = await client.query.mediaAssetTable.findFirst({
      where: eq(mediaAssetTable.id, asset.id),
      columns: { id: true, url: true, reviewStatus: true },
    });
    if (current?.reviewStatus === "approved") return current;
    throw new Error(
      "Suggestion changed during approval. Reload and try again.",
    );
  }
  return rows[0];
}
