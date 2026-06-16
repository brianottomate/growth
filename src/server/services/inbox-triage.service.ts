import "server-only";

import { loadListeningContext } from "@/server/services/listening-config.service";
import {
  SUGGESTED_ACTIONS,
  composeListeningSystemPrompt,
  draftReply,
  scoreItems,
  type ScoringChannel,
  type SuggestedAction,
} from "@/server/services/triage.service";

const WANDER_CONTEXT = `Wander has three products relevant here:
- WanderOS: a direct-booking platform for short-term-rental property managers —
  take bookings outside Airbnb/VRBO to avoid OTA fees.
- Wander Sites: branded direct-booking websites for property managers.
- Wander Operated: full-service property management for owners frustrated with
  their current PM.`;

const SCORING_SYSTEM_PROMPT = `You are a growth analyst at Wander triaging inbound
social DMs (Instagram/Facebook) so the team knows which to act on first.

${WANDER_CONTEXT}

Most DMs are noise (fans, spam, vague hellos, attachment-only). Be discerning.
Reserve relevance 8+ for genuine sales intent — an operator/property manager who
wants to use Wander, especially with a real portfolio ("100 properties"), or a
concrete partnership/UGC proposal. Existing-customer complaints are important too
(route to support). Use the participant's follower count / verified status only as
weak social-proof signal, not the main driver — the message intent matters most.`;

// DM-specific reply MECHANICS only — voice + product framing come from the
// brand listening story, composed in at draft time.
const DRAFT_SYSTEM_PROMPT = `DM reply mechanics — first-reply drafts for Wander's social DMs.

Rules:
1. Warm, human, concise — this is a 1:1 DM, not a post. No marketing voice.
2. Answer/acknowledge the person first. Ask a clarifying question when it helps.
3. Mention a Wander product only if it directly fits their need, briefly.
4. For complaints: acknowledge, apologize, offer to help, no pitch.
5. Never invent specifics (pricing, availability). Keep it short.
This is a DRAFT for a human to review and send from Zernio — do not add greetings
boilerplate like "Best regards". Output the reply text only.`;

export const DM_INTENT_TAGS = [
  "sales-lead",
  "partnership",
  "support",
  "press",
  "spam",
  "other",
] as const;
export type DmIntentTag = (typeof DM_INTENT_TAGS)[number];

export const DM_SUGGESTED_ACTIONS = SUGGESTED_ACTIONS;
export type DmSuggestedAction = SuggestedAction;

// What the scorer needs about a conversation (preview-level, no thread fetch).
export interface ConversationInput {
  id: string;
  platform?: string;
  participantName?: string;
  participantUsername?: string;
  lastMessage?: string;
  unreadCount?: number;
  followerCount?: number;
  isVerified?: boolean;
}

export interface ScoredConversation {
  conversationId: string;
  relevance: number;
  intentTag: DmIntentTag;
  suggestedAction: DmSuggestedAction;
  rationale: string;
}

function formatConversationForLLM(c: ConversationInput): string {
  const lines = [
    `id: ${c.id}`,
    `platform: ${c.platform ?? "?"}`,
    `from: ${c.participantName ?? "?"}${c.participantUsername ? ` (@${c.participantUsername})` : ""}`,
  ];
  if (typeof c.followerCount === "number")
    lines.push(
      `followers: ${c.followerCount}${c.isVerified ? " · verified" : ""}`,
    );
  if (c.unreadCount) lines.push(`unread: ${c.unreadCount}`);
  lines.push(
    `last message: ${(c.lastMessage ?? "").replace(/\s+/g, " ").slice(0, 400) || "(none / attachment only)"}`,
  );
  return lines.join("\n");
}

const SCORING_CHANNEL: ScoringChannel<ConversationInput, DmIntentTag> = {
  intentTags: DM_INTENT_TAGS,
  systemPrompt: SCORING_SYSTEM_PROMPT,
  getId: (c) => c.id,
  formatItem: formatConversationForLLM,
  relevanceDescription:
    "0 = spam/noise. 5 = mild/ambiguous interest. 8+ = clear sales intent or concrete partnership.",
  intentTagDescription:
    "sales-lead = wants to use Wander. partnership = collab/UGC. support = existing-customer issue. press = media. spam = junk. other = none of these.",
};

export async function triageConversations(
  conversations: ConversationInput[],
): Promise<{ scored: ScoredConversation[]; total: number }> {
  const { scored, total } = await scoreItems(SCORING_CHANNEL, conversations);
  return {
    scored: scored.map((s) => ({
      conversationId: s.item.id,
      relevance: s.relevance,
      intentTag: s.intentTag,
      suggestedAction: s.suggestedAction,
      rationale: s.rationale,
    })),
    total,
  };
}

export const DM_DRAFT_PILLS = [
  "short",
  "no-pitch",
  "lead-with-question",
  "warm",
  "focus-wanderos",
  "focus-sites",
  "focus-operated",
] as const;
export type DmDraftPill = (typeof DM_DRAFT_PILLS)[number];

const PILL_INSTRUCTIONS: Record<DmDraftPill, string> = {
  short: "Keep it to 1-2 sentences.",
  "no-pitch": "Do not mention any Wander product — pure helpful reply.",
  "lead-with-question": "Open with a clarifying question.",
  warm: "Extra warm and personal in tone.",
  "focus-wanderos":
    "If mentioning a product, focus on WanderOS (direct booking).",
  "focus-sites": "If mentioning a product, focus on Wander Sites.",
  "focus-operated": "If mentioning a product, focus on Wander Operated.",
};

export async function draftDmReply(input: {
  participantName?: string;
  platform?: string;
  intentTag?: DmIntentTag;
  rationale?: string;
  thread: string; // formatted message history
  pills?: DmDraftPill[];
  customInstructions?: string;
}): Promise<string> {
  const ctx = await loadListeningContext("zernio-dms");
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
        `Platform: ${input.platform ?? "instagram"} DM`,
        `Person: ${input.participantName ?? "the sender"}`,
        input.intentTag ? `Triaged as: ${input.intentTag}` : null,
        input.rationale ? `Analyst note: ${input.rationale}` : null,
        "",
        "Conversation so far (oldest first):",
        input.thread || "(no prior messages / attachment only)",
        "",
        "Write the reply draft only.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
  );
}
