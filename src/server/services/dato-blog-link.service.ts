import "server-only";

import { and, eq } from "drizzle-orm";

import { getBlogArticleDraft } from "@/server/clients/datocms-cda.client";
import { db } from "@/server/db";
import { brandTable, platformPostTable } from "@/server/db/schema";

const PUBLIC_BASE = "https://www.wander.com/article";

export async function linkDatoBlogArticle(input: {
  itemId: string;
  organizationId: string;
  brandName?: string;
  linkedBy?: string;
}) {
  const article = await getBlogArticleDraft(input.itemId);
  if (!article) {
    throw new Error(`No Dato blog article with id ${input.itemId}.`);
  }

  const brands = await db.query.brandTable.findMany({
    where: eq(brandTable.organizationId, input.organizationId),
    columns: { id: true, name: true },
  });
  const brandName = input.brandName?.trim() || "Wander";
  const needle = brandName.toLowerCase();
  const brand =
    brands.find((candidate) => candidate.name.toLowerCase() === needle) ??
    brands.find((candidate) => candidate.name.toLowerCase().includes(needle));
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
  const existingMetadata =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const values = {
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

  if (existing) {
    await db
      .update(platformPostTable)
      .set(values)
      .where(eq(platformPostTable.id, existing.id));
    return {
      platformPostId: existing.id,
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
