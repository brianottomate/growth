import "server-only";
import { z } from "zod";
import { articleMarkdown } from "@/lib/article-markdown";
import { getCreativeDocument } from "@/server/services/creative-document.service";
import { creativeDocumentSchema } from "@/lib/creative-document";
import {
  articleHistory,
  acceptCurrentArticle,
  readArticleRevision,
  applyArticleRevision,
  dismissArticleCandidate,
} from "@/server/services/article-history.service";
import { growthAction } from "./types";
const id = z.object({ documentId: z.string().min(1) });
const revisionId = id.extend({ revisionId: z.string().min(1) });
const summary = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  status: z.enum(["history", "candidate", "accepted", "dismissed"]),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  runId: z.string().nullable(),
});
const saved = z.object({
  documentId: z.string(),
  revisionId: z.string(),
  applied: z.boolean(),
});
export const articleHistoryAction = growthAction({
  description:
    "List article snapshots and generated candidates in pages of 50. Pass nextCursor as beforeRevisionId for older snapshots. A generated candidate leaves the current draft unchanged until accepted. Read a revision before applying it.",
  inputSchema: id.extend({ beforeRevisionId: z.string().optional() }),
  outputSchema: z.object({
    revisions: z.array(summary),
    nextCursor: z.string().nullable(),
    acceptance: z
      .object({ revisionId: z.string(), acceptedAt: z.string() })
      .nullable(),
  }),
  execute: (input, ctx) =>
    articleHistory(input.documentId, ctx.orgId, input.beforeRevisionId),
});
export const articleRevisionAction = growthAction({
  description:
    "Read one immutable article snapshot for review or recovery, including its brief and editorial findings.",
  inputSchema: revisionId,
  outputSchema: summary.extend({ document: creativeDocumentSchema.options[0] }),
  execute: (input, ctx) =>
    readArticleRevision({ ...input, organizationId: ctx.orgId }),
});
export const acceptArticleAction = growthAction({
  description:
    "Apply a selected reviewed article candidate to the current draft. Preserves the prior draft in history. Retrying an accepted candidate never overwrites later edits. No CMS write or publication.",
  inputSchema: revisionId,
  outputSchema: saved,
  execute: (input, ctx) =>
    applyArticleRevision({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      mode: "accept",
    }),
});
export const restoreArticleAction = growthAction({
  description:
    "Restore one reviewed article snapshot as the working draft. Saves the current draft in history first and preserves its current CMS item identity. Explicitly replaces working copy; no provider call.",
  inputSchema: revisionId,
  outputSchema: saved,
  execute: (input, ctx) =>
    applyArticleRevision({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      mode: "restore",
    }),
});
export const dismissArticleAction = growthAction({
  description:
    "Dismiss a generated article candidate while retaining its snapshot and the current draft.",
  inputSchema: revisionId,
  outputSchema: revisionId,
  execute: (input, ctx) =>
    dismissArticleCandidate({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const acceptCurrentArticleAction = growthAction({
  description:
    "Record editorial acceptance of the saved article the operator reviewed. Pass its complete current document. A changed copy requires a fresh review. Ordinary edits clear current acceptance while its history remains. No publication or CMS write.",
  inputSchema: id.extend({ reviewed: creativeDocumentSchema.options[0] }),
  outputSchema: saved,
  execute: (input, ctx) =>
    acceptCurrentArticle({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const exportArticleAction = growthAction({
  description:
    "Export the saved article as Markdown with title, description, slug and author frontmatter. Returns file contents without publishing or calling a provider.",
  inputSchema: id,
  outputSchema: z.object({ filename: z.string(), markdown: z.string() }),
  execute: async (input, ctx) => {
    const { document } = await getCreativeDocument(input.documentId, ctx.orgId);
    if (document.type !== "article")
      throw new Error("Expected an article document.");
    return articleMarkdown(document);
  },
});
