import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";

import {
  CLAUDE_MODELS,
  isClaudeConfigured,
} from "@/server/clients/claude.client";
import { isDatoCmsConfigured } from "@/server/clients/datocms.client";
import { BLOG_AGENT_PERSONA } from "./persona";
import { buildBlogTools, type BlogToolTrailEntry } from "./tools";

/**
 * Run the blog sub-agent for one task.
 *
 * The global assistant invokes this through a single `blogAgent` tool rather
 * than carrying eight Dato tools of its own. The bespoke tools exist only for
 * the duration of this call, which keeps the top-level catalog small (the
 * "too many atomic tools" problem in docs/ai-mcp-handoff.md) while still
 * giving the loop room to discover, write, and verify.
 *
 * Every tool call is recorded in `trail`, so the sub-agent's work stays
 * auditable from the outside instead of collapsing into one opaque macro.
 */
export interface BlogAgentResult {
  ok: boolean;
  report: string;
  trail: BlogToolTrailEntry[];
  steps: number;
}

export async function runBlogAgent(input: {
  task: string;
  /** Optional record the task is about, so the agent doesn't have to search. */
  itemId?: string;
}): Promise<BlogAgentResult> {
  if (!isClaudeConfigured) {
    return {
      ok: false,
      report: "The blog agent is not configured (ANTHROPIC_API_KEY).",
      trail: [],
      steps: 0,
    };
  }
  if (!isDatoCmsConfigured) {
    return {
      ok: false,
      report: "DatoCMS is not configured (DATOCMS_CMA_TOKEN).",
      trail: [],
      steps: 0,
    };
  }

  const trail: BlogToolTrailEntry[] = [];
  const tools = buildBlogTools({ trail });

  const prompt = input.itemId
    ? `${input.task}\n\nThe article this concerns: ${input.itemId}`
    : input.task;

  try {
    const result = await generateText({
      model: anthropic(CLAUDE_MODELS.SONNET_5),
      system: BLOG_AGENT_PERSONA,
      prompt,
      tools,
      // Room to discover, act, and verify without running dry mid-task —
      // an agent that stops halfway through a CMS edit is worse than one that
      // takes a few more steps. Still bounded so a confused loop gives up
      // instead of grinding against the production CMS.
      stopWhen: stepCountIs(20),
    });

    return {
      ok: true,
      report: result.text.trim(),
      trail,
      steps: result.steps.length,
    };
  } catch (error) {
    return {
      ok: false,
      report: `The blog agent failed: ${(error as Error).message}`,
      trail,
      steps: 0,
    };
  }
}
