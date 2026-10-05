import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  markdownToDatoStructuredText,
  prepareDatoMarkdown,
} from "@/lib/dato-markdown";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import {
  buildBlockNode,
  createUploadFromUrl,
  resolveItemTypeId,
} from "@/server/clients/datocms.client";

/** Existing Wander.com blocks only. No CMS schema or website deployment required. */
export async function buildDatoArticleBody(markdown: string, brandId: string) {
  const { blocks } = await prepareDatoMarkdown(markdown);
  const urls = [
    ...new Set(blocks.flatMap((b) => (b.kind === "image" ? [b.url] : []))),
  ];
  const assets = urls.length
    ? await db
        .select({ url: mediaAssetTable.url })
        .from(mediaAssetTable)
        .where(
          and(
            eq(mediaAssetTable.brandId, brandId),
            eq(mediaAssetTable.kind, "image"),
            eq(mediaAssetTable.status, "ready"),
            isNull(mediaAssetTable.deletedAt),
            inArray(mediaAssetTable.url, urls),
          ),
        )
    : [];
  if (urls.some((url) => !assets.some((asset) => asset.url === url)))
    throw new Error(
      "Inline blog images must use ready images from this brand's media library. Replace the image URL before pushing.",
    );
  const tableType = blocks.some((b) => b.kind === "table")
    ? await resolveItemTypeId("table")
    : null;
  const imageType = urls.length ? await resolveItemTypeId("blog_image") : null;
  const uploads = new Map<string, string>();
  return markdownToDatoStructuredText(markdown, {
    resolveBlock: async (block) => {
      if (block.kind === "table")
        return buildBlockNode(tableType!, {
          table: JSON.stringify({ columns: block.columns, data: block.data }),
        });
      let id = uploads.get(block.url);
      if (!id) {
        id = await createUploadFromUrl(block.url);
        uploads.set(block.url, id);
      }
      return buildBlockNode(imageType!, {
        image: { upload_id: id, alt: block.alt },
      });
    },
  });
}
