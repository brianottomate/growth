import "server-only";

import { loadListeningContext } from "@/server/services/listening-config.service";
import {
  composeListeningSystemPrompt,
  draftReply,
  scoreItems,
  type ScoringChannel,
  type SuggestedAction,
} from "@/server/services/triage.service";

/**
 * Triage for comments on Wander's owned organic posts — which to reply to first.
 * Same generic engine as DMs/Reddit/X; only the taxonomy + prompts differ.
 */

const SCORING_SYSTEM_PROMPT = `You are a growth analyst at Wander, a vacation-rental
company, triaging comments left on Wander's OWN social posts so the social team
knows which to reply to first.

Wander runs WanderOS (direct-booking platform for STR property managers), Wander
Sites (branded direct-booking websites), and Wander Operated (full-service PM).

Most comments are low-action (emoji, generic praise, tagging a friend) — be
discerning. Reserve relevance 8+ for comments that genuinely need a human reply:
a buying/partnership signal, a real question, or a complaint that shouldn't sit
unanswered. Spam and pure praise are low.`;

const DRAFT_SYSTEM_PROMPT = `You write reply drafts for comments on Wander's own
social posts. Warm, human, concise, on-brand — never salesy. Answer questions
directly; for complaints, acknowledge and offer to help (no pitch); for praise, a
short genuine thanks. This is a public reply, so keep it brief. Output the reply
text only.`;

export const COMMENT_INTENT_TAGS = [
  "lead",
  "question",
  "complaint",
  "praise",
  "spam",
  "other",
] as const;
export type CommentIntentTag = (typeof COMMENT_INTENT_TAGS)[number];

export const COMMENT_DRAFT_PILLS = [
  "short",
  "warm",
  "no-pitch",
  "answer-question",
] as const;
export type CommentDraftPill = (typeof COMMENT_DRAFT_PILLS)[number];

export interface CommentInput {
  id: string;
  platform?: string;
  author?: string;
  postContent?: string;
  message: string;
}

export interface ScoredComment {
  commentId: string;
  relevance: number;
  intentTag: CommentIntentTag;
  suggestedAction: SuggestedAction;
  rationale: string;
}

function formatCommentForLLM(c: CommentInput): string {
  const lines = [
    `id: ${c.id}`,
    `platform: ${c.platform ?? "?"}`,
    `our post: ${(c.postContent ?? "").replace(/\s+/g, " ").slice(0, 200) || "(no text)"}`,
    `comment by ${c.author ?? "?"}: ${(c.message ?? "").replace(/\s+/g, " ").slice(0, 400) || "(no text)"}`,
  ];
  return lines.join("\n");
}

const SCORING_CHANNEL: ScoringChannel<CommentInput, CommentIntentTag> = {
  intentTags: COMMENT_INTENT_TAGS,
  systemPrompt: SCORING_SYSTEM_PROMPT,
  getId: (c) => c.id,
  formatItem: formatCommentForLLM,
  relevanceDescription:
    "0 = spam/noise. 5 = generic praise or low-value. 8+ = a question, complaint, or buying signal that genuinely needs a reply.",
  intentTagDescription:
    "lead = buying/partnership signal. question = asking something. complaint = negative/issue. praise = positive, low-action. spam = junk. other = none of these.",
};

export async function triageComments(
  comments: CommentInput[],
): Promise<{ scored: ScoredComment[]; total: number }> {
  const { scored, total } = await scoreItems(SCORING_CHANNEL, comments);
  return {
    scored: scored.map((s) => ({
      commentId: s.item.id,
      relevance: s.relevance,
      intentTag: s.intentTag,
      suggestedAction: s.suggestedAction,
      rationale: s.rationale,
    })),
    total,
  };
}

const PILL_INSTRUCTIONS: Record<CommentDraftPill, string> = {
  short: "Keep it to one short sentence.",
  warm: "Extra warm and personal in tone.",
  "no-pitch": "Do not mention any Wander product — pure helpful reply.",
  "answer-question": "Directly answer the question the commenter asked.",
};

export async function draftCommentReply(input: {
  platform?: string;
  author?: string;
  postContent?: string;
  message: string;
  intentTag?: CommentIntentTag;
  rationale?: string;
  pills?: CommentDraftPill[];
  customInstructions?: string;
}): Promise<string> {
  const ctx = await loadListeningContext("zernio-comments");
  const systemPrompt = composeListeningSystemPrompt({
    brandVoice: ctx.brandVoice,
    story: ctx.story,
    voiceOverride: ctx.voiceOverride,
    signalNotes: ctx.signalNotes,
    channelMechanics: DRAFT_SYSTEM_PROMPT,
    mode: "draft",
  });

  return draftReply(
    { systemPrompt, pillInstructions: PILL_INSTRUCTIONS },
    {
      pills: input.pills,
      customInstructions: input.customInstructions,
      promptBody: [
        `Platform: ${input.platform ?? "?"}`,
        `Our post: "${(input.postContent ?? "").slice(0, 300) || "(no text)"}"`,
        `Comment by ${input.author ?? "the commenter"}: "${input.message || "(no text)"}"`,
        input.intentTag ? `Triaged as: ${input.intentTag}` : null,
        input.rationale ? `Analyst note: ${input.rationale}` : null,
        "",
        "Write the reply draft only.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
  );
}
