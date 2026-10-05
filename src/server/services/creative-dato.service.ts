import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { creativeDocumentSchema } from "@/lib/creative-document";
import { buildDatoArticleBody } from "./blog-markdown-export.service";
import { datoStructuredTextToPlainText } from "@/lib/dato-structured-text";
import { db } from "@/server/db";
import {
  brandTable,
  mediaAssetTable,
  platformDocumentTable,
  platformPostTable,
} from "@/server/db/schema";
import {
  createDraftItem,
  createUploadFromUrl,
  findAuthorIdByName,
  getItem,
  resolveItemTypeId,
  updateItemFields,
} from "@/server/clients/datocms.client";
import {
  beginDocumentRun,
  claimDocumentRun,
  failDocumentRun,
  finishDocumentRun,
  getCreativeDocument,
} from "./creative-document.service";

export async function transferDatoDocument(input: {
  documentId: string;
  organizationId: string;
  userId: string;
  direction: "pull" | "push";
  itemId?: string;
}) {
  const packet = await getCreativeDocument(
    input.documentId,
    input.organizationId,
  );
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, packet.brandId),
  });
  const hostname = brand?.website
    ? new URL(brand.website).hostname.replace(/^www\./, "")
    : "";
  if (hostname !== "wander.com")
    throw new Error("The Dato connection belongs to the Wander.com brand.");
  if (packet.document.type !== "article")
    throw new Error("Dato accepts article documents only.");
  const run = await beginDocumentRun({
    ...input,
    operation: input.direction,
    provider: "datocms",
    model: "none",
  });
  await claimDocumentRun(run.id);
  try {
    const document = creativeDocumentSchema.parse(run.input.document);
    if (document.type !== "article") throw new Error("Expected article.");
    let itemId = input.itemId ?? document.content.datoItemId;
    if (itemId) {
      const existing = await getItem(itemId);
      if (
        existing.relationships?.item_type?.data?.id !==
        (await resolveItemTypeId("blog_article"))
      )
        throw new Error("That Dato record is not a blog article.");
    }
    if (input.direction === "pull") {
      if (!itemId) throw new Error("Choose a Dato article to pull.");
      const item = await getItem(itemId);
      const attrs = item.attributes;
      const content = {
        ...document.content,
        title: z.string().parse(attrs.title),
        slug: z.string().parse(attrs.url),
        description: z.string().parse(attrs.description ?? ""),
        bodyMarkdown: datoStructuredTextToPlainText(attrs.body),
        datoBody: z.record(z.string(), z.json()).parse(attrs.body),
        datoItemId: itemId,
        datoAuthorId: z
          .string()
          .optional()
          .parse(attrs.author ?? undefined),
      };
      if (
        !(await finishDocumentRun(
          run.id,
          { ...document, content },
          { itemId, direction: "pull" },
        ))
      )
        throw new Error(
          "Dato pull timed out. Pull again to refresh the local document.",
        );
    } else {
      const content = document.content;
      if (
        !content.title.trim() ||
        !content.slug.trim() ||
        (!content.bodyMarkdown.trim() && !content.datoBody)
      )
        throw new Error(
          "Complete the article title, slug and body before pushing.",
        );
      const authorId =
        content.datoAuthorId ?? (await findAuthorIdByName(content.authorName));
      if (!authorId) throw new Error("Choose an existing Dato author.");
      if (!itemId && !content.heroAssetId)
        throw new Error("A new Dato draft needs a hero image.");
      const body =
        content.datoBody ??
        (await buildDatoArticleBody(content.bodyMarkdown, packet.brandId));
      let image: { upload_id: string } | undefined;
      if (content.heroAssetId) {
        const asset = await db.query.mediaAssetTable.findFirst({
          where: eq(mediaAssetTable.id, content.heroAssetId),
        });
        if (
          !asset ||
          asset.brandId !== packet.brandId ||
          asset.kind !== "image" ||
          asset.status !== "ready" ||
          !asset.url
        )
          throw new Error("Select a ready hero image from this brand.");
        image = {
          upload_id: await createUploadFromUrl(
            asset.url,
            `${content.slug}-hero`,
          ),
        };
      }
      if (!itemId && !image)
        throw new Error("A new Dato draft needs a hero image.");
      const attributes = {
        title: content.title,
        url: content.slug,
        description: content.description,
        author: authorId,
        body,
        ...(image ? { image } : {}),
      };
      if (itemId) await updateItemFields(itemId, attributes);
      else
        itemId = (
          await createDraftItem({
            itemTypeId: await resolveItemTypeId("blog_article"),
            attributes,
          })
        ).id;
      if (
        !(await finishDocumentRun(
          run.id,
          { ...document, content: { ...content, datoItemId: itemId } },
          { itemId, direction: "push", published: false },
        ))
      )
        throw new Error(
          `Dato draft ${itemId} was written, but the local transfer timed out. Pull this item to recover it; do not create another draft.`,
        );
    }
    const stored = await getCreativeDocument(packet.id, input.organizationId);
    const slug =
      stored.document.type === "article" ? stored.document.content.slug : "";
    const links = await db
      .select()
      .from(platformDocumentTable)
      .where(eq(platformDocumentTable.documentId, packet.id));
    for (const link of links)
      await db
        .update(platformPostTable)
        .set({
          externalId: itemId,
          externalKind: "blog_article",
          externalUrl: `https://www.wander.com/article/${slug}`,
        })
        .where(eq(platformPostTable.id, link.platformPostId));
    return { documentId: packet.id, itemId, published: false };
  } catch (error) {
    await failDocumentRun(run.id, error);
    throw error;
  }
}
