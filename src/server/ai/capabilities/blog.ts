import "server-only";

import { z } from "zod";

import { runBlogAgent } from "@/server/ai/blog-agent/run";
import { growthTool } from "./types";

/**
 * The blog agent's single door into the global catalog.
 *
 * Growth's other domains expose read/write pairs whose actions are direct
 * product handlers. The blog is different: editing a CMS record is an
 * iterative loop — discover the schema, read the record, write, look at the
 * result, correct. Modelling that as eight top-level tools would bloat the
 * catalog for a job the assistant does occasionally; modelling it as one
 * do-everything action would repeat the `commitMomentPlan` mistake of hiding
 * which writes ran.
 *
 * So this tool delegates to a sub-agent that owns bespoke Dato tools for the
 * duration of one task, and returns the trail of what it actually called.
 */
export const blogAgent = growthTool({
  description:
    "Delegate a wander.com blog task to the DatoCMS blog agent. It can inspect the blog schema, read an article, create a draft, patch fields, and append body blocks such as a video embed, then report back with a preview link. Use for any 'create/edit/add to the blog' request. It works in DRAFTS only — it cannot publish. Give it a complete task description in one go, plus the article id when the task concerns an existing post.",
  inputSchema: z.object({
    action: z.literal("run"),
    task: z
      .string()
      .trim()
      .min(10)
      .max(4000)
      .describe(
        "The full task, in plain language. Include the intent and any copy the operator supplied.",
      ),
    itemId: z
      .string()
      .trim()
      .optional()
      .describe("DatoCMS record id, when the task concerns an existing article."),
  }),
  execute: async (input) => {
    const result = await runBlogAgent({
      task: input.task,
      itemId: input.itemId,
    });
    return {
      ok: result.ok,
      action: input.action,
      data: {
        report: result.report,
        // The individual writes stay visible to the caller and to receipts,
        // rather than disappearing inside the delegation.
        trail: result.trail,
        steps: result.steps,
      },
    };
  },
});
