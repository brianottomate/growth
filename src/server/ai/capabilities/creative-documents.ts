import "server-only";
import { waitUntil } from "@vercel/functions";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { creativeDocumentSchema } from "@/lib/creative-document";
import { db } from "@/server/db";
import {
  brandTable,
  platformDocumentTable,
  platformPostTable,
  mediaAssetTable,
  productionPacketTable,
} from "@/server/db/schema";
import {
  beginDocumentRun,
  cancelDocumentRun,
  createCreativeDocument,
  getCreativeDocument,
  latestDocumentRun,
  saveCreativeDocument,
  selectCreativeDocument,
} from "@/server/services/creative-document.service";
import { runCreativeWriting } from "@/server/services/creative-writing.service";
import { transferDatoDocument } from "@/server/services/creative-dato.service";
import {
  submitPacketForImageGeneration,
  refreshCreativeRun,
} from "@/server/services/creative-work.service";
import {
  runEmailGenerationJob,
  startEmailGeneration,
} from "@/server/services/email-document.service";
import { growthAction } from "./types";
const idInput = z.object({ documentId: z.string() });
const saved = z.object({ documentId: z.string(), url: z.string() });
const reference = (id: string) => ({
  documentId: id,
  url: `/app/creative/${id}`,
});
export const listCreativeDocuments = growthAction({
  description:
    "List typed creative documents belonging to the workspace, optionally for one content post or brand. These are current briefs and working articles, emails, image directions or video plans.",
  inputSchema: z.object({
    contentPostId: z.string().optional(),
    brandId: z.string().optional(),
  }),
  outputSchema: z.object({
    documents: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        type: z.enum(["article", "email", "image", "video"]),
        contentPostId: z.string().nullable(),
        url: z.string(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const rows = await db
      .select()
      .from(productionPacketTable)
      .where(
        and(
          eq(productionPacketTable.organizationId, ctx.orgId),
          input.contentPostId
            ? eq(productionPacketTable.contentPostId, input.contentPostId)
            : undefined,
          input.brandId
            ? eq(productionPacketTable.brandId, input.brandId)
            : undefined,
        ),
      )
      .orderBy(desc(productionPacketTable.updatedAt))
      .limit(100);
    return {
      documents: rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.documentType,
        contentPostId: r.contentPostId,
        url: reference(r.id).url,
      })),
    };
  },
});
export const readCreativeDocument = growthAction({
  description:
    "Read the full typed creative document and latest production run. Read before editing. Running production locks edits until completion, failure, cancellation or timeout.",
  inputSchema: idInput,
  outputSchema: z.object({
    documentId: z.string(),
    title: z.string(),
    brandId: z.string(),
    contentPostId: z.string().nullable(),
    document: creativeDocumentSchema,
    channels: z.array(
      z.object({ id: z.string(), platform: z.string(), selected: z.boolean() }),
    ),
    assets: z.array(
      z.object({
        id: z.string(),
        title: z.string().nullable(),
        url: z.string().nullable(),
      }),
    ),
    run: z
      .object({
        id: z.string(),
        status: z.enum(["queued", "processing", "ready", "error", "cancelled"]),
        operation: z.string(),
        error: z.string().nullable(),
        candidates: z.array(z.object({ url: z.string() })),
        acceptedMediaAssetId: z.string().nullable(),
      })
      .nullable(),
    url: z.string(),
  }),
  execute: async ({ documentId }, ctx) => {
    const row = await getCreativeDocument(documentId, ctx.orgId);
    let run = await latestDocumentRun(documentId, ctx.orgId);
    if (
      run?.provider === "fal" &&
      ["queued", "processing"].includes(run.status)
    )
      run = await refreshCreativeRun({
        runId: run.id,
        organizationId: ctx.orgId,
      });
    const channels = row.contentPostId
      ? await db
          .select({
            id: platformPostTable.id,
            platform: platformPostTable.platform,
          })
          .from(platformPostTable)
          .where(
            and(
              eq(platformPostTable.contentPostId, row.contentPostId),
              eq(platformPostTable.source, "owned"),
            ),
          )
      : [];
    const selected = await db
      .select()
      .from(platformDocumentTable)
      .where(eq(platformDocumentTable.documentId, row.id));
    const assets = await db
      .select({
        id: mediaAssetTable.id,
        title: mediaAssetTable.title,
        url: mediaAssetTable.url,
      })
      .from(mediaAssetTable)
      .where(
        and(
          eq(mediaAssetTable.brandId, row.brandId),
          eq(mediaAssetTable.kind, "image"),
          eq(mediaAssetTable.status, "ready"),
          isNull(mediaAssetTable.deletedAt),
        ),
      )
      .limit(100);
    return {
      ...reference(row.id),
      title: row.title,
      brandId: row.brandId,
      contentPostId: row.contentPostId,
      document: row.document,
      channels: channels.map((c) => ({
        id: c.id,
        platform: String(c.platform),
        selected: selected.some((s) => s.platformPostId === c.id),
      })),
      assets,
      run: run
        ? {
            id: run.id,
            status: run.status,
            operation: run.operation,
            error: run.error,
            candidates: run.candidates.map((c) => ({ url: c.url })),
            acceptedMediaAssetId: run.acceptedMediaAssetId,
          }
        : null,
    };
  },
});
export const createCreativeDocumentAction = growthAction({
  description:
    "Create a typed article, email, image or video document with an editable brief and current content. For initiative work, first create a content idea and link it to the initiative; pass its contentPostId here. No generation or external write occurs.",
  inputSchema: z.object({
    brandId: z.string(),
    contentPostId: z.string().optional(),
    title: z.string().min(1),
    document: creativeDocumentSchema,
  }),
  outputSchema: saved,
  execute: async (input, ctx) =>
    reference(
      (
        await createCreativeDocument({
          ...input,
          organizationId: ctx.orgId,
          userId: ctx.userId,
        })
      ).id,
    ),
});
export const saveCreativeDocumentAction = growthAction({
  description:
    "Replace the current typed creative document. Keep its type and preserve any fields not intentionally changed. Blocked while a production run is active. No revision history is created.",
  inputSchema: idInput.extend({ document: creativeDocumentSchema }),
  outputSchema: saved,
  execute: async (input, ctx) => {
    await saveCreativeDocument({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    return reference(input.documentId);
  },
});
export const selectCreativeDocumentAction = growthAction({
  description:
    "Select a creative document for one platform post under the same content idea. Does not publish or send.",
  inputSchema: idInput.extend({ platformPostId: z.string() }),
  outputSchema: z.object({
    documentId: z.string(),
    platformPostId: z.string(),
  }),
  execute: (input, ctx) =>
    selectCreativeDocument({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});
export const produceCreativeDocument = growthAction({
  description:
    "Produce from a saved creative brief. Articles use the shared lab storyboard, writer, revision and editorial checks. Emails use the email writer; images use the existing image adapter; videos produce a script and scene plan, not rendered footage. One run at a time, with editing locked. Poll creativeRead.get for completion.",
  inputSchema: idInput,
  outputSchema: z.object({ runId: z.string(), url: z.string() }),
  execute: async ({ documentId }, ctx) => {
    const row = await getCreativeDocument(documentId, ctx.orgId);
    const identity = { organizationId: ctx.orgId, userId: ctx.userId };
    if (row.document.type === "image") {
      const run = await submitPacketForImageGeneration({
        packetId: documentId,
        ...identity,
      });
      return { runId: run.id, url: reference(documentId).url };
    }
    if (row.document.type === "email") {
      const link = await db.query.platformDocumentTable.findFirst({
        where: eq(platformDocumentTable.documentId, documentId),
      });
      if (!link)
        throw new Error(
          "Select this email on a newsletter channel version before generating.",
        );
      const run = await startEmailGeneration({
        ...identity,
        platformPostId: link.platformPostId,
      });
      waitUntil(runEmailGenerationJob(run.id).catch(() => undefined));
      return { runId: run.id, url: reference(documentId).url };
    }
    const brand = await db.query.brandTable.findFirst({
      where: eq(brandTable.id, row.brandId),
    });
    const run = await beginDocumentRun({
      ...identity,
      documentId,
      operation: "write",
      provider: "anthropic",
      model: "claude-sonnet-5",
      extra: {
        brandName: brand?.name,
        brandVoice: brand?.brandFingerprint?.fingerprintText,
      },
    });
    waitUntil(runCreativeWriting(run.id).catch(() => undefined));
    return { runId: run.id, url: reference(documentId).url };
  },
});
export const cancelCreativeDocumentRun = growthAction({
  description:
    "Cancel local document production, release editing, and ignore late results. A provider already running may still finish and charge. Dato transfers cannot be cancelled after dispatch.",
  inputSchema: z.object({ runId: z.string() }),
  outputSchema: z.object({ cancelled: z.boolean() }),
  execute: (input, ctx) => cancelDocumentRun(input.runId, ctx.orgId),
});
export const pullCreativeDato = growthAction({
  description:
    "Explicitly pull a Wander.com Dato article into this local article document, overwriting local content. No conflict detection or merge. Does not publish.",
  inputSchema: idInput.extend({ itemId: z.string().optional() }),
  outputSchema: z.object({
    documentId: z.string(),
    itemId: z.string(),
    published: z.boolean(),
  }),
  execute: (input, ctx) =>
    transferDatoDocument({
      ...input,
      direction: "pull",
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});
export const pushCreativeDato = growthAction({
  description:
    "Explicitly push this article to Wander.com Dato as draft content, overwriting the CMS draft or creating a new draft. Requires a hero for new articles. Never publishes.",
  inputSchema: idInput,
  outputSchema: z.object({
    documentId: z.string(),
    itemId: z.string(),
    published: z.boolean(),
  }),
  execute: (input, ctx) =>
    transferDatoDocument({
      ...input,
      direction: "push",
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});
