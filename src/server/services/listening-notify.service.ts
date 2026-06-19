import "server-only";

import { env } from "@/env";
import { postOnSlack } from "@/server/clients/slack.client";
import type { Mention } from "@/server/db/listening-schema";

// #radio-social-listening — the social-listening sibling of wander.com's
// #listed-inbound-radio / #os-inbound-radio lead channels. Scored mentions worth
// acting on are broadcast here so the team can triage from Slack instead of
// polling /app/listen. (wander.com/src/features/postOnSlack is the lead-radio
// equivalent this mirrors.)
const RADIO_SOCIAL_LISTENING_CHANNEL_ID = "C0BAW47LFGF";

// Keep the channel high-signal: only "engage" mentions ("act today") reach
// Slack. "monitor"/"skip" and unscored rows stay in the table for the
// /app/listen queue. Tighten/loosen here (e.g. also require relevance >= 8) if
// the channel gets noisy.
function isWorthBroadcasting(m: Mention): boolean {
  return m.suggestedAction === "engage";
}

function sourceLabel(m: Mention): string {
  if (m.source === "reddit" && m.subreddit) return `r/${m.subreddit}`;
  return m.source;
}

function buildBlocks(m: Mention) {
  const where = sourceLabel(m);
  const lines: string[] = [];
  lines.push(`:eyes: New ${where} mention — ${m.title ? `*${m.title}*` : "_(no title)_"}`);

  const meta: string[] = [];
  if (m.keyword) meta.push(`keyword: \`${m.keyword}\``);
  if (m.author) meta.push(`by ${m.author}`);
  if (typeof m.relevance === "number") meta.push(`relevance ${m.relevance}/10`);
  if (m.intentTag) meta.push(`intent: ${m.intentTag}`);
  if (meta.length) lines.push(meta.join(" · "));

  if (m.snippet) {
    const snippet =
      m.snippet.length > 500 ? `${m.snippet.slice(0, 500)}…` : m.snippet;
    lines.push(`> ${snippet.replace(/\n/g, "\n> ")}`);
  }
  if (m.rationale) lines.push(`_${m.rationale}_`);

  lines.push(
    `<${m.url}|View on ${where}> · <${env.NEXT_PUBLIC_BASE_URL}/app/listen|Open in Listen>`,
  );

  return [
    {
      type: "section" as const,
      text: { type: "mrkdwn" as const, text: lines.join("\n") },
    },
  ];
}

/**
 * Post a single mention to #radio-social-listening. Bypasses the engage filter —
 * the caller decides whether it's worth sending (ingest gates via
 * `postMentionsToRadio`; the "Test → Slack" button intentionally forces a send so
 * the team can verify the plumbing on any row). Best-effort: returns the
 * postOnSlack result instead of throwing.
 */
export function postMentionToRadio(m: Mention) {
  return postOnSlack({
    text: `New ${sourceLabel(m)} mention${m.keyword ? ` for "${m.keyword}"` : ""}`,
    channel: RADIO_SOCIAL_LISTENING_CHANNEL_ID,
    blocks: buildBlocks(m),
  });
}

/**
 * Broadcast engage-worthy mentions to #radio-social-listening. Best-effort and
 * never throws — a Slack failure must not fail mention ingestion. An empty list
 * (e.g. scoring failed upstream) is a no-op. Returns the count actually posted.
 */
export async function postMentionsToRadio(mentions: Mention[]): Promise<number> {
  const worth = mentions.filter(isWorthBroadcasting);
  if (worth.length === 0) return 0;

  let posted = 0;
  for (const m of worth) {
    const result = await postMentionToRadio(m);
    if (result.success) posted += 1;
  }

  console.log(
    `[radio] posted ${posted}/${worth.length} engage-worthy mention(s) to #radio-social-listening`,
  );
  return posted;
}
