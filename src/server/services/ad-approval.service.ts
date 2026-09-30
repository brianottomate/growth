import "server-only";
import { reusableApprovalAsset } from "@/lib/ad-approval-assets";
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
  ideaImagesSaved,
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
import { deleteMedia, importImageBuffer } from "./media.service";

type Brand = typeof brandTable.$inferSelect;

/**
 * Render every card at each of `shapes` into the brand's library. Returns the
 * renders by shape and the ids created, so a caller whose save fails can
 * delete them: an uncommitted export must not outlive its ad.
 */
async function renderApprovalExports(input: {
  ad: typeof adTable.$inferSelect;
  brand: Brand;
  document: IdeaStudio["document"];
  shapes: IdeaShape[];
  userId: string;
  sourceVersion: string;
  generated: string[];
}) {
  const { ad, brand, document } = input;
  const campaign = ad.campaignId
    ? await db.query.campaignTable.findFirst({
        where: eq(campaignTable.id, ad.campaignId),
        columns: { name: true },
      })
    : null;
  const byShape: NonNullable<IdeaStudio["approval"]>["renders"] = {};
  for (const shape of input.shapes) {
    const renders: { assetId: string; url: string; reused?: true }[] = [];
    for (const [index, card] of document.cards.entries()) {
      const url = new URL(
        ideaPreviewUrl(brand.id, card, shape)!,
        "http://local",
      );
      const spec = compositionPreviewSchema.parse(
        Object.fromEntries(url.searchParams),
      );
      const resolved = await resolveCompositionContext(input.userId, spec, {
        sourceUrl: url.searchParams.get("sourceUrl"),
      });
      const reusable = reusableApprovalAsset(card, shape, resolved.sourceAsset);
      if (reusable) {
        renders.push(reusable);
        continue;
      }
      const context = await loadCompositionSource(resolved);
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
            sourceVersion: input.sourceVersion,
            shape,
            cardId: card.id,
          },
        },
      });
      input.generated.push(asset.id);
      renders.push({ assetId: asset.id, url: asset.url! });
    }
    byShape[shape] = renders;
  }
  return byShape;
}

/**
 * Render and save the images an approved ad has not frozen yet. Approval is a
 * sign-off; the files are made when something needs real URLs (a push, a
 * platform preview), as the approver. Returns whether anything was frozen.
 */
/** Whether every approved size of the ad has its saved images. */
export async function approvedAdFrozen(adId: string): Promise<boolean> {
  const ad = await db.query.adTable.findFirst({ where: eq(adTable.id, adId) });
  if (!ad || !("media" in ad.content)) return false;
  const studio = ad.content.ideaStudio;
  return Boolean(studio?.approval && ideaImagesSaved(studio));
}

export async function freezeApprovedAd(adId: string): Promise<boolean> {
  const ad = await db.query.adTable.findFirst({ where: eq(adTable.id, adId) });
  if (!ad || !("media" in ad.content)) return false;
  const studio = ad.content.ideaStudio;
  const approval = studio?.approval;
  if (!studio || !approval) return false;
  const document = studio.document;
  const missing = document.shapes.filter(
    (shape) => approval.renders[shape]?.length !== document.cards.length,
  );
  if (!missing.length) return false;
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, ad.brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand) throw new Error("Ad not found");
  const generated: string[] = [];
  try {
    const renders = await renderApprovalExports({
      ad,
      brand,
      document,
      shapes: missing,
      userId: approval.approvedBy,
      sourceVersion: approval.sourceVersion,
      generated,
    });
    const next = projectIdea(
      brand.id,
      ad.content,
      {
        ...studio,
        approval: { ...approval, renders: { ...approval.renders, ...renders } },
      },
      ad.placements,
    );
    const [saved] = await db
      .update(adTable)
      .set({ ...next, updatedAt: new Date() })
      .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
      .returning({ id: adTable.id });
    if (!saved) {
      for (const id of generated) await deleteMedia(id);
      generated.length = 0;
      // The background save after Approve and a push can race; whichever
      // lands second finds the images already saved and has nothing to do.
      if (await approvedAdFrozen(ad.id)) return false;
      throw new Error(
        `${ad.name} changed while its images were saved. Try again.`,
      );
    }
  } catch (error) {
    for (const id of generated) await deleteMedia(id);
    throw error;
  }
  return true;
}

/**
 * A pushed ad is read-only: its images are frozen and Meta runs them. To change
 * one, build a new ad or campaign and push that.
 */
export async function assertAdNotPushed(adId: string) {
  const pushed = await db.query.platformAdTable.findFirst({
    where: eq(platformAdTable.adId, adId),
    columns: { id: true },
  });
  if (pushed)
    throw new Error(
      "This ad is pushed and read-only. Make a new ad or campaign to change it.",
    );
}

/** Approval signs off copy and creative; the images are frozen at push. */
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
  if (input.status === "drawn") await assertAdNotPushed(ad.id);
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
  if (input.status === "approved") {
    if (!document.cards.length || ideaAwaitingArtwork(document))
      throw new Error("Add artwork for every included size before approving.");
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
  }
  const next = projectIdea(brand.id, ad.content, studio, ad.placements);
  const [saved] = await db
    .update(adTable)
    .set({ ...next, status: input.status, updatedAt: new Date() })
    .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
    .returning({ id: adTable.id });
  if (!saved)
    throw new Error(
      "This ad changed during approval. Review it and approve again.",
    );
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
        // Reused originals belong to the library, not this approval.
        if (asset.reused) continue;
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
        if (!shared && otherUse.rows.length === 0) {
          const own = await db.query.mediaAssetTable.findFirst({
            where: and(
              eq(mediaAssetTable.id, asset.assetId),
              eq(mediaAssetTable.brandId, brand.id),
              sql`${mediaAssetTable.metadata}->'adApproval'->>'adId' = ${ad.id}`,
            ),
            columns: { id: true },
          });
          if (own) await deleteMedia(own.id);
        }
      }
    }
  }
  return { adId: ad.id, status: input.status };
}
