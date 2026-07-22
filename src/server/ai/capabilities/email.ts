import "server-only";

import { waitUntil } from "@vercel/functions";
import { z } from "zod";

import {
  EMAIL_DOCUMENT_FORMATS,
  emailDocumentDraftSchema,
  productUpdateEmailDraftSchema,
} from "@/lib/email-document";
import {
  createEmailSlot as createEmailSlotService,
  createProductUpdateDraft as createProductUpdateDraftService,
  getEmailWorkspace,
  runEmailGenerationJob,
  saveEmailDocument,
  startEmailGeneration,
} from "@/server/services/email-document.service";
import { growthAction } from "./types";

export const getEmailDraft = growthAction({
  description:
    "Read the canonical subject, Markdown body, CTA, revisions, planning context, and latest generation job for one owned newsletter issue or blast. Use this when the conversation is about a specific email slot; do not treat platform_post.text as the email body.",
  inputSchema: z.object({ platformPostId: z.string() }),
  execute: async ({ platformPostId }, ctx) => {
    const workspace = await getEmailWorkspace({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    return {
      ...workspace,
      url: `/app/newsletters/${platformPostId}`,
    };
  },
});

export const createEmailSlot = growthAction({
  description:
    "Create one empty newsletter issue or one-off blast as a Growth content-calendar slot after the operator has chosen the premise and timing. This deliberately does not generate the full email; generation happens only for an individually selected slot.",
  inputSchema: z.object({
    brandId: z.string(),
    title: z.string().trim().min(1).max(160),
    format: z.enum(EMAIL_DOCUMENT_FORMATS),
    hook: z.string().trim().max(2_000).optional(),
    purpose: z.string().trim().max(5_000).optional(),
    ctaText: z.string().trim().max(1_000).optional(),
    pillar: z.string().trim().max(120).optional(),
    seriesId: z.string().optional(),
    initiativeId: z.string().optional(),
    plannedAt: z
      .string()
      .datetime()
      .optional()
      .describe(
        "Growth content-calendar time, never the operator's private calendar.",
      ),
  }),
  execute: async (input, ctx) =>
    createEmailSlotService({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const updateEmailDraft = growthAction({
  description:
    "Save an agreed conversational refinement to one email's canonical document and create a revision checkpoint. Pass only the fields that changed.",
  inputSchema: z.object({
    platformPostId: z.string(),
    changes: emailDocumentDraftSchema.partial(),
    note: z.string().trim().max(300).optional(),
  }),
  execute: async ({ platformPostId, changes, note }, ctx) => {
    const workspace = await getEmailWorkspace({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    const document = emailDocumentDraftSchema.parse({
      subject: workspace.document.subject,
      preheader: workspace.document.preheader,
      bodyMarkdown: workspace.document.bodyMarkdown,
      ctaLabel: workspace.document.ctaLabel,
      ctaUrl: workspace.document.ctaUrl,
      templateKey: workspace.document.templateKey,
      handoffTargetRepo: workspace.document.handoffTargetRepo,
      productUpdate: workspace.document.productUpdate,
      ...changes,
    });
    const saved = await saveEmailDocument({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      draft: document,
      note: note ?? "Saved from the Growth conversation",
    });
    return {
      ok: true as const,
      revision: saved.currentRevision,
      url: `/app/newsletters/${platformPostId}`,
    };
  },
});

export const createProductUpdateDraft = growthAction({
  description:
    "Create one finished, previewable product-update email from verified repository evidence. Each claim must cite an exact repository and commit or pull-request ref. Use this after inspecting the relevant product repositories locally; omit internal-only changes. Creates a frozen Growth revision but never resolves recipients or sends.",
  inputSchema: z.object({
    brandId: z.string(),
    title: z.string().trim().min(1).max(160),
    format: z.enum(EMAIL_DOCUMENT_FORMATS).default("newsletter.broadcast"),
    plannedAt: z.string().datetime().optional(),
    purpose: z.string().trim().max(5_000).optional(),
    hook: z.string().trim().max(2_000).optional(),
    pillar: z.string().trim().max(120).optional(),
    draft: productUpdateEmailDraftSchema,
  }),
  execute: async (input, ctx) =>
    createProductUpdateDraftService({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const generateEmailDraft = growthAction({
  description:
    "Start one deliberate AI draft or refinement job for the selected newsletter issue or blast. Never use this to batch-write a bank of slots. The job uses the slot brief, brand voice, current draft, and optional refinement instruction.",
  inputSchema: z.object({
    platformPostId: z.string(),
    brief: z.string().trim().max(10_000).optional(),
  }),
  execute: async (input, ctx) => {
    const job = await startEmailGeneration({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    if (job.status === "queued") {
      waitUntil(
        runEmailGenerationJob(job.id).catch((error) =>
          console.error("[email-generation] chat job failed", error),
        ),
      );
    }
    return {
      jobId: job.id,
      status: job.status,
      url: `/app/newsletters/${input.platformPostId}`,
    };
  },
});

export const EMAIL_TOOLS = {
  getEmailDraft,
  createEmailSlot,
  createProductUpdateDraft,
  updateEmailDraft,
  generateEmailDraft,
} as const;
