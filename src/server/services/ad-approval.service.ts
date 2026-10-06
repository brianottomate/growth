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

/** Whether every approved size of the ad has its saved images. */
export async function approvedAdFrozen(adId: string): Promise<boolean> {
  const ad = await db.query.adTable.findFirst({ where: eq(adTable.id, adId) });
  if (!ad || !("media" in ad.content)) return false;
  const studio = ad.content.ideaStudio;
  return Boolean(studio?.approval && ideaImagesSaved(studio));
}

/**
 * Render and save the images an approved ad has not saved yet, as the
 * approver. Approval starts it in the background; the push and the previews
 * call it too, so they never send live renders. Returns whether it saved any.
 */
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
 * one, edit it into the draft that replaces it.
 */
export async function assertAdNotPushed(adId: string) {
  const pushed = await db.query.platformAdTable.findFirst({
    where: eq(platformAdTable.adId, adId),
    columns: { id: true },
  });
  if (pushed)
    throw new Error(
      "This ad is pushed and read-only. Edit it to make a draft that replaces it.",
    );
}

/**
 * Approve an image ad. Approval is final: the ad never changes again, and the
 * way to change it is `editApprovedAd`, which makes a draft that replaces it.
 * The images every included size needs are rendered and saved right after,
 * in the background, so approving stays instant.
 */
export async function approveImageAd(input: {
  adId: string;
  orgId: string;
  userId: string;
  expectedUpdatedAt: string;
  exportShapes?: IdeaShape[];
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
  if (ad.status === "approved")
    return { adId: ad.id, status: "approved" as const };
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
  if (ad.content.metaImport?.issues.length)
    throw new Error("Review the imported artwork and copy before approving.");
  const document = ideaDocumentFromAd({ name: ad.name, content: ad.content });
  document.shapes = ideaExportShapesSchema.parse(
    input.exportShapes ?? document.exportShapes ?? document.shapes,
  );
  document.exportShapes = [...document.shapes];
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
  const approvedAt = new Date();
  const studio: IdeaStudio = {
    document,
    approval: {
      approvedAt: approvedAt.toISOString(),
      approvedBy: input.userId,
      sourceVersion: input.expectedUpdatedAt,
      renders: {},
    },
  };
  const next = projectIdea(brand.id, ad.content, studio, ad.placements);
  const [saved] = await db
    .update(adTable)
    .set({
      ...next,
      status: "approved",
      approvedAt,
      approvedBy: input.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
    .returning({ id: adTable.id });
  if (!saved)
    throw new Error(
      "This ad changed during approval. Review it and approve again.",
    );
  return { adId: ad.id, status: "approved" as const };
}

/**
 * The approved ad a newly approved draft was made from is done. One that never
 * ran is deleted with the images its approval saved; one that ran stays for its
 * stats and keeps running until someone pauses it on the platform.
 */
export async function retireReplacedAd(adId: string) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, adId),
    columns: { replacesAdId: true },
  });
  if (!ad?.replacesAdId) return { retired: null };
  const old = await db.query.adTable.findFirst({
    where: eq(adTable.id, ad.replacesAdId),
  });
  if (!old) return { retired: null };
  const pushed = await db.query.platformAdTable.findFirst({
    where: eq(platformAdTable.adId, old.id),
    columns: { id: true },
  });
  if (pushed) return { retired: old.id, deleted: false };
  await db.delete(adTable).where(eq(adTable.id, old.id));
  await deleteApprovalRenders(old).catch((error: unknown) =>
    console.error("replaced ad image cleanup failed", old.id, error),
  );
  return { retired: old.id, deleted: true };
}

/**
 * Change an approved ad by making the draft that will replace it: same name,
 * home, campaign, routing and creative, without the approval. Calling it again
 * returns the draft already open, so there is only ever one.
 */
export async function editApprovedAd(input: { adId: string; orgId: string }) {
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
      columns: { id: true },
    }));
  if (!ad || !brand) throw new Error("Ad not found");
  if (ad.status !== "approved")
    throw new Error(
      "Only an approved ad needs a copy; edit this one directly.",
    );
  const open = await db.query.adTable.findFirst({
    where: and(
      eq(adTable.replacesAdId, ad.id),
      sql`${adTable.status} <> 'approved'`,
    ),
    columns: { id: true },
  });
  if (open) return { adId: open.id, replacesAdId: ad.id, created: false };
  let content = ad.content;
  if ("media" in content && content.ideaStudio) {
    const { approval: _approval, ...draft } = content.ideaStudio;
    content = projectIdea(brand.id, content, draft, ad.placements).content;
  }
  const [copy] = await db
    .insert(adTable)
    .values({
      brandId: ad.brandId,
      campaignId: ad.campaignId,
      homeId: ad.homeId,
      bookingTargetId: ad.bookingTargetId,
      name: ad.name,
      type: ad.type,
      status: "drawn",
      content,
      placements: ad.placements,
      platforms: ad.platforms,
      replacesAdId: ad.id,
    })
    .returning({ id: adTable.id });
  return { adId: copy!.id, replacesAdId: ad.id, created: true };
}

/**
 * Delete the images an approval saved for this ad, unless something else
 * still points at them. Reused library originals are never this ad's to
 * delete.
 */
async function deleteApprovalRenders(ad: typeof adTable.$inferSelect) {
  if (!("media" in ad.content)) return;
  const approval = ad.content.ideaStudio?.approval;
  if (!approval) return;
  for (const asset of Object.values(approval.renders).flat()) {
    if (asset.reused) continue;
    const otherUse = await db.execute(sql`
      select 1 from (
        select to_jsonb(p)::text as payload from ad p
        union all select to_jsonb(p)::text from content_post p
        union all select to_jsonb(p)::text from platform_post p
        union all select to_jsonb(p)::text from platform_ad p
        union all select to_jsonb(p)::text from campaign p
        union all select to_jsonb(p)::text from media_asset p where p.id <> ${asset.assetId}
      ) refs where position(${asset.assetId} in payload) > 0 or position(${asset.url} in payload) > 0 limit 1
    `);
    if (otherUse.rows.length) continue;
    const own = await db.query.mediaAssetTable.findFirst({
      where: and(
        eq(mediaAssetTable.id, asset.assetId),
        eq(mediaAssetTable.brandId, ad.brandId),
        sql`${mediaAssetTable.metadata}->'adApproval'->>'adId' = ${ad.id}`,
      ),
      columns: { id: true },
    });
    if (own) await deleteMedia(own.id);
  }
}
