import { ideaPreviewUrl } from "@/lib/ad-idea-studio";
import "server-only";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  adTable,
  audienceTable,
  brandTable,
  campaignTable,
  contentPostTable,
  platformCampaignTable,
  platformAdTable,
  seriesTable,
  mediaAssetTable,
  platformDocumentTable,
  productionPacketTable,
} from "@/server/db/schema";
import type { MediaItem } from "@/server/db/schema";

function media(items: MediaItem[]) {
  const seen = new Set<string>();
  return items
    .filter((item) => item.url && !seen.has(item.url) && !!seen.add(item.url))
    .slice(0, 3)
    .map((item) => ({
      url: item.url,
      type: item.type,
      thumbnail: item.thumbnail ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
    }));
}
export async function initiativePreviews(
  orgId: string,
  postIds: string[],
  seriesIds: string[],
  campaignIds: string[],
) {
  const [posts, series, campaigns, ads, audiences, platforms, executions] =
    await Promise.all([
      postIds.length
        ? db.query.contentPostTable.findMany({
            where: and(
              inArray(contentPostTable.id, postIds),
              isNull(contentPostTable.deletedAt),
            ),
            with: {
              brand: { columns: { organizationId: true } },
              platformPosts: {
                columns: {
                  id: true,
                  externalId: true,
                  text: true,
                  metadata: true,
                  scheduledAt: true,
                  publishedAt: true,
                  platform: true,
                  format: true,
                  media: true,
                  status: true,
                  brandId: true,
                },
                with: { brand: { columns: { organizationId: true } } },
              },
            },
            columns: {
              id: true,
              title: true,
              seriesId: true,
              hook: true,
              captionDirection: true,
              body: true,
              plannedAt: true,
              media: true,
            },
          })
        : [],
      seriesIds.length
        ? db
            .select({
              id: seriesTable.id,
              description: seriesTable.description,
              startAt: seriesTable.startAt,
              endAt: seriesTable.endAt,
            })
            .from(seriesTable)
            .innerJoin(brandTable, eq(seriesTable.brandId, brandTable.id))
            .where(
              and(
                inArray(seriesTable.id, seriesIds),
                eq(brandTable.organizationId, orgId),
                isNull(seriesTable.deletedAt),
              ),
            )
        : [],
      campaignIds.length
        ? db
            .select({
              id: campaignTable.id,
              description: campaignTable.description,
              goal: campaignTable.goal,
              startAt: campaignTable.startAt,
              endAt: campaignTable.endAt,
              creativePool: campaignTable.creativePool,
            })
            .from(campaignTable)
            .innerJoin(brandTable, eq(campaignTable.brandId, brandTable.id))
            .where(
              and(
                inArray(campaignTable.id, campaignIds),
                eq(brandTable.organizationId, orgId),
                isNull(campaignTable.deletedAt),
              ),
            )
        : [],
      campaignIds.length
        ? db
            .select({
              id: adTable.id,
              status: adTable.status,
              campaignId: adTable.campaignId,
              brandId: adTable.brandId,
              name: adTable.name,
              content: adTable.content,
            })
            .from(adTable)
            .innerJoin(brandTable, eq(adTable.brandId, brandTable.id))
            .where(
              and(
                inArray(adTable.campaignId, campaignIds),
                eq(brandTable.organizationId, orgId),
              ),
            )
            .orderBy(adTable.createdAt)
        : [],
      campaignIds.length
        ? db
            .select({
              id: audienceTable.id,
              name: audienceTable.name,
              description: audienceTable.description,
              campaignId: audienceTable.campaignId,
            })
            .from(audienceTable)
            .innerJoin(brandTable, eq(audienceTable.brandId, brandTable.id))
            .where(
              and(
                inArray(audienceTable.campaignId, campaignIds),
                eq(brandTable.organizationId, orgId),
              ),
            )
        : [],
      campaignIds.length
        ? db
            .select({
              id: platformCampaignTable.id,
              externalId: platformCampaignTable.externalId,
              campaignId: platformCampaignTable.campaignId,
              platform: platformCampaignTable.platform,
              status: platformCampaignTable.status,
            })
            .from(platformCampaignTable)
            .innerJoin(
              brandTable,
              eq(platformCampaignTable.brandId, brandTable.id),
            )
            .where(
              and(
                inArray(platformCampaignTable.campaignId, campaignIds),
                eq(brandTable.organizationId, orgId),
              ),
            )
        : [],
      campaignIds.length
        ? db
            .select({
              adId: platformAdTable.adId,
              platform: platformAdTable.platform,
              status: platformAdTable.status,
            })
            .from(platformAdTable)
            .innerJoin(brandTable, eq(platformAdTable.brandId, brandTable.id))
            .innerJoin(adTable, eq(platformAdTable.adId, adTable.id))
            .where(
              and(
                inArray(adTable.campaignId, campaignIds),
                eq(brandTable.organizationId, orgId),
                isNotNull(platformAdTable.externalId),
              ),
            )
        : [],
    ]);
  const adAssetIds = ads.flatMap((ad) =>
    "media" in ad.content
      ? ad.content.media.flatMap((item) => (item.assetId ? [item.assetId] : []))
      : [],
  );
  const adAssets = adAssetIds.length
    ? await db
        .select({
          id: mediaAssetTable.id,
          width: mediaAssetTable.width,
          height: mediaAssetTable.height,
        })
        .from(mediaAssetTable)
        .innerJoin(brandTable, eq(mediaAssetTable.brandId, brandTable.id))
        .where(
          and(
            inArray(mediaAssetTable.id, adAssetIds),
            eq(brandTable.organizationId, orgId),
            isNull(mediaAssetTable.deletedAt),
          ),
        )
    : [];
  const dimensions = new Map(adAssets.map((asset) => [asset.id, asset]));
  const ownedPosts = posts.filter((p) => p.brand.organizationId === orgId);
  const editorialSpots = ownedPosts.flatMap((post) =>
    post.platformPosts
      .filter(
        (spot) =>
          spot.brand.organizationId === orgId &&
          ["newsletter", "blog"].includes(spot.platform),
      )
      .map((spot) => ({
        ...spot,
        contentPostId: post.id,
        seriesId: post.seriesId,
        contentTitle: post.title,
      })),
  );
  const editorialIds = editorialSpots.map((spot) => spot.id);
  const editorialDocuments = editorialIds.length
    ? await db
        .select({
          platformPostId: platformDocumentTable.platformPostId,
          documentId: productionPacketTable.id,
          document: productionPacketTable.document,
        })
        .from(platformDocumentTable)
        .innerJoin(
          productionPacketTable,
          eq(productionPacketTable.id, platformDocumentTable.documentId),
        )
        .where(
          and(
            inArray(platformDocumentTable.platformPostId, editorialIds),
            eq(productionPacketTable.organizationId, orgId),
          ),
        )
    : [];
  const documents = new Map(
    editorialDocuments.map((row) => [row.platformPostId, row.document]),
  );
  const editorial = [
    ...new Map(
      editorialSpots.map((spot) => {
        const document = documents.get(spot.id);
        const copy =
          spot.platform === "newsletter" && document?.type === "email"
            ? {
                title: document.content.subject,
                description: document.content.preheader,
              }
            : spot.platform === "blog" && document?.type === "article"
              ? {
                  title: document.content.title,
                  description: document.content.description,
                }
              : null;
        const metadata =
          spot.metadata && typeof spot.metadata === "object"
            ? (spot.metadata as Record<string, unknown>)
            : {};
        const description =
          typeof metadata.metaDescription === "string"
            ? metadata.metaDescription
            : typeof metadata.description === "string"
              ? metadata.description
              : null;
        return [
          spot.id,
          {
            id: spot.id,
            contentPostId: spot.contentPostId,
            seriesId: spot.seriesId,
            externalId: spot.externalId,
            documentId:
              editorialDocuments.find((row) => row.platformPostId === spot.id)
                ?.documentId ?? null,
            hasArticleBody:
              document?.type === "article" &&
              !!document.content.bodyMarkdown.trim(),
            kind:
              spot.platform === "newsletter"
                ? ("email" as const)
                : ("blog" as const),
            title: copy?.title || spot.text || spot.contentTitle || "Untitled",
            description: copy?.description || description,
            status: String(spot.status),
            scheduledAt: spot.scheduledAt?.toISOString() ?? null,
            publishedAt: spot.publishedAt?.toISOString() ?? null,
            media: media(spot.media ?? []),
          },
        ];
      }),
    ).values(),
  ];
  const postPreviews = ownedPosts.map((p) => {
    const spots = p.platformPosts.filter(
      (s) =>
        s.brand.organizationId === orgId &&
        !["newsletter", "blog"].includes(s.platform),
    );
    return {
      id: p.id,
      description: p.hook || p.captionDirection || p.body,
      plannedAt: p.plannedAt?.toISOString() ?? null,
      media: media([
        ...(p.media ?? []),
        ...spots.flatMap((s) => s.media ?? []),
      ]),
      channels: spots.map((s) => ({
        platform: s.platform,
        format: s.format,
        status: String(s.status),
      })),
    };
  });
  return {
    posts: postPreviews,
    editorial,
    series: series.map((s) => ({
      id: s.id,
      description: s.description,
      startAt: s.startAt?.toISOString() ?? null,
      endAt: s.endAt?.toISOString() ?? null,
      postCount: ownedPosts.filter((p) => p.seriesId === s.id).length,
      media: media(
        ownedPosts
          .filter((p) => p.seriesId === s.id)
          .flatMap((p) => [
            ...(p.media ?? []),
            ...p.platformPosts
              .filter((spot) => spot.brand.organizationId === orgId)
              .flatMap((spot) => spot.media ?? []),
          ]),
      ),
    })),
    campaigns: campaigns.map((c) => {
      const creatives = ads.filter((a) => a.campaignId === c.id);
      return {
        id: c.id,
        description: c.description,
        goal: c.goal,
        startAt: c.startAt?.toISOString() ?? null,
        endAt: c.endAt?.toISOString() ?? null,
        adCount: creatives.length,
        ads: creatives.map((a) => ({
          id: a.id,
          name: a.name,
          textOnly: !("media" in a.content),
          status: a.status,
          description:
            "media" in a.content
              ? a.content.body ||
                a.content.ideaStudio?.document.copy.headline ||
                a.content.headline ||
                null
              : a.content.headlines[0] || null,
          media: media(
            "media" in a.content
              ? [
                  ...a.content.media.map((item) => {
                    const asset = item.assetId
                      ? dimensions.get(item.assetId)
                      : undefined;
                    return {
                      ...item,
                      width: item.width ?? asset?.width ?? undefined,
                      height: item.height ?? asset?.height ?? undefined,
                    };
                  }),
                  ...(a.content.ideaStudio?.document.cards.flatMap((card) => {
                    const url = ideaPreviewUrl(a.brandId, card, "portrait");
                    return url ? [{ url, type: "image" as const }] : [];
                  }) ?? []),
                ]
              : [],
          ),
          executions: executions
            .filter((e) => e.adId === a.id)
            .map((e) => ({
              platform: e.platform,
              status: e.status ?? "unknown",
            })),
        })),
        creativeLines: creatives
          .slice(0, 3)
          .map((a) =>
            "media" in a.content
              ? a.content.ideaStudio?.document.copy.headline ||
                a.content.headline ||
                a.name
              : a.content.headlines[0] || a.name,
          ),
        audiences: audiences
          .filter((a) => a.campaignId === c.id)
          .map((a) => ({ id: a.id, name: a.name, description: a.description })),
        audienceCount: audiences.filter((a) => a.campaignId === c.id).length,
        media: media([
          ...creatives.flatMap((a) =>
            "media" in a.content
              ? [
                  ...a.content.media,
                  ...(a.content.ideaStudio?.document.cards.flatMap((card) => {
                    const url = ideaPreviewUrl(a.brandId, card, "portrait");
                    return url ? [{ url, type: "image" as const }] : [];
                  }) ?? []),
                  ...(a.content.ideaStudio?.document.pool?.map((item) => ({
                    url: item.url,
                    type: "image" as const,
                  })) ?? []),
                ]
              : [],
          ),
          ...(c.creativePool ?? []),
        ]),
        platforms: platforms
          .filter((p) => p.campaignId === c.id)
          .map((p) => ({
            id: p.id,
            platform: p.platform,
            status: String(p.status),
            pushed: !!p.externalId,
          })),
      };
    }),
  };
}
