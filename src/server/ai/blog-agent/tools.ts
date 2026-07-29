import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  buildBlockNode,
  createUploadFromUrl,
  createDraftItem,
  describeModelFields,
  findAuthorIdByName,
  getItem,
  getItemTypeMap,
  resolveAdminDomain,
  resolveItemTypeId,
  updateItemFields,
} from "@/server/clients/datocms.client";
import { getBlogArticleDraft } from "@/server/clients/datocms-cda.client";
import { markdownToDatoStructuredText } from "@/lib/dato-markdown";
import { datoStructuredTextToPlainText } from "@/lib/dato-structured-text";
import { linkDatoBlogArticle } from "@/server/services/dato-blog-link.service";

/**
 * The blog agent's bespoke tools.
 *
 * These are deliberately NOT in the global capability catalog. The handoff doc
 * warns that too many atomic top-level tools make the assistant worse at
 * choosing, and these tools only make sense inside a Dato editing loop. They
 * are exposed on demand — the sub-agent is spawned for a task, uses them, and
 * they disappear again — rather than sitting in `OVERVIEW_TOOLS` forever.
 *
 * Every tool is a discrete, named product action. None of them bundle a
 * decision with a write the way the retired `commitMomentPlan` macro did: the
 * agent's steps stay individually visible in the returned trail.
 */

const BLOG_MODEL = "blog_article";
const PUBLIC_BASE = "https://www.wander.com/article";

export interface BlogToolTrailEntry {
  tool: string;
  summary: string;
}

export interface BlogToolContext {
  /** Appended to as the agent works, so the caller gets a receipt. */
  trail: BlogToolTrailEntry[];
  /** Org the invoking operator belongs to, for scoping brand lookups. */
  organizationId: string;
  /** Dato records written during this run, reconciled before handoff. */
  touchedItemIds: Set<string>;
  /** Operator-owned image attached to the invoking chat turn. */
  attachmentUrl?: string;
}

const note = (ctx: BlogToolContext, toolName: string, summary: string) => {
  ctx.trail.push({ tool: toolName, summary });
};

export function buildBlogTools(ctx: BlogToolContext): ToolSet {
  return {
    describeModel: tool({
      description:
        "List the fields of a DatoCMS model (default: blog_article) with types, required flags, editor hints, and which block models a body accepts. Call this before writing fields you have not written before — the schema changes.",
      inputSchema: z.object({
        model: z
          .string()
          .default(BLOG_MODEL)
          .describe("Model api_key, e.g. blog_article or video_embed."),
      }),
      execute: async ({ model }) => {
        try {
          const spec = await describeModelFields(model);
          note(ctx, "describeModel", `read schema of ${model}`);
          return spec;
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    listModels: tool({
      description:
        "List every model api_key in the DatoCMS project. Use when you do not know what a model is called.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const map = await getItemTypeMap();
          note(ctx, "listModels", `listed ${Object.keys(map).length} models`);
          return { models: Object.values(map).sort() };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    getArticle: tool({
      description:
        "Read one blog article by record id, draft version included, with its body blocks resolved. Always call this before editing an existing article.",
      inputSchema: z.object({ itemId: z.string() }),
      execute: async ({ itemId }) => {
        try {
          const article = await getBlogArticleDraft(itemId);
          if (!article) return { error: `No blog article with id ${itemId}.` };
          note(ctx, "getArticle", `read ${itemId} (${article._status})`);
          return {
            id: article.id,
            title: article.title,
            description: article.description,
            slug: article.url,
            status: article._status,
            heroUrl: article.image?.url ?? null,
            bodyText: article.body
              ? datoStructuredTextToPlainText(article.body.value)
              : "",
            blocks: article.body?.blocks ?? [],
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    uploadAttachment: tool({
      description:
        "Upload the operator's current chat image into DatoCMS and return the exact field value for Dato's image field. Use only when the task explicitly asks to use the attached image. Afterward, pass fieldValue unchanged to updateFields as the article's image value.",
      inputSchema: z.object({
        filename: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("A useful filename for the Dato media library."),
      }),
      execute: async ({ filename }) => {
        if (!ctx.attachmentUrl) {
          return {
            error: "No current chat image was supplied to this blog-agent run.",
          };
        }
        try {
          const uploadId = await createUploadFromUrl(
            ctx.attachmentUrl,
            filename,
          );
          note(ctx, "uploadAttachment", `uploaded chat image as ${uploadId}`);
          return {
            ok: true,
            uploadId,
            fieldValue: { upload_id: uploadId },
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    createDraft: tool({
      description:
        "Create a NEW blog article as a separate Dato draft. Accepts the complete article body as Markdown and can use the current chat upload or reuse the hero image from another article without changing that source article. Use this instead of editing when the operator asks to leave the current draft untouched. Never publishes.",
      inputSchema: z.object({
        title: z.string().trim().min(3).max(300),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and dashes only"),
        description: z.string().trim().min(1),
        authorName: z
          .string()
          .trim()
          .default("Wander")
          .describe("Must match an existing blog_author record."),
        bodyMarkdown: z
          .string()
          .trim()
          .min(1)
          .max(20_000)
          .optional()
          .describe("The complete article body in Markdown."),
        copyHeroFromItemId: z
          .string()
          .trim()
          .optional()
          .describe(
            "An existing Dato article whose hero image should be reused on the new draft. The source article is not changed.",
          ),
        heroUploadId: z
          .string()
          .trim()
          .optional()
          .describe(
            "Dato upload id returned by uploadAttachment when the new draft should use the operator's current chat image.",
          ),
      }),
      execute: async ({
        title,
        slug,
        description,
        authorName,
        bodyMarkdown,
        copyHeroFromItemId,
        heroUploadId,
      }) => {
        try {
          if (copyHeroFromItemId && heroUploadId) {
            return {
              error:
                "Choose either the current chat upload or an existing article hero, not both.",
            };
          }
          const [itemTypeId, authorId] = await Promise.all([
            resolveItemTypeId(BLOG_MODEL),
            findAuthorIdByName(authorName),
          ]);
          if (!authorId) {
            return {
              error: `No Dato blog author named "${authorName}". Pick an existing author.`,
            };
          }
          const [body, sourceItem] = await Promise.all([
            bodyMarkdown
              ? markdownToDatoStructuredText(bodyMarkdown)
              : Promise.resolve(null),
            copyHeroFromItemId
              ? getItem(copyHeroFromItemId)
              : Promise.resolve(null),
          ]);
          const sourceHero =
            (heroUploadId ? { upload_id: heroUploadId } : null) ??
            sourceItem?.attributes.image;
          if (copyHeroFromItemId && !sourceHero) {
            return {
              error: `Article ${copyHeroFromItemId} has no reusable hero image.`,
            };
          }
          const created = await createDraftItem({
            itemTypeId,
            attributes: {
              title,
              url: slug,
              description,
              author: authorId,
              ...(body ? { body } : {}),
              ...(sourceHero ? { image: sourceHero } : {}),
            },
          });
          ctx.touchedItemIds.add(created.id);
          note(ctx, "createDraft", `created draft ${created.id} "${title}"`);
          return {
            ok: true,
            itemId: created.id,
            slug,
            status: "draft",
            hasBody: Boolean(body),
            hasHero: Boolean(sourceHero),
            plannedPublicUrl: `${PUBLIC_BASE}/${slug}`,
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    updateFields: tool({
      description:
        "Patch named metadata fields on an existing article (title, description, slug, image, ...). Only the fields you pass change. Use replaceBody, not this tool, for body content.",
      inputSchema: z.object({
        itemId: z.string(),
        fields: z
          .record(z.string(), z.unknown())
          .describe("Field api_key -> value, e.g. { title: 'New title' }."),
      }),
      execute: async ({ itemId, fields }) => {
        try {
          const keys = Object.keys(fields);
          if (keys.length === 0) return { error: "No fields supplied." };
          if (keys.includes("body")) {
            return {
              error:
                "Use replaceBody for article body content so Markdown is converted safely.",
            };
          }
          await updateItemFields(itemId, fields);
          ctx.touchedItemIds.add(itemId);
          note(ctx, "updateFields", `patched ${keys.join(", ")} on ${itemId}`);
          return { ok: true, itemId, updated: keys };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    replaceBody: tool({
      description:
        "Replace the complete body of an existing Dato DRAFT from Markdown. Use only when the operator explicitly asks to replace or reconcile the full article body, and call getArticle first. Refuses an article whose current Dato status is published.",
      inputSchema: z.object({
        itemId: z.string(),
        bodyMarkdown: z.string().trim().min(1).max(20_000),
      }),
      execute: async ({ itemId, bodyMarkdown }) => {
        try {
          const item = await getItem(itemId);
          if (item.meta.status === "published") {
            return {
              error:
                "This article is published with no draft revision. Create a separate draft instead of replacing its body.",
            };
          }
          const body = await markdownToDatoStructuredText(bodyMarkdown);
          await updateItemFields(itemId, { body });
          ctx.touchedItemIds.add(itemId);
          note(ctx, "replaceBody", `replaced draft body on ${itemId}`);
          return { ok: true, itemId, status: item.meta.status };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    insertBlock: tool({
      description:
        "Append one block to an article's body — for example a video_embed with a YouTube or Cloudflare Stream url. Reads the current body first and appends, so existing content is preserved. Call describeModel on the block model if unsure of its fields.",
      inputSchema: z.object({
        itemId: z.string(),
        blockModel: z
          .string()
          .describe("Block model api_key, e.g. video_embed."),
        attributes: z
          .record(z.string(), z.unknown())
          .describe(
            "Field api_key -> value for the block, e.g. { url: '...' }.",
          ),
      }),
      execute: async ({ itemId, blockModel, attributes }) => {
        try {
          const [item, blockTypeId] = await Promise.all([
            getItem(itemId),
            resolveItemTypeId(blockModel),
          ]);
          const body = item.attributes.body as
            | { schema?: string; document?: { children?: unknown[] } }
            | null
            | undefined;
          const children = body?.document?.children;
          if (!Array.isArray(children)) {
            return {
              error: `Article ${itemId} has no structured-text body to append to.`,
            };
          }
          const nextBody = {
            schema: "dast",
            document: {
              type: "root",
              children: [...children, buildBlockNode(blockTypeId, attributes)],
            },
          };
          await updateItemFields(itemId, { body: nextBody });
          ctx.touchedItemIds.add(itemId);
          note(
            ctx,
            "insertBlock",
            `appended ${blockModel} to ${itemId} (${children.length} -> ${children.length + 1} nodes)`,
          );
          return {
            ok: true,
            itemId,
            blockModel,
            nodesBefore: children.length,
            nodesAfter: children.length + 1,
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    linkToGrowth: tool({
      description:
        "Give a Dato article a home row in Growth: creates (or updates) the blog platform_post that /app/blog and /app/content read, linked by externalId. Call this after createDraft so the article is visible in the app instead of living only in Dato. Idempotent.",
      inputSchema: z.object({
        itemId: z.string(),
        brandName: z
          .string()
          .trim()
          .default("Wander")
          .describe("Which brand owns this article."),
      }),
      execute: async ({ itemId, brandName }) => {
        try {
          const linked = await linkDatoBlogArticle({
            itemId,
            organizationId: ctx.organizationId,
            brandName,
          });
          ctx.touchedItemIds.delete(itemId);
          note(
            ctx,
            "linkToGrowth",
            `${linked.created ? "created" : "updated"} spot ${linked.platformPostId} for ${itemId}`,
          );
          return { ok: true, ...linked };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    previewUrl: tool({
      description:
        "Get the links for an article: the in-app rendered draft preview, the Dato editor, and the planned public URL. Call after writing so your report points somewhere real.",
      inputSchema: z.object({ itemId: z.string() }),
      execute: async ({ itemId }) => {
        try {
          const [article, adminDomain, itemTypeId] = await Promise.all([
            getBlogArticleDraft(itemId),
            resolveAdminDomain(),
            resolveItemTypeId(BLOG_MODEL),
          ]);
          note(ctx, "previewUrl", `links for ${itemId}`);
          return {
            preview: `/app/blog/preview/${itemId}`,
            editorUrl: adminDomain
              ? `https://${adminDomain}/editor/item_types/${itemTypeId}/items/${itemId}/edit`
              : null,
            plannedPublicUrl: article?.url
              ? `${PUBLIC_BASE}/${article.url}`
              : null,
            status: article?._status ?? "unknown",
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    // Stubbed on purpose. The shape is here so the flow is designed and the
    // agent knows publishing exists and is not its call; the body refuses.
    // Enabling it means deleting the refusal and adding a real approval gate,
    // not flipping a boolean in a prompt.
    publishArticle: tool({
      description:
        "Publish an article to wander.com. CURRENTLY DISABLED — publishing is a human decision. Calling this returns a refusal; report the preview link and let a person publish in Dato.",
      inputSchema: z.object({
        itemId: z.string(),
        reason: z
          .string()
          .optional()
          .describe("Why publishing was considered — recorded in the trail."),
      }),
      execute: ({ itemId, reason }) => {
        note(
          ctx,
          "publishArticle",
          `REFUSED publish of ${itemId}${reason ? ` (${reason})` : ""}`,
        );
        return {
          ok: false as const,
          refused: true as const,
          error:
            "Publishing is disabled for the agent. A human publishes in the Dato editor after reviewing the draft preview.",
        };
      },
    }),
  };
}
