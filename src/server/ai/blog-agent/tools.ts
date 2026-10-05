import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  describeModelFields,
  getItem,
  getItemTypeMap,
  resolveAdminDomain,
  resolveItemTypeId,
} from "@/server/clients/datocms.client";
import { getBlogArticleDraft } from "@/server/clients/datocms-cda.client";
import { datoStructuredTextToPlainText } from "@/lib/dato-structured-text";

/** Dato inspection only. Authoring and transfers use shared creative documents. */

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
  contentPostId?: string;
  /** Dato records written during this run, reconciled before handoff. */
  touchedItemIds: Set<string>;
  /** Operator-owned image attached to the invoking chat turn. */
  attachmentUrl?: string;
}

const note = (ctx: BlogToolContext, toolName: string, summary: string) => {
  ctx.trail.push({ tool: toolName, summary });
};

/**
 * Body reads/writes for the positional tools.
 *
 * `getItem` asks Dato for `nested=true`, so a block node arrives as its full
 * object and can be written straight back — which is why the positional tools
 * move nodes VERBATIM and never rebuild them. Rebuilding a block is how you
 * lose its identity and its fields; `buildBlockNode` is for blocks that do not
 * exist yet, not for ones already in the document.
 */
async function readBody(itemId: string) {
  const item = await getItem(itemId);
  const body = item.attributes.body as
    | { schema?: string; document?: { children?: unknown[] } }
    | null
    | undefined;
  const children = body?.document?.children;
  return { item, children: Array.isArray(children) ? children : null };
}

const nodeType = (node: unknown): string => {
  const type = (node as { type?: unknown } | null)?.type;
  return typeof type === "string" ? type : "unknown";
};

const NODE_PREVIEW_CHARS = 140;

/** One addressable top-level node, as the agent sees it in an outline. */
function describeNode(
  node: unknown,
  index: number,
  itemTypeMap: Record<string, string>,
) {
  const record = (node ?? {}) as Record<string, unknown>;
  const type = nodeType(node);
  if (type === "block") {
    const item = record.item as
      | { relationships?: { item_type?: { data?: { id?: string } } } }
      | string
      | undefined;
    const typeId =
      typeof item === "object"
        ? item?.relationships?.item_type?.data?.id
        : undefined;
    return {
      index,
      type,
      blockModel: (typeId && itemTypeMap[typeId]) || null,
    };
  }
  return {
    index,
    type,
    ...(typeof record.level === "number" ? { level: record.level } : {}),
    preview: datoStructuredTextToPlainText(record).slice(0, NODE_PREVIEW_CHARS),
  };
}

export function buildBlogTools(ctx: BlogToolContext): ToolSet {
  const tools = {
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

    outlineBody: tool({
      description:
        "List an article body's top-level nodes with their POSITIONS: index, type (paragraph / heading / block / list / …), the block model for block nodes, and a text preview. Indexes are how you address a place in the document — getArticle returns flattened text and gives you none. Use this to inspect the structure before pulling it into a creative document.",
      inputSchema: z.object({ itemId: z.string() }),
      execute: async ({ itemId }) => {
        try {
          const [{ children }, itemTypeMap] = await Promise.all([
            readBody(itemId),
            getItemTypeMap(),
          ]);
          if (!children) {
            return { error: `Article ${itemId} has no structured-text body.` };
          }
          note(
            ctx,
            "outlineBody",
            `outlined ${children.length} nodes of ${itemId}`,
          );
          return {
            itemId,
            nodeCount: children.length,
            nodes: children.map((node, index) =>
              describeNode(node, index, itemTypeMap),
            ),
          };
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
  };
  return tools;
}
