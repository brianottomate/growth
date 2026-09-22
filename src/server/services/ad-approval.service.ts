import "server-only";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  adTable,
  campaignTable,
  brandTable,
  mediaAssetTable,
  platformAdTable,
} from "@/server/db/schema";
import {
  ideaDocumentFromAd,
  ideaExportShapesSchema,
  type IdeaShape,
  ideaAwaitingArtwork,
  ideaPreviewUrl,
  projectIdea,
  type IdeaStudio,
} from "@/lib/ad-idea-studio";
import {
  compositionPreviewSchema,
  getCompositionFormat,
} from "@/lib/compositions";
import {
  loadCompositionSource,
  renderComposition,
  resolveCompositionContext,
} from "./composition.service";
import { importImageBuffer } from "./media.service";

/** Freeze all sizes before the atomic transition. Failed/stale renders never approve an ad. */
export async function transitionAdApproval(input: {
  adId: string;
  orgId: string;
  userId: string;
  expectedUpdatedAt: string;
  exportShapes?: IdeaShape[];
  status: "drawn" | "approved";
}) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
  });
  const brand =
    ad &&
    (await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, ad.brandId),
        eq(brandTable.organizationId, input.orgId),
        isNull(brandTable.deletedAt),
      ),
    }));
  if (!ad || !brand) throw new Error("Ad not found");
  if (ad.updatedAt.toISOString() !== input.expectedUpdatedAt)
    throw new Error(
      "This ad changed elsewhere. Reload and review the latest version.",
    );
  if (!("media" in ad.content))
    throw new Error("This ad has no image composition.");
  if (isImportedMetaCatalog(ad.content))
    throw new Error(
      "Imported catalog ads are reference only; catalog approval is not supported.",
    );
  if (input.status === "approved" && ad.content.metaImport?.issues.length)
    throw new Error("Review the imported artwork and copy before approving.");
  const document = ideaDocumentFromAd({ name: ad.name, content: ad.content });
  if (input.status === "approved") {
    document.shapes = ideaExportShapesSchema.parse(
      input.exportShapes ?? document.exportShapes ?? document.shapes,
    );
    document.exportShapes = [...document.shapes];
  }
  const previous = ad.content.ideaStudio?.approval;
  if (input.status === "approved" && previous)
    return { adId: ad.id, status: "approved" as const };
  const studio: IdeaStudio = { document };
  const campaign = ad.campaignId
    ? await db.query.campaignTable.findFirst({
        where: eq(campaignTable.id, ad.campaignId),
        columns: { name: true },
      })
    : null;
  const generated: string[] = [];
  try {
    if (input.status === "approved") {
      if (!document.cards.length || ideaAwaitingArtwork(document))
        throw new Error(
          "Add artwork for every included size before approving.",
        );
      if (
        !document.copy.headline.trim() ||
        !document.copy.body.trim() ||
        !document.copy.linkUrl
      )
        throw new Error(
          "Add a headline, primary text, and destination URL before approving.",
        );
      studio.approval = {
        approvedAt: new Date().toISOString(),
        approvedBy: input.userId,
        sourceVersion: input.expectedUpdatedAt,
        renders: {},
      };
      for (const shape of document.shapes) {
        const renders: { assetId: string; url: string }[] = [];
        for (const [index, card] of document.cards.entries()) {
          const url = new URL(
            ideaPreviewUrl(brand.id, card, shape)!,
            "http://local",
          );
          const spec = compositionPreviewSchema.parse(
            Object.fromEntries(url.searchParams),
          );
          const context = await loadCompositionSource(
            await resolveCompositionContext(input.userId, spec, {
              sourceUrl: url.searchParams.get("sourceUrl"),
            }),
          );
          const bytes = Buffer.from(
            await renderComposition(spec, context).arrayBuffer(),
          );
          const format = getCompositionFormat(shape);
          const asset = await importImageBuffer({
            brandId: brand.id,
            uploadedBy: input.userId,
            body: bytes,
            contentType: "image/png",
            filename: `${ad.id}-${index + 1}-${shape}.png`,
            title: `${ad.name} · ${index + 1} · ${shape}`,
            width: format.width,
            height: format.height,
            metadata: {
              adApproval: {
                adId: ad.id,
                adName: ad.name,
                campaignId: ad.campaignId,
                campaignName: campaign?.name,
                sourceVersion: input.expectedUpdatedAt,
                shape,
                cardId: card.id,
              },
            },
          });
          generated.push(asset.id);
          renders.push({ assetId: asset.id, url: asset.url! });
        }
        studio.approval.renders[shape] = renders;
      }
    }
    const next = projectIdea(brand.id, ad.content, studio, ad.placements);
    const [saved] = await db
      .update(adTable)
      .set({ ...next, status: input.status, updatedAt: new Date() })
      .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
      .returning({ id: adTable.id });
    if (!saved)
      throw new Error(
        "This ad changed during rendering. Review it and approve again.",
      );
  } catch (error) {
    // Uncommitted exports cannot be referenced by this ad. Hide them from the library;
    // keep object bytes for recovery and eventual storage garbage collection.
    for (const id of generated)
      await db
        .update(mediaAssetTable)
        .set({ deletedAt: new Date() })
        .where(eq(mediaAssetTable.id, id));
    throw error;
  }
  if (input.status === "drawn" && previous) {
    const published = await db.query.platformAdTable.findFirst({
      where: eq(platformAdTable.adId, ad.id),
      columns: { id: true },
    });
    // A published version keeps its assets. Reopening only changes the local draft.
    if (!published) {
      const others = await db.query.adTable.findMany({
        columns: { id: true, content: true, placements: true },
      });
      for (const asset of Object.values(previous.renders).flat()) {
        const shared = others.some(
          (row) =>
            row.id !== ad.id &&
            (JSON.stringify(row.content).includes(asset.assetId) ||
              JSON.stringify(row.content).includes(asset.url) ||
              JSON.stringify(row.placements).includes(asset.url)),
        );
        const otherUse = await db.execute(sql`
          select 1 from (
            select to_jsonb(p)::text as payload from content_post p
            union all select to_jsonb(p)::text from platform_post p
            union all select to_jsonb(p)::text from platform_ad p
            union all select to_jsonb(p)::text from campaign p
            union all select to_jsonb(p)::text from media_asset p where p.id <> ${asset.assetId}
          ) refs where position(${asset.assetId} in payload) > 0 or position(${asset.url} in payload) > 0 limit 1
        `);
        if (!shared && otherUse.rows.length === 0)
          await db
            .update(mediaAssetTable)
            .set({ deletedAt: new Date() })
            .where(
              and(
                eq(mediaAssetTable.id, asset.assetId),
                eq(mediaAssetTable.brandId, brand.id),
                sql`${mediaAssetTable.metadata}->'adApproval'->>'adId' = ${ad.id}`,
              ),
            );
      }
    }
  }
  return { adId: ad.id, status: input.status };
}
