import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import {
  contentPostTable,
  platformDocumentTable,
  platformPostTable,
  productionPacketTable,
} from "@/server/db/schema";
import { emptyCreativeDocument } from "@/lib/creative-document";

/** Open a blog's selected article, reusing existing work before creating a brief. */
export async function ensureBlogDocument(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
}) {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
    with: { brand: true, contentPost: true },
  });
  if (
    spot?.platform !== "blog" ||
    spot.source !== "owned" ||
    spot.brand.organizationId !== input.organizationId ||
    spot.brand.deletedAt ||
    spot.contentPost?.deletedAt
  )
    throw new Error("Blog not found in this workspace.");
  return withTransaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(platformPostTable)
      .where(eq(platformPostTable.id, spot.id))
      .for("update");
    if (!current) throw new Error("Blog no longer exists.");
    const selection = await tx.query.platformDocumentTable.findFirst({
      where: eq(platformDocumentTable.platformPostId, spot.id),
    });
    if (selection) {
      const selected = await tx.query.productionPacketTable.findFirst({
        where: and(
          eq(productionPacketTable.id, selection.documentId),
          eq(productionPacketTable.organizationId, input.organizationId),
          eq(productionPacketTable.brandId, spot.brandId),
        ),
      });
      if (
        selected?.documentType !== "article" ||
        selected.contentPostId !== current.contentPostId
      )
        throw new Error("Invalid article selection.");
      return selected.id;
    }
    let contentPostId = current.contentPostId;
    const title = spot.contentPost?.title ?? current.text ?? "Untitled blog";
    if (!contentPostId) {
      const [post] = await tx
        .insert(contentPostTable)
        .values({
          brandId: spot.brandId,
          title,
          status: "draft",
          createdById: input.userId,
          origin: "human",
        })
        .returning();
      contentPostId = post!.id;
      await tx
        .update(platformPostTable)
        .set({ contentPostId })
        .where(eq(platformPostTable.id, spot.id));
    }
    const existing = await tx.query.productionPacketTable.findFirst({
      where: and(
        eq(productionPacketTable.contentPostId, contentPostId),
        eq(productionPacketTable.organizationId, input.organizationId),
        eq(productionPacketTable.brandId, spot.brandId),
        eq(productionPacketTable.documentType, "article"),
      ),
      orderBy: asc(productionPacketTable.createdAt),
    });
    let documentId = existing?.id;
    if (!documentId) {
      const post = await tx.query.contentPostTable.findFirst({
        where: and(
          eq(contentPostTable.id, contentPostId),
          isNull(contentPostTable.deletedAt),
        ),
      });
      if (!post) throw new Error("Content item is unavailable.");
      const document = emptyCreativeDocument("article", title);
      document.brief.purpose = title;
      document.brief.direction = [
        post.hook,
        post.captionDirection,
        post.body,
        post.visualDirection,
      ]
        .filter(Boolean)
        .join("\n\n");
      document.brief.cta = post.ctaText ?? "";
      document.brief.constraints = [
        post.ctaKeyword && `CTA keyword: ${post.ctaKeyword}`,
        post.kpi && `Primary KPI: ${post.kpi}`,
      ].filter((v): v is string => !!v);
      if (document.type === "article")
        document.content.datoItemId = current.externalId ?? undefined;
      const [created] = await tx
        .insert(productionPacketTable)
        .values({
          organizationId: input.organizationId,
          brandId: spot.brandId,
          contentPostId,
          title,
          documentType: "article",
          document,
          prompt: document.brief.direction,
          createdBy: input.userId,
          status: "draft",
        })
        .returning();
      documentId = created!.id;
    }
    await tx
      .insert(platformDocumentTable)
      .values({ platformPostId: spot.id, documentId });
    return documentId;
  });
}
