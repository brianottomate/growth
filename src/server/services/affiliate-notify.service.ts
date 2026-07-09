import "server-only";

import { eq } from "drizzle-orm";

import { env } from "@/env";
import { postOnSlack } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import {
  affiliateItemTable,
  type AffiliateItem,
} from "@/server/db/affiliate-schema";

// #radio-affiliate — the affiliate-ops sibling of #radio-social-listening.
// Engage-worthy affiliate items (partner emails, applications, network notices
// that demand action) are broadcast here so the partnerships owner triages from
// Slack instead of polling /app/affiliate.
//
// TODO(ops): create #radio-affiliate, invite the wandercom bot, and replace the
// name below with the channel ID (name-based posting works for public channels
// the bot is in, but IDs survive renames). Outside prod every post is redirected
// to #radio-slack-testing by postOnSlack's envSelect guard, so local testing
// works before the channel exists.
const RADIO_AFFILIATE_CHANNEL = "radio-affiliate";

// Who owns the program day-to-day. TODO: set once decided (Micaela?).
const AFFILIATE_OWNER_SLACK_ID: string | null = null;

const KIND_LABEL: Record<AffiliateItem["kind"], string> = {
  email: "Partner email",
  application: "Application",
  fraud_flag: "Fraud flag",
  correction: "Correction batch",
  finding: "Finding",
};

function isWorthBroadcasting(item: AffiliateItem): boolean {
  return item.suggestedAction === "engage";
}

function buildBlocks(item: AffiliateItem) {
  const lines: string[] = [];

  if (AFFILIATE_OWNER_SLACK_ID)
    lines.push(`<@${AFFILIATE_OWNER_SLACK_ID}> — you're on this one`);

  const fromLabel = item.fromEmail
    ? ` from ${item.fromName ? `${item.fromName} ` : ""}(${item.fromEmail})`
    : "";
  lines.push(
    `:handshake: ${KIND_LABEL[item.kind]}${fromLabel} — *${item.title ?? "(untitled)"}*`,
  );

  const meta: string[] = [];
  if (typeof item.relevance === "number") meta.push(`relevance ${item.relevance}/10`);
  if (item.intentTag) meta.push(`intent: ${item.intentTag}`);
  if (meta.length) lines.push(meta.join(" · "));

  if (item.snippet) {
    const snippet =
      item.snippet.length > 500 ? `${item.snippet.slice(0, 500)}…` : item.snippet;
    lines.push(`> ${snippet.replace(/\n/g, "\n> ")}`);
  }
  if (item.rationale) lines.push(`_${item.rationale}_`);

  lines.push(`<${env.NEXT_PUBLIC_BASE_URL}/app/affiliate|Open in Affiliate desk>`);

  return [
    {
      type: "section" as const,
      text: { type: "mrkdwn" as const, text: lines.join("\n") },
    },
  ];
}

function buildThreadBlocks(item: AffiliateItem) {
  const lines = [
    ":speech_balloon: *Suggested reply* — review, fill any [gaps], and send from the partnerships inbox:",
  ];
  if (item.suggestedReply) {
    lines.push(`> ${item.suggestedReply.replace(/\n/g, "\n> ")}`);
  }
  return [
    {
      type: "section" as const,
      text: { type: "mrkdwn" as const, text: lines.join("\n") },
    },
  ];
}

/**
 * Post a single affiliate item to #radio-affiliate. The caller decides whether
 * it's worth sending (ingest gates via `postAffiliateItemsToRadio`; a manual
 * "Test → Slack" can force a send). Best-effort: returns the postOnSlack result.
 */
export async function postAffiliateItemToRadio(item: AffiliateItem) {
  const result = await postOnSlack({
    text: `${KIND_LABEL[item.kind]}: ${item.title ?? "(untitled)"}`,
    channel: RADIO_AFFILIATE_CHANNEL,
    blocks: buildBlocks(item),
  });

  if (result.success && result.ts) {
    // Broadcast trail: enables a later chat.update and stops re-ingestion from
    // double-posting. Best-effort — a DB hiccup must not fail ingestion.
    try {
      await db
        .update(affiliateItemTable)
        .set({ slackTs: result.ts, slackChannel: result.channel })
        .where(eq(affiliateItemTable.id, item.id));
    } catch (e) {
      console.error("[affiliate-radio] failed to persist slack thread ref", e);
    }

    if (item.suggestedReply) {
      await postOnSlack({
        text: "Suggested reply",
        channel: RADIO_AFFILIATE_CHANNEL,
        thread_ts: result.ts,
        blocks: buildThreadBlocks(item),
      });
    }
  }

  return result;
}

/**
 * Broadcast engage-worthy affiliate items. Best-effort and never throws — a
 * Slack failure must not fail ingestion. Returns the count actually posted.
 */
export async function postAffiliateItemsToRadio(
  items: AffiliateItem[],
): Promise<number> {
  const worth = items.filter(isWorthBroadcasting).filter((i) => !i.slackTs);
  if (worth.length === 0) return 0;

  let posted = 0;
  for (const item of worth) {
    const result = await postAffiliateItemToRadio(item);
    if (result.success) posted += 1;
  }

  console.log(`[affiliate-radio] posted ${posted}/${worth.length} item(s)`);
  return posted;
}
