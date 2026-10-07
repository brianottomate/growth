import { approvedOutput } from "@/lib/ad-approved-output";
import { withTransaction } from "@/server/db";
import { reviewActor, reviewSubjectFields } from "./review-comments.service";
import type { GrowthActionContext } from "@/server/ai/kernel/tool";
import "server-only";
import { reusableApprovalAsset } from "@/lib/ad-approval-assets";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  adTable,
  campaignTable,
  brandTable,
  platformAdTable,
  contentCommentTable,
} from "@/server/db/schema";
import {
  ideaDocumentFromAd,
  ideaExportShapesSchema,
  type IdeaShape,
  ideaAwaitingArtwork,
  ideaImagesSaved,
  ideaPreviewUrl,
  ideaSource,
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
  if (ad?.status !== "approved" || !("media" in ad.content)) return false;
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
  if (ad?.status !== "approved") return false;
  if (!("media" in ad.content) || !ad.content.ideaStudio) {
    if (ad.approvedSnapshot) return false;
    if (!ad.approvedBy)
      throw new Error(
        "Return this ad to Studio and approve it again before publishing.",
      );
    await db
      .update(adTable)
      .set({
        approvedSnapshot: {
          content: approvedOutput(ad.content),
          placements: ad.placements,
          approvedAt: (ad.approvedAt ?? ad.updatedAt).toISOString(),
          approvedBy: ad.approvedBy,
        },
      })
      .where(
        and(
          eq(adTable.id, ad.id),
          eq(adTable.updatedAt, ad.updatedAt),
          eq(adTable.status, "approved"),
        ),
      );
    return true;
  }
  const studio = ad.content.ideaStudio;
  const approval = studio?.approval;
  if (!studio || !approval) return false;
  const document = studio.document;
  const missing = document.shapes.filter(
    (shape) => approval.renders[shape]?.length !== document.cards.length,
  );
  if (!missing.length && ad.approvedSnapshot) return false;
  if (!missing.length) {
    await db
      .update(adTable)
      .set({
        approvedSnapshot: {
          content: approvedOutput(ad.content),
          placements: ad.placements,
          approvedAt: approval.approvedAt,
          approvedBy: approval.approvedBy,
        },
      })
      .where(
        and(
          eq(adTable.id, ad.id),
          eq(adTable.updatedAt, ad.updatedAt),
          eq(adTable.status, "approved"),
        ),
      );
    return true;
  }
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
      .set({
        ...next,
        approvedSnapshot: {
          content: approvedOutput(next.content),
          placements: next.placements,
          approvedAt: approval.approvedAt,
          approvedBy: approval.approvedBy,
        },
        updatedAt: new Date(),
      })
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
  const source = await db.query.adTable.findFirst({
    where: eq(adTable.id, adId),
    columns: { status: true, campaignId: true },
  });
  if (source && source.status !== "approved" && !source.campaignId) return;
  const pushed = await db.query.platformAdTable.findFirst({
    where: eq(platformAdTable.adId, adId),
    columns: { id: true },
  });
  if (pushed)
    throw new Error(
      "Return this ad to Studio before editing. Its platform ads stay unchanged.",
    );
}

/**
 * Approve an image ad. Output stays frozen until the same ad returns to Studio.
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
  // The one place sources are vouched for: approval is what lets them render.
  const sources = new Map(
    document.cards.flatMap((card) =>
      document.shapes.flatMap((shape) => {
        const source = ideaSource(card, shape);
        return source ? [[source.assetId ?? source.url, source] as const] : [];
      }),
    ),
  );
  for (const source of sources.values())
    await resolveCompositionContext(
      input.userId,
      compositionPreviewSchema.parse({
        brandId: brand.id,
        templateId: "photo-only",
        formatId: "portrait",
        title: "",
        sourceMediaAssetId: source.assetId,
      }),
      { sourceUrl: source.assetId ? null : source.url },
    );
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

/** Reopen the same ad. Campaign membership and sign-off are cleared atomically. */
export async function returnAdToStudio(
  input: {
    adId: string;
    expectedUpdatedAt: string;
    comment?: string;
    as?: "user" | "agent";
  },
  ctx: GrowthActionContext,
) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
  });
  const brand =
    ad &&
    (await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, ad.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true },
    }));
  if (!ad || !brand) throw new Error("Ad not found");
  if (ad.updatedAt.toISOString() !== input.expectedUpdatedAt)
    throw new Error("This ad changed. Refresh before returning it to Studio.");
  if (ad.status !== "approved" && !ad.campaignId)
    throw new Error("This ad is already a Studio draft.");
  const pushed = await db.query.platformAdTable.findMany({
    where: eq(platformAdTable.adId, ad.id),
  });
  let content = ad.content;
  let placements = ad.placements;
  if ("media" in content && content.ideaStudio) {
    const { approval: _approval, ...studio } = content.ideaStudio;
    const next = projectIdea(brand.id, content, studio, placements);
    content = next.content;
    placements = next.placements;
  }
  await withTransaction(async (tx) => {
    const saved = await tx
      .update(adTable)
      .set({
        campaignId: null,
        status: "drawn",
        readyAt: null,
        readyBy: null,
        approvedAt: null,
        approvedBy: null,
        approvedSnapshot: null,
        replacesAdId: null,
        content,
        placements,
        businessKey: null,
        updatedAt: new Date(),
      })
      .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
      .returning({ id: adTable.id });
    if (!saved.length)
      throw new Error(
        "This ad changed. Refresh before returning it to Studio.",
      );
    for (const platform of pushed) {
      if (platform.pushedCreative) continue;
      await tx
        .update(platformAdTable)
        .set({
          pushedCreative: {
            name: platform.name ?? ad.name,
            headline: platform.headline,
            body: platform.body,
            linkUrl: platform.linkUrl,
            media: platform.media,
            copy: platform.copy,
          },
        })
        .where(
          and(
            eq(platformAdTable.id, platform.id),
            isNull(platformAdTable.pushedCreative),
          ),
        );
    }
    await tx.insert(contentCommentTable).values({
      ...reviewSubjectFields({ type: "ad", id: ad.id }),
      ...reviewActor(ctx, input.as),
      event: "return_to_studio",
      body: `Returned to Studio.${input.comment?.trim() ? `\n\n${input.comment.trim()}` : ""}${pushed.length ? "\n\nExisting platform ads were left unchanged and may still be running." : ""}`,
    });
  });
  // Keep approval assets: an in-flight platform push may still reference them.
  return {
    adId: ad.id,
    status: "drawn" as const,
    platformAdsUnchanged: pushed.length,
  };
}
