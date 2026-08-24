import "server-only";

import { eq } from "drizzle-orm";

import { env } from "@/env";
import { postOnSlack, type SlackBlock } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import { mentionTable, type Mention } from "@/server/db/listening-schema";
import { buildTrackedLink } from "@/lib/tracked-link";

// #radio-social-listening — the social-listening sibling of wander.com's
// #listed-inbound-radio / #os-inbound-radio lead channels. Scored mentions worth
// acting on are broadcast here so the team can triage from Slack instead of
// polling /app/listen. (wander.com/src/features/postOnSlack is the lead-radio
// equivalent this mirrors.)
const RADIO_SOCIAL_LISTENING_CHANNEL_ID = "C0BAW47LFGF";

// Per-source Slack owners to @-mention on broadcast, so the channel's RACI
// owners get pinged on engage-worthy hits instead of having to watch the
// channel. Keyed by mention.source (note: X is stored as "twitter"). A source
// can carry more than one owner; every id in the list gets pinged. Lift onto
// listening_source if per-brand ownership is ever needed.
//
// All three sources now persist→score→broadcast, so their owners fire on real
// hits: reddit via F5Bot email, instagram via the account-watch cron, twitter
// via the hourly X recent-search cron (/api/cron/x).
const SOURCE_OWNER_SLACK_IDS: Partial<Record<string, string[]>> = {
  reddit: [
    "U0BHR7V2X35", // Colleen Barndt (StatusLabs), Reddit
    "U02ML6AG4BE", // Lilianna Hogan, Reddit
  ],
  twitter: ["U025DTBSU01"], // Kyle, X / Twitter
  instagram: ["U0574R1RCD9"], // Micaela, Instagram
};

// Keep the channel high-signal: only "engage" mentions ("act today") reach
// Slack. "monitor"/"skip" and unscored rows stay in the table for the
// /app/listen queue. Tighten/loosen here (e.g. also require relevance >= 8) if
// the channel gets noisy.
//
// banRisk gate: content the model judges likely to be removed (self-promo in
// strict subs, spam-shaped posts) stays out of Slack — a ping for a thread
// that's dead by the time someone clicks is pure friction. The row still lands
// in the /app/listen queue with its banRisk visible.
const BAN_RISK_MAX = 0.6;

function isWorthBroadcasting(m: Mention): boolean {
  if (m.suggestedAction !== "engage") return false;
  if (typeof m.banRisk === "number" && m.banRisk >= BAN_RISK_MAX) {
    console.log(
      `[radio] suppressing ${m.id} (${m.url}) — banRisk ${m.banRisk.toFixed(2)} >= ${BAN_RISK_MAX}`,
    );
    return false;
  }
  return true;
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

// Label for the link that goes straight to the post. External collaborators
// (Status Labs on Reddit) work the alert from Slack and have no tool account, so
// the message has to name where the reply happens, not just link "Listen".
function replyLabel(source: string): string {
  if (source === "reddit") return "Reply on Reddit";
  if (source === "instagram") return "Reply on Instagram";
  if (source === "twitter") return "Reply on X";
  return "Open the thread";
}

// Reddit threads go cold fast, so age decides whether a reply is worth writing
// at all. Coarse on purpose: hours then days, no minutes.
function ageLabel(postedAt: Date): string {
  const hours = Math.floor((Date.now() - postedAt.getTime()) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function trackedLinkFor(m: Mention): string {
  return buildTrackedLink({
    id: m.id,
    source: m.source,
    subreddit: m.subreddit,
  });
}

// Layout follows Hashim Warren's 2026-07-27 read on the channel: the old
// single-blob message repeated "New r/x mention" and the poster's handle on
// every row, and its two links unfurled into the same pair of preview cards
// every time. Now: the title *is* the link (so the sub is one hover away, not
// restated), metadata sits in a two-column field grid rather than a `·`-joined
// run-on, each element gets its own block so Slack spaces them, and the
// broadcaster suppresses unfurls. The tracked link moved to the thread, next to
// the suggested reply — that's where you're composing, and it keeps the feed
// scannable.
function buildBlocks(m: Mention) {
  const blocks: SlackBlock[] = [];
  const title = m.title?.trim() || "(untitled)";

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*<${m.url}|${escapeSlackText(title)}>*` },
  });

  // Two-column grid — the closest Block Kit gets to a table, and it stays
  // readable on mobile where a long `·`-joined line wraps into mush.
  const fields: { type: "mrkdwn"; text: string }[] = [];
  const field = (label: string, value: string) =>
    fields.push({ type: "mrkdwn", text: `*${label}*\n${value}` });

  field("Where", sourceLabel(m));
  if (m.author) field("Who", escapeSlackText(m.author));
  if (m.postedAt) field("Posted", ageLabel(m.postedAt));
  if (m.keyword) field("Keyword", `\`${m.keyword}\``);
  if (typeof m.relevance === "number") field("Relevance", `${m.relevance}/10`);
  if (m.intentTag) field("Intent", m.intentTag);
  // Surface non-trivial removal risk so the team knows to check the thread is
  // still alive before investing in a reply.
  if (typeof m.banRisk === "number" && m.banRisk >= 0.25)
    field("Ban risk", `${Math.round(m.banRisk * 100)}%`);
  blocks.push({ type: "section", fields });

  if (m.snippet) {
    const snippet =
      m.snippet.length > 500 ? `${m.snippet.slice(0, 500)}…` : m.snippet;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> ${escapeSlackText(snippet).replace(/\n/g, "\n> ")}`,
      },
    });
  }

  if (m.rationale) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${escapeSlackText(m.rationale)}_` }],
    });
  }

  // Owner ping stays in a `section`, not a `context` — context styling is
  // quieter but we don't want to risk the RACI owners' notifications.
  const ownerSlackIds = SOURCE_OWNER_SLACK_IDS[m.source] ?? [];
  const ownerPings = ownerSlackIds.map((id) => `<@${id}>`).join(" ");
  // Reply link leads; Listen is flagged Wander-only because the owners include
  // external collaborators who can't sign in and were clicking it blind.
  const replyLink = `<${m.url}|${replyLabel(m.source)}>`;
  const listenLink = `<${env.NEXT_PUBLIC_BASE_URL}/app/listen?tab=${listenTab(m.source)}|Listen (Wander only)>`;
  const actions = `${replyLink} · ${listenLink}`;
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: ownerPings
        ? `${ownerPings}, you're on this one · ${actions}`
        : actions,
    },
  });

  // Separates consecutive alerts so the channel reads as distinct cards.
  blocks.push({ type: "divider" });

  return blocks;
}

// Slack mrkdwn treats these three as control characters; a mention title or
// snippet quoting "<3" or "R&D" would otherwise render mangled.
function escapeSlackText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The action kit, hung off the alert in a thread so the channel stays scannable:
// the AI-drafted reply plus the tracked link. Posted on every broadcast, draft
// or not, because for anyone without a tool account this thread IS the queue
// row: it carries the disclosure rule and the link to use.
function buildThreadBlocks(m: Mention) {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: m.suggestedReply
          ? ":speech_balloon: *Suggested reply.* Make it yours, keep it human, and say you're with Wander:"
          : ":speech_balloon: No draft for this one. Write it in your own voice and say you're with Wander.",
      },
    },
  ];
  if (m.suggestedReply) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> ${escapeSlackText(m.suggestedReply).replace(/\n/g, "\n> ")}`,
      },
    });
  }
  // Lives here rather than in the channel message: this is where the reply gets
  // composed, so the link is at hand without adding a line to every feed row.
  // Copy-pasteable (code span, not a hyperlink) — the point is to drop it into
  // the reply, not click it. utm_content = mention id → attributed in Amplitude.
  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `:link: Tracked link: \`${trackedLinkFor(m)}\`` },
    ],
  });
  return blocks;
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
    // Notification/sidebar preview only (blocks win in-channel) — lead with the
    // title, which is what tells you whether to open it.
    text: m.title?.trim() || `New ${sourceLabel(m)} mention`,
    channel: RADIO_SOCIAL_LISTENING_CHANNEL_ID,
    blocks: buildBlocks(m),
    unfurl_links: false,
    unfurl_media: false,
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

    // Best-effort thread: the reply kit hangs off the alert so the channel stays
    // a scannable feed. A thread failure must never change the result the caller
    // sees for the main post, so we don't await-or-throw on it.
    await postOnSlack({
      text: m.suggestedReply ? "Suggested reply" : "Reply kit",
      channel: RADIO_SOCIAL_LISTENING_CHANNEL_ID,
      thread_ts: result.ts,
      blocks: buildThreadBlocks(m),
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  return result;
}

/**
 * Broadcast engage-worthy mentions to #radio-social-listening. Best-effort and
 * never throws — a Slack failure must not fail mention ingestion. An empty list
 * (e.g. scoring failed upstream) is a no-op. Returns the count actually posted.
 */
export async function postMentionsToRadio(
  mentions: Mention[],
): Promise<number> {
  // Engage-worthy AND not already broadcast — `slackTs` is set once a mention
  // has been posted, so a re-run (or a row that slipped through twice) is a
  // no-op rather than a duplicate alert. The manual "Test → Slack" button calls
  // postMentionToRadio directly and intentionally bypasses this guard.
  const worth = mentions.filter(isWorthBroadcasting).filter((m) => !m.slackTs);
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
