import "server-only";
import {
  resolveAdminDomain,
  resolveItemTypeId,
} from "@/server/clients/datocms.client";
import { documentForPlatform } from "./creative-document.service";
import { transferDatoDocument } from "./creative-dato.service";

/** The content-card shortcut uses the same current document and transfer lock. */
export async function publishBlogDraft(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
}) {
  const row = await documentForPlatform(
    input.platformPostId,
    input.organizationId,
  );
  if (row?.document.type !== "article")
    throw new Error(
      "Create an article document and select it for this blog channel version first.",
    );
  const result = await transferDatoDocument({
    documentId: row.id,
    organizationId: input.organizationId,
    userId: input.userId,
    direction: "push",
  });
  const domain = await resolveAdminDomain();
  const modelId = await resolveItemTypeId("blog_article");
  return {
    itemId: result.itemId,
    slug: row.document.content.slug,
    editorUrl: domain
      ? `https://${domain}/editor/item_types/${modelId}/items/${result.itemId}/edit`
      : null,
    plannedPublicUrl: `https://www.wander.com/article/${row.document.content.slug}`,
  };
}
