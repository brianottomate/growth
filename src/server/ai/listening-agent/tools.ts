import "server-only";

import { tool, type ToolSet } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getPlaybook, listPlaybooks } from "@/server/ai/playbooks";
import { db } from "@/server/db";
import { type Mention, mentionTable } from "@/server/db/listening-schema";
import {
  DRAFT_PILLS,
  draftReplyForPost,
  type IntentTag,
  type RedditPostSummary,
} from "@/server/services/reddit-monitor.service";

export interface SparToolContext {
  mentionId: string;
  userId: string;
  /** The already-loaded mention, so tools don't re-fetch it. */
  mention: Mention;
}

/**
 * Tools for the mention-scoped spar agent, closed over the mention + user (so
 * the model never supplies ids). `recordDecision` is the first WRITE tool in the
 * app's agent surfaces — it's `needsApproval`, so the AI SDK gates it behind an
 * in-chat approval card before it touches the mention.
 */
export function buildSparTools(ctx: SparToolContext): ToolSet {
  const m = ctx.mention;

  return {
    readPlaybook: tool({
      description:
        "Fetch the full text of a playbook by id (the index of available playbooks is in the system prompt). Use product-reference playbooks to ground a product claim, and the reddit-engagement playbook for reply methodology — ground, don't recall.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => {
        const p = getPlaybook(id);
        if (!p)
          return {
            error: `Unknown playbook: ${id}. Known: ${listPlaybooks()
              .map((x) => x.id)
              .join(", ")}`,
          };
        return { id: p.id, title: p.title, body: p.body };
      },
    }),

    draftReply: tool({
      description:
        "Draft a Reddit reply to THIS mention. Composes the brand voice + this subreddit's profile + Reddit reply mechanics automatically. Use when the operator wants an actual draft to react to.",
      inputSchema: z.object({
        pills: z
          .array(z.enum(DRAFT_PILLS))
          .optional()
          .describe(
            "Optional style modifiers (e.g. short, no-pitch, focus-wanderos).",
          ),
        customInstructions: z
          .string()
          .optional()
          .describe("Any extra steer for this specific draft."),
      }),
      execute: async ({ pills, customInstructions }) => {
        const post: RedditPostSummary = {
          id: m.externalId ?? m.id,
          subreddit: m.subreddit ?? "",
          title: m.title ?? "",
          body: m.snippet ?? "",
          author: m.author ?? "",
          url: m.url,
          createdUtc: 0,
          ups: 0,
          numComments: 0,
        };
        const draft = await draftReplyForPost({
          post,
          intentTag: (m.intentTag as IntentTag) ?? "operator-pain",
          rationale: m.rationale ?? "",
          pills,
          customInstructions,
        });
        return { draft };
      },
    }),

    recordDecision: tool({
      description:
        "Record the disposition for this mention — 'engaged' (we will/did reply) or 'skipped' (we pass) — with a decisionNote that captures WHY. Writes to the mention. Propose the disposition + reasoning in chat and get the operator's agreement before calling this.",
      inputSchema: z.object({
        status: z.enum(["engaged", "skipped"]),
        decisionNote: z
          .string()
          .min(1)
          .describe(
            "The reasoning behind the disposition — especially important for a pass.",
          ),
        replyUrl: z
          .string()
          .optional()
          .describe("Permalink to our reply, if one was already posted."),
      }),
      needsApproval: true,
      execute: async ({ status, decisionNote, replyUrl }) => {
        const [updated] = await db
          .update(mentionTable)
          .set({
            status,
            decisionNote,
            ...(replyUrl ? { replyUrl } : {}),
            resolvedById: ctx.userId,
            resolvedAt: new Date(),
          })
          .where(eq(mentionTable.id, ctx.mentionId))
          .returning({ id: mentionTable.id, status: mentionTable.status });
        return updated
          ? { ok: true, status, decisionNote }
          : { error: "Mention not found" };
      },
    }),
  };
}
