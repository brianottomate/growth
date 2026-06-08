import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { z } from "zod";

/**
 * Shared triage engine. Every inbound surface (DMs, Reddit, X, …) scores a batch
 * of items for relevance/intent and drafts replies the same way — only the
 * prompts, intent taxonomy, and item shape differ. Those source-specific bits
 * live in a {@link ScoringChannel} / {@link DraftChannel} config; the LLM
 * plumbing (model choice, structured output, id-mapping, sort, pill modifiers)
 * lives here, once.
 *
 * Stateless by design for now — nothing is persisted. We want to settle the
 * structure before adding a triage store / feedback loop.
 */

// Centralized model knobs — bump in one place.
export const TRIAGE_SCORING_MODEL = anthropic("claude-sonnet-4-6");
export const TRIAGE_DRAFT_MODEL = anthropic("claude-opus-4-7");

export const SUGGESTED_ACTIONS = ["engage", "monitor", "skip"] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

const SUGGESTED_ACTION_DESCRIPTION =
  "engage = act today. monitor = revisit / low urgency. skip = ignore.";

const DEFAULT_RELEVANCE_DESCRIPTION =
  "0 = noise/off-topic. 5 = adjacent or ambiguous. 8+ = clear, high-value engagement opportunity.";

// ---- Scoring -----------------------------------------------------------------

export interface ScoringChannel<TItem, TIntent extends string> {
  /** Item taxonomy — the per-source set of intent tags. */
  intentTags: readonly [TIntent, ...TIntent[]];
  systemPrompt: string;
  /** Stable id for an item, used to map LLM output back to the source object. */
  getId: (item: TItem) => string;
  /** Render one item as a block in the scoring prompt. */
  formatItem: (item: TItem) => string;
  /** Override the relevance / intent-tag field descriptions if useful. */
  relevanceDescription?: string;
  intentTagDescription?: string;
}

export interface ScoredItem<TItem, TIntent extends string> {
  item: TItem;
  relevance: number;
  intentTag: TIntent;
  suggestedAction: SuggestedAction;
  rationale: string;
}

/**
 * Score a batch of items in a single structured-output call, then map the
 * results back onto the source items and sort by relevance (desc). Entries the
 * model invents (unknown id) are dropped.
 */
export async function scoreItems<TItem, TIntent extends string>(
  channel: ScoringChannel<TItem, TIntent>,
  items: TItem[],
): Promise<{ scored: ScoredItem<TItem, TIntent>[]; total: number }> {
  if (items.length === 0) return { scored: [], total: 0 };

  const { output } = await generateText({
    model: TRIAGE_SCORING_MODEL,
    system: channel.systemPrompt,
    prompt: `Score each item below. Return one entry per item, using its id verbatim.\n\n${items
      .map(channel.formatItem)
      .join("\n---\n")}`,
    output: Output.array({
      element: z.object({
        id: z
          .string()
          .describe("The item's id field, verbatim from the input."),
        relevance: z
          .number()
          .int()
          .min(0)
          .max(10)
          .describe(channel.relevanceDescription ?? DEFAULT_RELEVANCE_DESCRIPTION),
        intentTag: channel.intentTagDescription
          ? z.enum(channel.intentTags).describe(channel.intentTagDescription)
          : z.enum(channel.intentTags),
        suggestedAction: z
          .enum(SUGGESTED_ACTIONS)
          .describe(SUGGESTED_ACTION_DESCRIPTION),
        rationale: z
          .string()
          .describe("One concise sentence justifying the score."),
      }),
    }),
  });

  const byId = new Map(items.map((it) => [channel.getId(it), it] as const));
  const scored: ScoredItem<TItem, TIntent>[] = [];
  for (const s of output) {
    const item = byId.get(s.id);
    if (item === undefined) continue; // dropped: model invented an id
    scored.push({
      item,
      relevance: s.relevance,
      intentTag: s.intentTag,
      suggestedAction: s.suggestedAction,
      rationale: s.rationale,
    });
  }
  scored.sort((a, b) => b.relevance - a.relevance);

  return { scored, total: items.length };
}

// ---- Drafting ----------------------------------------------------------------

export interface DraftChannel<TPill extends string> {
  systemPrompt: string;
  pillInstructions: Record<TPill, string>;
}

/**
 * Draft a single reply. The caller assembles `promptBody` (the source-specific
 * prompt text); the engine layers the channel's system prompt plus any
 * pill/custom-instruction modifiers on top.
 */
export async function draftReply<TPill extends string>(
  channel: DraftChannel<TPill>,
  input: {
    promptBody: string;
    pills?: TPill[];
    customInstructions?: string;
  },
): Promise<string> {
  const modifierLines: string[] = [];
  for (const pill of input.pills ?? []) {
    modifierLines.push(`- ${channel.pillInstructions[pill]}`);
  }
  const custom = input.customInstructions?.trim();
  if (custom) modifierLines.push(`- ${custom}`);

  const modifiersBlock =
    modifierLines.length > 0
      ? `\n\nAdditional modifiers for THIS draft (override defaults where they conflict):\n${modifierLines.join("\n")}`
      : "";

  const { text } = await generateText({
    model: TRIAGE_DRAFT_MODEL,
    system: channel.systemPrompt + modifiersBlock,
    prompt: input.promptBody,
  });

  return text.trim();
}
