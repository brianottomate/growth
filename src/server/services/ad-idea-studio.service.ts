import type { DraftAdResult } from "@/server/ai/capabilities/outputs/ads";
import { isPlaceholderUrl } from "@/lib/placeholder-image";
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import {
  ideaSaveSchema,
  projectIdea,
  withIdeaPool,
} from "@/lib/ad-idea-studio";
import { compositionPreviewSchema } from "@/lib/compositions";
import { db } from "@/server/db";
import { adTable, brandTable } from "@/server/db/schema";
import { resolveCompositionContext } from "./composition.service";
import { assertAdNotPushed } from "./ad-approval.service";
import { resolveBookingTarget } from "./home-groups.service";

/** One shared edit path for humans and assistants. Saving keeps this a draft. */
export async function saveAdIdea(
  input: z.infer<typeof ideaSaveSchema>,
  context: { orgId: string; userId: string },
): Promise<DraftAdResult> {
  const { document: incoming, ...args } = ideaSaveSchema.parse(input);
  const document = withIdeaPool(incoming);
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, args.adId),
  });
  const brand =
    ad &&
    (await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, ad.brandId),
        eq(brandTable.organizationId, context.orgId),
        isNull(brandTable.deletedAt),
      ),
    }));
  if (!ad || !brand) throw new Error("Ad not found");
  await assertAdNotPushed(ad.id);
  if (!("media" in ad.content))
    throw new Error(
      "This mini studio edits image ads; use the existing editor for text ads",
    );
  if (
    ad.content.media.some((card) => card.type !== "image") ||
    (ad.content.format && !["static", "carousel"].includes(ad.content.format))
  ) {
    throw new Error("Use the existing editor for this ad format");
  }
  if (ad.updatedAt.toISOString() !== args.expectedUpdatedAt)
    throw new Error(
      "This ad changed elsewhere. Reload before saving your edits.",
    );

  const bookingTargetId = document.copy.bookingTargetId;
  if (bookingTargetId && bookingTargetId !== ad.bookingTargetId) {
    const resolved = await resolveBookingTarget(bookingTargetId, context.orgId);
    if (resolved.target.brandId !== brand.id)
      throw new Error("Booking target belongs to another brand.");
    if (resolved.url !== document.copy.linkUrl)
      throw new Error(
        "This booking target changed. Choose it again before saving.",
      );
  }

  // Validate source ownership even while the draft has incomplete overlay text.
  // Placeholders are briefs served by Growth itself, not photos to vouch for.
  const sources = (document.pool ?? []).filter(
    (source) => source.assetId || !isPlaceholderUrl(source.url),
  );
  for (let start = 0; start < sources.length; start += 8) {
    await Promise.all(
      sources.slice(start, start + 8).map(async (source) => {
        const spec = compositionPreviewSchema.parse({
          brandId: brand.id,
          templateId: "photo-only",
          formatId: "portrait",
          title: "",
          sourceMediaAssetId: source.assetId,
        });
        await resolveCompositionContext(context.userId, spec, {
          sourceUrl: source.assetId ? null : source.url,
        });
      }),
    );
  }
  if (ad.content.ideaStudio?.approval)
    throw new Error(
      "Approved ads are final. Edit it to make a draft that replaces it.",
    );
  if (
    args.reviewImportedCreative &&
    (!document.cards.length ||
      !document.copy.headline.trim() ||
      !document.copy.body.trim() ||
      !document.copy.linkUrl ||
      /\s/.test(document.copy.linkUrl))
  )
    throw new Error(
      "Complete the creative and copy before marking the import reviewed.",
    );
  const next = projectIdea(brand.id, ad.content, { document }, ad.placements);
  if (args.reviewImportedCreative && next.content.metaImport)
    next.content.metaImport = { ...next.content.metaImport, issues: [] };
  const [saved] = await db
    .update(adTable)
    .set({
      ...next,
      ...(bookingTargetId !== undefined ? { bookingTargetId } : {}),
      name: args.name,
      status: "drawn",
      readyAt: null,
      readyBy: null,
      updatedAt: new Date(),
    })
    .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
    .returning();
  if (!saved)
    throw new Error(
      "This ad changed while saving. Reload before trying again.",
    );

  return saved;
}
