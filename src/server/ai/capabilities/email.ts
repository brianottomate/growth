import "server-only";

import { waitUntil } from "@vercel/functions";
import { z } from "zod";

import {
  EMAIL_DOCUMENT_FORMATS,
  emailDocumentDraftSchema,
} from "@/lib/email-document";
import {
  createEmailSlot as createEmailSlotService,
  getEmailWorkspace,
  runEmailGenerationJob,
  saveEmailDocument,
  startEmailGeneration,
} from "@/server/services/email-document.service";
import { defineCapability } from "./types";

export const getEmailDraft = defineCapability({
  name: "getEmailDraft",
  description:
    "Read the canonical subject, Markdown body, CTA, revisions, planning context, and latest generation job for one owned newsletter issue or blast. Use this when the conversation is about a specific email slot; do not treat platform_post.text as the email body.",
  inputSchema: z.object({ platformPostId: z.string() }),
  readOnly: true,
  domain: "content",
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

export const createEmailSlot = defineCapability({
  name: "createEmailSlot",
  description:
    "Create one empty newsletter issue or one-off blast as a Wander Growth content-calendar slot. Use after the operator has chosen the premise and timing. This deliberately does not generate the full email; generation happens only for an individually selected slot. Requires approval.",
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
        "Wander Growth content-calendar time, never the operator's private calendar.",
      ),
  }),
  readOnly: false,
  domain: "content",
  execute: async (input, ctx) =>
    createEmailSlotService({
      ...input,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    }),
});

export const updateEmailDraft = defineCapability({
  name: "updateEmailDraft",
  description:
    "Save an approved conversational refinement to one email's canonical document and create a revision checkpoint. Pass only the fields that changed. Requires approval.",
  inputSchema: z.object({
    platformPostId: z.string(),
    changes: emailDocumentDraftSchema.partial(),
    note: z.string().trim().max(300).optional(),
  }),
  readOnly: false,
  domain: "content",
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
      ...changes,
    });
    const saved = await saveEmailDocument({
      platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      draft: document,
      note: note ?? "Saved from the Wander Growth conversation",
    });
    return {
      ok: true as const,
      revision: saved.currentRevision,
      url: `/app/newsletters/${platformPostId}`,
    };
  },
});

export const generateEmailDraft = defineCapability({
  name: "generateEmailDraft",
  description:
    "Start one deliberate AI draft or refinement job for the selected newsletter issue or blast. Never use this to batch-write a bank of slots. The job uses the slot brief, brand voice, current draft, and optional refinement instruction. Requires approval.",
  inputSchema: z.object({
    platformPostId: z.string(),
    brief: z.string().trim().max(10_000).optional(),
  }),
  readOnly: false,
  domain: "content",
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

export const EMAIL_CAPABILITIES = [
  getEmailDraft,
  createEmailSlot,
  updateEmailDraft,
  generateEmailDraft,
] as const;
