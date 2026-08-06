import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  EMAIL_DOCUMENT_FORMATS,
  emailDocumentDraftSchema,
} from "@/lib/email-document";
import {
  createEmailSlot,
  getEmailWorkspace,
  saveEmailDocument,
} from "@/server/services/email-document.service";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * The newsletter agent's bespoke tools.
 *
 * Same shape as the blog agent (see docs/ai-mcp-handoff.md, "Sub-agents"):
 * kept out of the global catalog because writing an issue is an iterative
 * loop, exposed only for the length of one delegated task, and every call is
 * recorded in the trail so delegation does not hide the writes.
 *
 * These wrap the SAME product services the newsletter UI uses
 * (email-document.service), so the agent is another caller of the product,
 * not a private path into the database.
 *
 * Customer.io is deliberately absent. Delivery stays a human action in the
 * product; `sendIssue` is stubbed to refuse so the boundary is explicit.
 */

export interface NewsletterToolTrailEntry {
  tool: string;
  summary: string;
}

export interface NewsletterToolContext {
  trail: NewsletterToolTrailEntry[];
  organizationId: string;
  userId: string;
}

const note = (
  ctx: NewsletterToolContext,
  toolName: string,
  summary: string,
) => {
  ctx.trail.push({ tool: toolName, summary });
};

export function buildNewsletterTools(ctx: NewsletterToolContext): ToolSet {
  return {
    listBrands: tool({
      description:
        "List the brands in this organization, with ids. Use when you need a brandId to create an issue.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const brands = await db.query.brandTable.findMany({
            where: eq(brandTable.organizationId, ctx.organizationId),
            columns: { id: true, name: true },
          });
          note(ctx, "listBrands", `listed ${brands.length} brands`);
          return { brands };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    getIssue: tool({
      description:
        "Read one newsletter issue: its current subject, preheader, body markdown, CTA, and revision history. Always call before editing an existing issue.",
      inputSchema: z.object({
        platformPostId: z
          .string()
          .describe("The newsletter spot id (a platform_post)."),
      }),
      execute: async ({ platformPostId }) => {
        try {
          const workspace = await getEmailWorkspace({
            platformPostId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
          });
          note(ctx, "getIssue", `read ${platformPostId}`);
          const d = workspace.document;
          return {
            platformPostId,
            subject: d.subject,
            preheader: d.preheader,
            bodyMarkdown: d.bodyMarkdown,
            ctaLabel: d.ctaLabel,
            ctaUrl: d.ctaUrl,
            templateKey: d.templateKey,
            revision: d.currentRevision,
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    createIssue: tool({
      description:
        "Create a NEW newsletter issue: makes the spot and its document so it appears in /app/newsletters. Returns the platformPostId to edit afterwards. Never sends.",
      inputSchema: z.object({
        brandId: z.string().describe("From listBrands."),
        title: z.string().trim().min(3).max(200),
        format: z.enum(EMAIL_DOCUMENT_FORMATS).default("newsletter.broadcast"),
        hook: z.string().trim().optional(),
        purpose: z.string().trim().optional(),
      }),
      execute: async (input) => {
        try {
          const created = await createEmailSlot({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            brandId: input.brandId,
            title: input.title,
            format: input.format,
            hook: input.hook,
            purpose: input.purpose,
          });
          const spotId =
            (created as { platformPostId?: string; id?: string })
              .platformPostId ??
            (created as { id?: string }).id ??
            "";
          note(ctx, "createIssue", `created issue ${spotId} "${input.title}"`);
          return {
            ok: true,
            platformPostId: spotId,
            url: `/app/newsletters/${spotId}`,
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    saveIssue: tool({
      description:
        "Save changed fields to an issue's document and create a revision checkpoint. Pass only what changed — unspecified fields keep their current value. Read the issue first.",
      inputSchema: z.object({
        platformPostId: z.string(),
        changes: emailDocumentDraftSchema.partial(),
        note: z.string().trim().max(300).optional(),
      }),
      execute: async ({ platformPostId, changes, note: saveNote }) => {
        try {
          const keys = Object.keys(changes);
          if (keys.length === 0) return { error: "No changes supplied." };
          const workspace = await getEmailWorkspace({
            platformPostId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
          });
          const d = workspace.document;
          // Merge onto the CURRENT document so a partial edit never silently
          // drops sections the operator already wrote.
          const draft = emailDocumentDraftSchema.parse({
            subject: d.subject,
            preheader: d.preheader,
            bodyMarkdown: d.bodyMarkdown,
            ctaLabel: d.ctaLabel,
            ctaUrl: d.ctaUrl,
            templateKey: d.templateKey,
            handoffTargetRepo: d.handoffTargetRepo,
            productUpdate: d.productUpdate,
            ...changes,
          });
          const saved = await saveEmailDocument({
            platformPostId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            draft,
            note: saveNote ?? "Saved by the newsletter agent",
          });
          note(
            ctx,
            "saveIssue",
            `saved ${keys.join(", ")} on ${platformPostId} (rev ${saved.currentRevision})`,
          );
          return {
            ok: true,
            platformPostId,
            updated: keys,
            revision: saved.currentRevision,
          };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),

    previewUrl: tool({
      description:
        "Where a human can see this issue in Growth. Call after writing so your report points somewhere real.",
      inputSchema: z.object({ platformPostId: z.string() }),
      execute: ({ platformPostId }) => {
        note(ctx, "previewUrl", `link for ${platformPostId}`);
        return { workspace: `/app/newsletters/${platformPostId}` };
      },
    }),

    // Stubbed like the blog agent's publishArticle: the shape is designed so
    // the flow is understood and the agent knows sending is not its call.
    // Enabling it means wiring Customer.io delivery behind a real approval
    // gate, not editing this prompt. See "Newsletter delivery" in
    // docs/ai-mcp-handoff.md.
    sendIssue: tool({
      description:
        "Send or schedule a newsletter issue. CURRENTLY DISABLED — delivery is a human action. Calling this returns a refusal; report the workspace link instead.",
      inputSchema: z.object({
        platformPostId: z.string(),
        reason: z.string().optional(),
      }),
      execute: ({ platformPostId, reason }) => {
        note(
          ctx,
          "sendIssue",
          `REFUSED send of ${platformPostId}${reason ? ` (${reason})` : ""}`,
        );
        return {
          ok: false as const,
          refused: true as const,
          error:
            "Sending is disabled for the agent. A human reviews the issue and delivers it from the product.",
        };
      },
    }),
  };
}
