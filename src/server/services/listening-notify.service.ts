import "server-only";

import { eq } from "drizzle-orm";

import { env } from "@/env";
import { postOnSlack } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import { mentionTable, type Mention } from "@/server/db/listening-schema";
import { buildTrackedLink } from "@/lib/tracked-link";

// #radio-social-listening — the social-listening sibling of wander.com's
// #listed-inbound-radio / #os-inbound-radio lead channels. Scored mentions worth
// acting on are broadcast here so the team can triage from Slack instead of
// polling /app/listen. (wander.com/src/features/postOnSlack is the lead-radio
// equivalent this mirrors.)
const RADIO_SOCIAL_LISTENING_CHANNEL_ID = "C0BAW47LFGF";

// Per-source Slack owner to @-mention on broadcast, so the channel's RACI owner
// gets pinged on engage-worthy hits instead of having to watch the channel.
// Keyed by mention.source (note: X is stored as "twitter"). Lift onto
// listening_source if per-brand ownership is ever needed.
//
// All three sources now persist→score→broadcast, so their owners fire on real
// hits: reddit via F5Bot email, instagram via the account-watch cron, twitter
// via the hourly X recent-search cron (/api/cron/x).
const SOURCE_OWNER_SLACK_ID: Partial<Record<string, string>> = {
  reddit: "U09K9UDU5FA",
  twitter: "U025DTBSU01", // Kyle — X / Twitter
  instagram: "U0574R1RCD9", // Micaela — Instagram
};

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

// Deep-link the "Open in Listen" link to the room that owns this source, so the
// jump from Slack lands on the right tab instead of the monitor overview.
function listenTab(source: string): string {
  if (source === "reddit") return "reddit";
  if (source === "instagram") return "instagram";
  if (source === "twitter") return "x";
  return "monitor";
}

function trackedLinkFor(m: Mention): string {
  return buildTrackedLink({ id: m.id, source: m.source, subreddit: m.subreddit });
}

function buildBlocks(m: Mention) {
  const where = sourceLabel(m);
  const lines: string[] = [];

  const ownerSlackId = SOURCE_OWNER_SLACK_ID[m.source];
  if (ownerSlackId) lines.push(`<@${ownerSlackId}> — you're on this one`);

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
    `<${m.url}|View on ${where}> · <${env.NEXT_PUBLIC_BASE_URL}/app/listen-v2?tab=${listenTab(m.source)}|Open in Listen>`,
  );
  // Copy-pasteable (code span, not a hyperlink) — the point is to drop it into
  // the reply, not click it. utm_content = mention id → attributed in Amplitude.
  lines.push(`:link: Tracked link: \`${trackedLinkFor(m)}\``);

  return [
    {
      type: "section" as const,
      text: { type: "mrkdwn" as const, text: lines.join("\n") },
    },
  ];
}

// The action kit, hung off the alert in a thread so the channel stays scannable:
// the AI-drafted reply to make our own. Only posted when a draft exists.
function buildThreadBlocks(m: Mention) {
  const lines = [
    ":speech_balloon: *Suggested reply* — make it yours, keep it human, and disclose you're with Wander:",
  ];
  if (m.suggestedReply) {
    lines.push(`> ${m.suggestedReply.replace(/\n/g, "\n> ")}`);
  }
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
export async function postMentionToRadio(m: Mention) {
  const result = await postOnSlack({
    text: `New ${sourceLabel(m)} mention${m.keyword ? ` for "${m.keyword}"` : ""}`,
    channel: RADIO_SOCIAL_LISTENING_CHANNEL_ID,
    blocks: buildBlocks(m),
  });

  if (result.success && result.ts) {
    // Remember where this landed: the target for a later chat.update (engage/
    // skip) and the guard that stops re-ingestion from double-broadcasting.
    // Best-effort — a DB hiccup must not fail ingestion or change the result.
    try {
      await db
        .update(mentionTable)
        .set({ slackTs: result.ts, slackChannel: result.channel })
        .where(eq(mentionTable.id, m.id));
    } catch (e) {
      console.error("[radio] failed to persist slack thread ref", e);
    }

    // Best-effort thread: the suggested reply hangs off the alert so the channel
    // stays a scannable feed. A thread failure must never change the result the
    // caller sees for the main post, so we don't await-or-throw on it.
    if (m.suggestedReply) {
      await postOnSlack({
        text: "Suggested reply",
        channel: RADIO_SOCIAL_LISTENING_CHANNEL_ID,
        thread_ts: result.ts,
        blocks: buildThreadBlocks(m),
      });
    }
  }

  return result;
}

/**
 * Broadcast engage-worthy mentions to #radio-social-listening. Best-effort and
 * never throws — a Slack failure must not fail mention ingestion. An empty list
 * (e.g. scoring failed upstream) is a no-op. Returns the count actually posted.
 */
export async function postMentionsToRadio(mentions: Mention[]): Promise<number> {
  // Engage-worthy AND not already broadcast — `slackTs` is set once a mention
  // has been posted, so a re-run (or a row that slipped through twice) is a
  // no-op rather than a duplicate alert. The manual "Test → Slack" button calls
  // postMentionToRadio directly and intentionally bypasses this guard.
  const worth = mentions
    .filter(isWorthBroadcasting)
    .filter((m) => !m.slackTs);
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
