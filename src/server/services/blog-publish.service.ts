import "server-only";

import { eq } from "drizzle-orm";

import { markdownToDatoStructuredText } from "@/lib/dato-markdown";
import { db } from "@/server/db";
import { contentPostTable, platformPostTable } from "@/server/db/schema";
import {
  createDraftItem,
  createUploadFromUrl,
  findAuthorIdByName,
  isDatoCmsConfigured,
  resolveAdminDomain,
  resolveItemTypeId,
} from "@/server/clients/datocms.client";

// Push a drafted blog platform_post into DatoCMS as a DRAFT article. This is
// the write half of the wander.com blog bridge (scripts/import-blog.ts is the
// read half). Deliberate limits, matching how the team actually works:
//   - Never publishes. Humans review and hit publish in the Dato editor.
//   - Refuses to run twice for the same spot (externalId acts as the link).
//   - Requires a hero image because the Dato model requires one.

const BLOG_BASE = "https://www.wander.com/article";

export type PublishBlogDraftResult = {
  itemId: string;
  slug: string;
  editorUrl: string | null;
  plannedPublicUrl: string;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Split a markdown draft into title (first h1) and body (the rest). */
function splitDraft(markdown: string): { title: string | null; body: string } {
  const lines = markdown.trim().split("\n");
  if (lines[0]?.startsWith("# ")) {
    return {
      title: lines[0].slice(2).trim(),
      body: lines.slice(1).join("\n").trim(),
    };
  }
  return { title: null, body: markdown.trim() };
}

export async function publishBlogDraft(input: {
  platformPostId: string;
  /** Dato blog_author name. Defaults to the neutral "Wander" team author —
   * a human claims the byline when they review the draft. */
  authorName?: string;
}): Promise<PublishBlogDraftResult> {
  if (!isDatoCmsConfigured) {
    throw new Error(
      "DatoCMS publishing is not configured (DATOCMS_CMA_TOKEN).",
    );
  }
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
  });
  if (!spot) throw new Error("Platform post not found.");
  if (spot.platform !== "blog") {
    throw new Error("Only blog platform posts can be published to DatoCMS.");
  }
  if (spot.externalId) {
    throw new Error(
      `This spot is already linked to DatoCMS item ${spot.externalId}. Edit it in the Dato editor instead.`,
    );
  }
  if (!spot.text?.trim()) {
    throw new Error("The blog spot has no drafted text yet.");
  }

  const content = spot.contentPostId
    ? await db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, spot.contentPostId),
      })
    : null;

  const { title: draftTitle, body } = splitDraft(spot.text);
  const title = draftTitle ?? content?.title ?? null;
  if (!title)
    throw new Error(
      "Could not determine a title (no h1 and no content title).",
    );

  const hero = spot.media?.[0] ?? content?.media?.[0];
  if (!hero?.url) {
    throw new Error(
      "The Dato blog model requires a hero image. Attach media to the spot or the idea's pool first.",
    );
  }

  const description =
    content?.hook?.trim() ??
    body
      .split("\n\n")
      .map((paragraph) => paragraph.trim())
      .find((paragraph) => paragraph && !paragraph.startsWith("#")) ??
    "";

  const structuredText = await markdownToDatoStructuredText(body);

  const authorName = input.authorName?.trim() || "Wander";
  const [itemTypeId, uploadId, adminDomain, authorId] = await Promise.all([
    resolveItemTypeId("blog_article"),
    createUploadFromUrl(hero.url, `${slugify(title)}-hero`),
    resolveAdminDomain(),
    findAuthorIdByName(authorName),
  ]);
  if (!authorId) {
    throw new Error(`No Dato blog author named "${authorName}".`);
  }

  const slug = slugify(title);
  const created = await createDraftItem({
    itemTypeId,
    attributes: {
      title,
      url: slug,
      description,
      body: structuredText,
      image: { upload_id: uploadId },
      author: authorId,
    },
  });

  const plannedPublicUrl = `${BLOG_BASE}/${slug}`;
  const editorUrl = adminDomain
    ? `https://${adminDomain}/editor/item_types/${itemTypeId}/items/${created.id}/edit`
    : null;
  await db
    .update(platformPostTable)
    .set({
      externalId: created.id,
      // The public URL only resolves once a human publishes in Dato; until
      // then wander.com 307s unknown slugs to /blog. The UI offers the
      // editorUrl from metadata as the draft preview surface.
      externalUrl: plannedPublicUrl,
      metadata: {
        ...(spot.metadata ?? {}),
        datocms: {
          itemId: created.id,
          uploadId,
          editorUrl,
          createdAsDraft: true,
          publishedVia: "blog-publish.service",
        },
      },
    })
    .where(eq(platformPostTable.id, spot.id));

  return {
    itemId: created.id,
    slug,
    editorUrl,
    plannedPublicUrl,
  };
}
