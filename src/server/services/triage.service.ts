import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { z } from "zod";

import type { BrandListeningStory } from "@/server/db/brand-schema";
import type { ChannelFingerprint } from "@/server/db/channel-schema";
import type { SubredditProfile } from "@/server/db/listening-schema";

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
export const TRIAGE_SCORING_MODEL = anthropic("claude-sonnet-5");
export const TRIAGE_DRAFT_MODEL = anthropic("claude-opus-5");

export const SUGGESTED_ACTIONS = ["engage", "monitor", "skip"] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

const SUGGESTED_ACTION_DESCRIPTION =
  "engage = act today. monitor = revisit / low urgency. skip = ignore.";

const DEFAULT_RELEVANCE_DESCRIPTION =
  "0 = noise/off-topic. 5 = adjacent or ambiguous. 8+ = clear, high-value engagement opportunity.";

// ---- Partner guardrail ---------------------------------------------------
//
// Brands Wander has a commercial partnership with (the PMS integrations that
// power sync for marketplace supply). They stay on the watchlists — a
// partner's public pain is still market intel — but a Wander reply that dunks
// on a partner is a business problem no matter how strong the engagement
// looks. Composed into every listening scoring and drafting prompt.
export const PARTNER_BRANDS = ["Guesty", "Hostaway", "Escapia"] as const;

export function partnerGuardrail(mode: "score" | "draft"): string {
  const list = PARTNER_BRANDS.join(", ");
  return mode === "score"
    ? `PARTNERS — NEVER PITCH AGAINST (overrides any competitor guidance above):
Wander partners commercially with: ${list}. A complaint about a partner is
market intel, not an insertion point. Never suggest "engage" when the only
angle is positioning a Wander product as the escape from a partner — score
those monitor (topically strong) or skip.`
    : `PARTNERS — NEVER DISPARAGE (overrides any other guidance):
Wander partners commercially with: ${list}. Never criticize a partner, echo or
amplify the OP's complaint about them, or pitch a Wander product as the
alternative to them. If the OP is upset with a partner, you may empathize with
their situation, but stay strictly neutral about the partner and do not turn
the thread into a switch pitch.`;
}

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
  banRisk: number;
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
          .describe(
            channel.relevanceDescription ?? DEFAULT_RELEVANCE_DESCRIPTION,
          ),
        intentTag: channel.intentTagDescription
          ? z.enum(channel.intentTags).describe(channel.intentTagDescription)
          : z.enum(channel.intentTags),
        suggestedAction: z
          .enum(SUGGESTED_ACTIONS)
          .describe(SUGGESTED_ACTION_DESCRIPTION),
        rationale: z
          .string()
          .describe("One concise sentence justifying the score."),
        banRisk: z
          .number()
          .min(0)
          .max(1)
          .describe(
            "Likelihood (0–1) that this content gets removed from its platform — moderator removal or author deletion. High: self-promo / product launches in strict communities, hashtag-wall spam, lead magnets, rule-breaking, throwaway-account posts. Low: genuine questions and discussions from established members. 0 = clearly durable, 1 = near-certain removal.",
          ),
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
      banRisk: s.banRisk,
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

// ---- Listening system-prompt composition --------------------------------------
//
// The single place a listening system prompt is assembled from the evolvable
// brand "story" + per-source overrides + the hardcoded channel mechanics. This
// is what lets the brain evolve in the DB instead of across copied constants.
// Used by every reply-DRAFT path (Reddit / X / DMs / comments). Scoring prompts
// still carry their own static signal context for now (a later retire).
//
//   brand voice (fingerprint)                      ← shared, single source of truth
//   + per-source voice override (append OR replace)
//   + brand listening story (signal + reply judgment)
//   + per-source signal notes
//   + channel mechanics (char caps, output schema, etiquette)  ← stays hardcoded

export function composeListeningSystemPrompt(input: {
  /** brand.brandFingerprint.fingerprintText — the shared publishing/replying voice. */
  brandVoice?: string | null;
  /** brand.brandListeningStory — shared signal + reply judgment. */
  story?: BrandListeningStory | null;
  /** listening_source.voiceOverride — per-source persona (append, or replace voice). */
  voiceOverride?: ChannelFingerprint | null;
  /** listening_source.signalNotes — per-source judgment layered on the story. */
  signalNotes?: string | null;
  /**
   * Per-SUBREDDIT profile (config.subreddits[]) — the most specific layer. Its
   * stance/risk/sanctioned-path is what keeps a reply from breaking r/X's rules;
   * its voice/signal notes refine the brand voice for that one room.
   */
  subreddit?: SubredditProfile | null;
  /** Hardcoded per-channel format rules (char caps, output schema, etiquette). */
  channelMechanics: string;
  /**
   * "draft" (default) → voice + reply guidance (for writing replies).
   * "score" → signal guidance (for relevance scoring). Selects which parts of
   * the story are relevant so we don't pollute one task with the other's rules.
   */
  mode?: "draft" | "score";
}): string {
  const mode = input.mode ?? "draft";
  const blocks: string[] = [];

  // Voice only matters for writing replies, not for scoring relevance.
  if (mode === "draft") {
    const override = input.voiceOverride?.fingerprintText?.trim();
    const brandVoice = input.brandVoice?.trim();
    if (override && input.voiceOverride?.overridesBrand) {
      blocks.push(`VOICE:\n${override}`);
    } else {
      const voice = [brandVoice, override].filter(Boolean).join("\n\n");
      if (voice) blocks.push(`VOICE:\n${voice}`);
    }
  }

  if (input.story?.productBoilerplate?.trim()) {
    blocks.push(input.story.productBoilerplate.trim());
  }
  if (mode === "score" && input.story?.signalGuidance?.trim()) {
    blocks.push(`WHAT COUNTS AS SIGNAL:\n${input.story.signalGuidance.trim()}`);
  }
  if (mode === "draft" && input.story?.replyGuidance?.trim()) {
    blocks.push(`HOW WE REPLY:\n${input.story.replyGuidance.trim()}`);
  }
  if (input.signalNotes?.trim()) {
    blocks.push(`FOR THIS SOURCE SPECIFICALLY:\n${input.signalNotes.trim()}`);
  }

  // Per-subreddit posture — the tightest layer. Risk/stance/sanctioned-path
  // always apply (they gate whether we engage at all); voice/signal notes are
  // mode-specific so we don't pollute scoring with reply-voice or vice versa.
  const sub = input.subreddit;
  if (sub) {
    const lines: string[] = [`SUBREDDIT — r/${sub.name}:`];
    if (sub.stance) lines.push(`Engagement stance: ${sub.stance}.`);
    if (sub.riskFlags?.length) lines.push(`Risks: ${sub.riskFlags.join(", ")}.`);
    if (sub.sanctionedPath)
      lines.push(`Sanctioned path: ${sub.sanctionedPath}.`);
    if (sub.cultureSummary) lines.push(sub.cultureSummary.trim());
    if (mode === "score" && sub.signalNotes?.trim())
      lines.push(`What counts as signal here: ${sub.signalNotes.trim()}`);
    if (mode === "draft" && sub.voiceNotes?.trim())
      lines.push(`Voice here: ${sub.voiceNotes.trim()}`);
    blocks.push(lines.join("\n"));
  }

  blocks.push(partnerGuardrail(mode));
  blocks.push(input.channelMechanics.trim());

  return blocks.join("\n\n");
}
