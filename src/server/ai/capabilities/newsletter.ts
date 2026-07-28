import "server-only";

import { z } from "zod";

import { runNewsletterAgent } from "@/server/ai/newsletter-agent/run";
import { growthTool } from "./types";

/**
 * The newsletter agent's single door into the global catalog — the same shape
 * as `blogAgent`. See docs/ai-mcp-handoff.md, "Sub-agents".
 *
 * `emailRead` / `emailWrite` stay as they are: they are the right surface for
 * a single known action ("save this change to this draft"). This tool is for
 * the multi-step case — read the issue, restructure it, save, check — where
 * the assistant would otherwise have to drive four tools itself.
 */
export const newsletterAgent = growthTool({
  description:
    "Delegate a newsletter task to the newsletter agent. It can read an issue, create a new one, rewrite subject/preheader/body/CTA, and save revisions, then report where to review it. Use for multi-step newsletter work; for a single known edit to a known draft, emailWrite is more direct. It works in DRAFTS only — it cannot send or schedule.",
  inputSchema: z.object({
    action: z.literal("run"),
    task: z
      .string()
      .trim()
      .min(10)
      .max(4000)
      .describe("The full task in plain language, including any supplied copy."),
    platformPostId: z
      .string()
      .trim()
      .optional()
      .describe("The newsletter spot id, when the task concerns an existing issue."),
  }),
  execute: async (input, ctx) => {
    const result = await runNewsletterAgent({
      task: input.task,
      platformPostId: input.platformPostId,
      organizationId: ctx.orgId,
      userId: ctx.userId,
    });
    return {
      ok: result.ok,
      action: input.action,
      data: {
        report: result.report,
        trail: result.trail,
        steps: result.steps,
      },
    };
  },
});
