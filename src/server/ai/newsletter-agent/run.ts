import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";

import {
  CLAUDE_MODELS,
  isClaudeConfigured,
} from "@/server/clients/claude.client";
import { NEWSLETTER_AGENT_PERSONA } from "./persona";
import { buildNewsletterTools, type NewsletterToolTrailEntry } from "./tools";

/**
 * Run the newsletter sub-agent for one task. Same contract as the blog agent:
 * one delegated task, bespoke tools for the duration, a trail of what was
 * actually called. See docs/ai-mcp-handoff.md, "Sub-agents".
 */
export interface NewsletterAgentResult {
  ok: boolean;
  report: string;
  trail: NewsletterToolTrailEntry[];
  steps: number;
}

export async function runNewsletterAgent(input: {
  task: string;
  platformPostId?: string;
  organizationId: string;
  userId: string;
}): Promise<NewsletterAgentResult> {
  if (!isClaudeConfigured) {
    return {
      ok: false,
      report: "The newsletter agent is not configured (ANTHROPIC_API_KEY).",
      trail: [],
      steps: 0,
    };
  }

  const trail: NewsletterToolTrailEntry[] = [];
  const tools = buildNewsletterTools({
    trail,
    organizationId: input.organizationId,
    userId: input.userId,
  });

  const prompt = input.platformPostId
    ? `${input.task}\n\nThe issue this concerns: ${input.platformPostId}`
    : input.task;

  try {
    const result = await generateText({
      model: anthropic(CLAUDE_MODELS.SONNET_5),
      system: NEWSLETTER_AGENT_PERSONA,
      prompt,
      tools,
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
      report: `The newsletter agent failed: ${(error as Error).message}`,
      trail,
      steps: 0,
    };
  }
}
