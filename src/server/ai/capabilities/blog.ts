import { blogAgentOutputSchema } from "./outputs/blog";
import "server-only";

import { z } from "zod";

import { isOwnedChatImageUrl } from "@/lib/chat-attachment";
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
  resultSchema: blogAgentOutputSchema,
  description:
    "Inspect Wander.com Dato blog schemas, existing articles and rich body blocks. This specialist is read-only. For writing and editing use creativeRead/creativeWrite: create or pull an article document, save its brief, produce, review, and explicitly push the draft.",
  inputSchema: z.object({
    action: z.literal("run"),
    task: z
      .string()
      .trim()
      .min(10)
      .max(20_000)
      .describe(
        "The full task, in plain language. Include the intent and any copy the operator supplied.",
      ),
    itemId: z
      .string()
      .trim()
      .optional()
      .describe(
        "DatoCMS record id, when the task concerns an existing article.",
      ),
    attachmentUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "The exact owned chat-attachment URL when the operator explicitly asks to use the pasted image on the article.",
      ),
  }),
  execute: async (input, ctx) => {
    if (
      input.attachmentUrl &&
      !isOwnedChatImageUrl(input.attachmentUrl, ctx.userId)
    ) {
      throw new Error(
        "That image is not an owned attachment from this operator's chat.",
      );
    }
    const result = await runBlogAgent({
      task: input.task,
      itemId: input.itemId,
      attachmentUrl: input.attachmentUrl,
      organizationId: ctx.orgId,
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
