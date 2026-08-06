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
// #radio-affiliate — created 2026-07-09 with the Wander Radio bot invited.
// Outside prod every post is redirected to #radio-slack-testing by
// postOnSlack's envSelect guard.
const RADIO_AFFILIATE_CHANNEL = "C0BH31P8W3S";

// Who owns the program day-to-day. Ornella Nuñez (Social Media Manager, lead
// of #marketing-affiliates) is tagged first on all impact/affiliate items;
// Micaela is cc'd. NOTE: #marketing-affiliates itself is Slack Connect with
// Acceleration Partners members — never point this feed there; internal only.
const AFFILIATE_OWNER_SLACK_ID: string | null = "U08LV4ZNRF1"; // Ornella
const AFFILIATE_CC_SLACK_ID: string | null = "U0574R1RCD9"; // Micaela

const KIND_LABEL: Record<AffiliateItem["kind"], string> = {
  email: "Partner email",
  application: "Application",
  fraud_flag: "Fraud flag",
  correction: "Correction batch",
  inquiry: "Partner dispute",
  finding: "Finding",
};

// Kinds that never reach Slack. Partner emails are suppressed because
// partnerships@wander.com already delivers every one of them to the owners'
// inboxes, so the radio post was a duplicate that also tagged them a second
// time (Micaela Koremblit + Kristian Boe in #radio-affiliate, 2026-07-26).
// Ingest, scoring and reply drafting are untouched — suppressed items still
// land in the Affiliate desk with their drafted reply, and the conversion feed
// and weekly report are unaffected. To bring partner-email posts back, drop
// "email" from this set (a code change, deliberately — this is an editorial
// call about the feed, not per-environment configuration).
const SUPPRESSED_KINDS = new Set<AffiliateItem["kind"]>(["email"]);

function isWorthBroadcasting(item: AffiliateItem): boolean {
  if (SUPPRESSED_KINDS.has(item.kind)) {
    console.log(
      `[affiliate-radio] suppressing ${item.id} — "${item.kind}" alerts are off`,
    );
    return false;
  }
  return item.suggestedAction === "engage";
}

function buildBlocks(item: AffiliateItem) {
  const lines: string[] = [];

  if (AFFILIATE_OWNER_SLACK_ID)
    lines.push(
      `<@${AFFILIATE_OWNER_SLACK_ID}> — you're on this one${
        AFFILIATE_CC_SLACK_ID ? ` (cc <@${AFFILIATE_CC_SLACK_ID}>)` : ""
      }`,
    );

  const fromLabel = item.fromEmail
    ? ` from ${item.fromName ? `${item.fromName} ` : ""}(${item.fromEmail})`
    : "";
  lines.push(
    `:handshake: ${KIND_LABEL[item.kind]}${fromLabel} — *${item.title ?? "(untitled)"}*`,
  );

  const meta: string[] = [];
  if (typeof item.relevance === "number")
    meta.push(`relevance ${item.relevance}/10`);
  if (item.intentTag) meta.push(`intent: ${item.intentTag}`);
  if (meta.length) lines.push(meta.join(" · "));

  if (item.snippet) {
    const snippet =
      item.snippet.length > 500
        ? `${item.snippet.slice(0, 500)}…`
        : item.snippet;
    lines.push(`> ${snippet.replace(/\n/g, "\n> ")}`);
  }
  if (item.rationale) lines.push(`_${item.rationale}_`);

  lines.push(
    `<${env.NEXT_PUBLIC_BASE_URL}/app/affiliate|Open in Affiliate desk>`,
  );

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

// ---- Per-conversion radio posts ------------------------------------------
//
// The lightweight celebratory feed the other radio-* channels set the pattern
// for (#referral-radio fires per code use). Volume today is a handful of
// bookings a month, so one post per conversion is signal, not noise. Called by
// the daily monitor only on the day's FIRST snapshot (re-runs update the metric
// row and skip this), so each action posts at most once.

export interface AffiliateConversion {
  id: string;
  partnerName?: string;
  amount?: number;
  payout?: number;
  state?: string;
  eventDate?: string;
}

const money = (n: number | undefined) =>
  typeof n === "number"
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

/** Post yesterday's conversions as a compact celebratory feed. Best-effort. */
export async function postConversionsToRadio(
  conversions: AffiliateConversion[],
): Promise<number> {
  let posted = 0;
  for (const c of conversions) {
    const lines = [
      `:tada: Affiliate booking via *${c.partnerName ?? "unknown partner"}* — ${money(c.amount)} (payout ${money(c.payout)})`,
      `${c.state ?? ""}${c.eventDate ? ` · ${c.eventDate.slice(0, 10)}` : ""} · action \`${c.id}\``,
    ];
    const result = await postOnSlack({
      text: `Affiliate booking via ${c.partnerName ?? "partner"}: ${money(c.amount)}`,
      channel: RADIO_AFFILIATE_CHANNEL,
      blocks: [
        {
          type: "section" as const,
          text: { type: "mrkdwn" as const, text: lines.join("\n") },
        },
      ],
    });
    if (result.success) posted += 1;
  }
  if (conversions.length > 0)
    console.log(
      `[affiliate-radio] posted ${posted}/${conversions.length} conversion(s)`,
    );
  return posted;
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
