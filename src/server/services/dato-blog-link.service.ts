import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getBlogArticleDraft } from "@/server/clients/datocms-cda.client";
import { db } from "@/server/db";
import {
  brandTable,
  contentPostTable,
  platformPostTable,
} from "@/server/db/schema";

const PUBLIC_BASE = "https://www.wander.com/article";

export async function linkDatoBlogArticle(input: {
  itemId: string;
  organizationId: string;
  brandName?: string;
  linkedBy?: string;
  contentPostId?: string;
}) {
  const article = await getBlogArticleDraft(input.itemId);
  if (!article) {
    throw new Error(`No Dato blog article with id ${input.itemId}.`);
  }

  const brands = await db.query.brandTable.findMany({
    where: eq(brandTable.organizationId, input.organizationId),
    columns: { id: true, name: true },
  });
  const parent = input.contentPostId
    ? await db.query.contentPostTable.findFirst({
        where: and(
          eq(contentPostTable.id, input.contentPostId),
          isNull(contentPostTable.deletedAt),
        ),
        with: { brand: { columns: { organizationId: true } } },
      })
    : null;
  if (
    input.contentPostId &&
    parent?.brand.organizationId !== input.organizationId
  )
    throw new Error("Content post not found in this workspace.");
  const brandName = input.brandName?.trim() || "Wander";
  const needle = brandName.toLowerCase();
  const brand = parent
    ? brands.find((b) => b.id === parent.brandId)
    : (brands.find((candidate) => candidate.name.toLowerCase() === needle) ??
      brands.find((candidate) =>
        candidate.name.toLowerCase().includes(needle),
      ));
  if (!brand) {
    throw new Error(
      `No brand matching "${brandName}". Known: ${brands.map((candidate) => candidate.name).join(", ")}`,
    );
  }

  const existing = await db.query.platformPostTable.findFirst({
    where: and(
      eq(platformPostTable.brandId, brand.id),
      eq(platformPostTable.platform, "blog"),
      eq(platformPostTable.externalId, input.itemId),
    ),
  });
  if (parent && existing?.contentPostId && existing.contentPostId !== parent.id)
    throw new Error("Article already belongs to a different content post.");
  const slot =
    parent && !existing
      ? await db.query.platformPostTable.findFirst({
          where: and(
            eq(platformPostTable.contentPostId, parent.id),
            eq(platformPostTable.brandId, parent.brandId),
            eq(platformPostTable.platform, "blog"),
            isNull(platformPostTable.externalId),
          ),
        })
      : null;
  const target = existing ?? slot;
  const existingMetadata =
    target?.metadata && typeof target.metadata === "object"
      ? (target.metadata as Record<string, unknown>)
      : {};
  const values = {
    ...(parent ? { contentPostId: parent.id } : {}),
    brandId: brand.id,
    platform: "blog" as const,
    username: "wander.com/blog",
    source: "owned" as const,
    status:
      article._status === "published"
        ? ("published" as const)
        : ("draft" as const),
    origin: "human" as const,
    provider: "native" as const,
    text: article.title,
    externalId: input.itemId,
    externalKind: "blog_article",
    externalUrl: article.url ? `${PUBLIC_BASE}/${article.url}` : null,
    media: article.image?.url
      ? [{ url: article.image.url, type: "image" as const }]
      : undefined,
    cleanupStatus: "keep" as const,
    isSeed: false,
    metadata: {
      ...existingMetadata,
      description: article.description,
      metaDescription: article.description,
      slug: article.url,
      linkedBy: input.linkedBy ?? "blog-agent",
    },
  };

  if (target) {
    await db
      .update(platformPostTable)
      .set(values)
      .where(eq(platformPostTable.id, target.id));
    return {
      platformPostId: target.id,
      itemId: input.itemId,
      created: false,
      status: values.status,
    };
  }

  const [created] = await db
    .insert(platformPostTable)
    .values(values)
    .returning({ id: platformPostTable.id });
  if (!created) {
    throw new Error(`Failed to link Dato article ${input.itemId} into Growth.`);
  }
  return {
    platformPostId: created.id,
    itemId: input.itemId,
    created: true,
    status: values.status,
  };
}
