import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  affiliateItemTable,
  partnerProgramTable,
  type AffiliateItem,
  type AffiliateItemInsert,
} from "@/server/db/affiliate-schema";

import { postAffiliateItemsToRadio } from "./affiliate-notify.service";
import { draftReply, scoreItems, type ScoringChannel } from "./triage.service";

// Affiliate inbound-email pipeline: partnerships@wander.com (Google group)
// forward-copies every message to affiliate+<programId>@<receiving domain> →
// the Resend inbound webhook routes it here → persist as an affiliate_item →
// score via the shared triage engine → draft a reply for engage-worthy mail →
// broadcast to the affiliate radio channel. Mirrors f5bot.service.ts, minus the
// extraction pass: one email = one item, so the metadata persists directly and
// the LLM only classifies + drafts.
//
// See docs/affiliate-program-takeover.md for the full program plan.

// ---- Classification (reuses the shared triage engine) -------------------------

const AFFILIATE_INTENT_TAGS = [
  "partner-question",
  "application",
  "placement-offer",
  "recruitment-pitch",
  "network-notice",
  "compliance",
  "fraud-signal",
  "noise",
] as const;
type AffiliateIntentTag = (typeof AFFILIATE_INTENT_TAGS)[number];

const AFFILIATE_SCORING_SYSTEM = `You triage the inbox of Wander's affiliate program
(vacation rentals; the program runs on the Impact.com network and was recently
taken in-house from an agency). Every item is one email sent to the program's
contact address, partnerships@wander.com.

What arrives here:
- Real affiliate partners asking about commissions, tracking links, creative,
  payment status, or their account → partner-question. These are the emails the
  program lives on: suggestedAction=engage, relevance 7+.
- Impact.com platform notifications: new partner applications → application
  (engage — someone must review it); balance/funding, compliance or tracking
  notices → network-notice (engage if it demands action, monitor if FYI).
- Offers of paid placements, newsletter features, media kits from existing or
  prospective partners → placement-offer (engage if concrete and from a real
  publisher, monitor if boilerplate).
- Mass outreach from affiliate agencies, "we'll grow your program" pitches,
  link-exchange spam → recruitment-pitch or noise, skip.
- FTC/disclosure or brand-compliance issues → compliance, engage.
- Anything smelling like affiliate fraud (cookie stuffing confessions, odd
  commission disputes, suspicious sub-affiliate behavior) → fraud-signal,
  engage — flag it, never auto-dismiss.

relevance = how much this needs a human's attention today. A partner waiting on
a payment answer is a 9; an agency cold pitch is a 1. When unsure between
monitor and skip, prefer monitor — this queue is low-volume.`;

/** Body text we keep for scoring/drafting (raw jsonb) — capped to stay sane. */
interface AffiliateEmailRaw {
  text: string | null;
  to: string[];
}

function itemBody(item: AffiliateItem): string {
  const raw = item.raw as AffiliateEmailRaw | null;
  return raw?.text ?? item.snippet ?? "";
}

const affiliateScoringChannel: ScoringChannel<AffiliateItem, AffiliateIntentTag> = {
  intentTags: AFFILIATE_INTENT_TAGS,
  systemPrompt: AFFILIATE_SCORING_SYSTEM,
  getId: (i) => i.id,
  relevanceDescription:
    "0 = spam/noise. 5 = FYI worth a skim. 8+ = a partner or the network is waiting on us — answer today.",
  intentTagDescription:
    "partner-question = a real partner needs an answer. application = new partner application to review. placement-offer = concrete paid-placement/feature offer. recruitment-pitch = agency/growth-service cold outreach. network-notice = Impact platform notification. compliance = FTC/brand-compliance matter. fraud-signal = possible affiliate fraud. noise = everything else.",
  formatItem: (i) =>
    [
      `id: ${i.id}`,
      `from: ${i.fromName ? `${i.fromName} ` : ""}<${i.fromEmail ?? "unknown"}>`,
      `subject: ${i.title ?? "(no subject)"}`,
      `body: ${itemBody(i).slice(0, 2_000) || "(empty)"}`,
    ].join("\n"),
};

// ---- Reply drafting -----------------------------------------------------------

const AFFILIATE_DRAFT_SYSTEM = `You draft replies for Wander's affiliate program
inbox (partnerships@wander.com). Wander rents out professionally-managed
vacation homes; the affiliate program runs on Impact.com and pays partners a
commission on completed bookings.

Reply mechanics — a human on the partnerships team reviews and sends this from
the real inbox, so draft exactly the email body they should send:

1. Answer the sender's actual question first, plainly and completely.
2. Warm-professional tone; concise; no marketing fluff, no exclamation points.
3. NEVER invent program specifics — commission rates, cookie windows, payment
   dates, terms. If the answer needs a fact you don't have, write the reply
   around it and mark the gap like [rate], so the human fills it in.
4. If action is needed on our side ("we'll look into your missing commission"),
   commit to the follow-up without promising an outcome.
5. Sign off "— The Wander Partnerships Team".
6. Under 150 words. Output the email body only — no subject line, no preamble.`;

// ---- Ingest --------------------------------------------------------------------

export interface AffiliateIngestResult {
  inserted: boolean;
  scored: boolean;
  reason?: string;
}

/** "Name <a@b.com>" → { name, email }; best-effort. */
function parseFrom(from: string | null): { name: string | null; email: string | null } {
  if (!from) return { name: null, email: null };
  const match = /^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/.exec(from);
  if (match) {
    return { name: match[1]?.trim() || null, email: match[2]?.trim().toLowerCase() ?? null };
  }
  const bare = from.trim();
  return bare.includes("@")
    ? { name: null, email: bare.toLowerCase() }
    : { name: bare, email: null };
}

/** Normalized subject for thread grouping: Re:/Fwd: prefixes stripped, lowercased. */
function toThreadKey(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

/**
 * Resolve the target program: prefer the affiliate+<programId> address token,
 * fall back to the single active program (the common case — Wander has one).
 */
async function resolveProgram(recipients: string[]): Promise<string | null> {
  const token = recipients
    .map((r) => /affiliate\+([a-z0-9_-]+)@/i.exec(r.toLowerCase())?.[1])
    .find(Boolean);
  if (token) {
    const byId = await db.query.partnerProgramTable.findFirst({
      where: eq(partnerProgramTable.id, token),
    });
    if (byId) return byId.id;
    console.warn(`[affiliate] address token "${token}" matches no program; falling back`);
  }
  const active = await db.query.partnerProgramTable.findFirst({
    where: eq(partnerProgramTable.status, "active"),
  });
  return active?.id ?? null;
}

/**
 * Full ingest for one received email. Persists first (a scoring failure never
 * loses the email), then best-effort scores, drafts, and broadcasts. Idempotent:
 * dedup on (programId, `email:<resendEmailId>`).
 */
export async function ingestAffiliateEmail(email: {
  id: string;
  recipients: string[];
  from: string | null;
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt?: string | null;
}): Promise<AffiliateIngestResult> {
  const { name: fromName, email: fromEmail } = parseFrom(email.from);

  // Loop guard: the group forward includes Wander-internal mail (a teammate
  // replying inside the thread). Our own domain never needs triage.
  if (fromEmail?.endsWith("@wander.com")) {
    console.log(`[affiliate] skipping internal sender ${fromEmail} (${email.id})`);
    return { inserted: false, scored: false, reason: "internal-sender" };
  }

  const programId = await resolveProgram(email.recipients);
  if (!programId) {
    console.warn(`[affiliate] no active partner_program — email ${email.id} ignored`);
    return { inserted: false, scored: false, reason: "no-program" };
  }

  const text = email.text?.trim() || email.html?.trim() || null;
  const raw: AffiliateEmailRaw = {
    text: text?.slice(0, 20_000) ?? null,
    to: email.recipients,
  };

  const row: AffiliateItemInsert = {
    programId,
    kind: "email",
    dedupKey: `email:${email.id}`,
    title: email.subject || "(no subject)",
    snippet: text?.replace(/\s+/g, " ").slice(0, 600) ?? null,
    fromEmail,
    fromName,
    threadKey: toThreadKey(email.subject),
    receivedAt: email.receivedAt ? new Date(email.receivedAt) : new Date(),
    sourceEmailId: email.id,
    raw,
  };

  const inserted = await db
    .insert(affiliateItemTable)
    .values(row)
    .onConflictDoNothing({
      target: [affiliateItemTable.programId, affiliateItemTable.dedupKey],
    })
    .returning();

  if (inserted.length === 0) {
    console.log(`[affiliate] email ${email.id} already ingested — skipping`);
    return { inserted: false, scored: false, reason: "duplicate" };
  }
  const item = inserted[0]!;
  console.log(
    `[affiliate] persisted ${item.id} from=${fromEmail} subject="${item.title}"`,
  );

  // Best-effort scoring — never fail the ingest (or the webhook) on an AI error.
  let scoredItem: AffiliateItem = item;
  let scored = false;
  try {
    const { scored: results } = await scoreItems(affiliateScoringChannel, [item]);
    const r = results[0];
    if (r) {
      // banRisk is a triage-engine field about content removal — meaningless
      // for email, so it stays out of the row (it lives in the raw score only).
      //
      // Junk policy: NOTHING is dropped, but clear noise (skip) is auto-filed
      // to Dismissed with the reasoning, so the desk's Open bucket stays a
      // human-worthy work queue (the write-only-queue lesson from listening).
      // resolvedById stays null = "the system filed this", and Reopen undoes it.
      const autoDismiss = r.suggestedAction === "skip";
      const update = {
        relevance: r.relevance,
        intentTag: r.intentTag,
        suggestedAction: r.suggestedAction,
        rationale: r.rationale,
        ...(autoDismiss
          ? {
              status: "dismissed" as const,
              decisionNote: `Auto-dismissed by triage: ${r.rationale}`,
              resolvedAt: new Date(),
            }
          : {}),
      };
      await db
        .update(affiliateItemTable)
        .set(update)
        .where(inArray(affiliateItemTable.id, [item.id]));
      scoredItem = { ...item, ...update };
      scored = true;
      console.log(
        `[affiliate] scored ${item.id}: relevance=${r.relevance} intent=${r.intentTag} action=${r.suggestedAction}`,
      );
    }
  } catch (error) {
    console.error("[affiliate] scoring failed (email still saved):", error);
  }

  // Draft a reply for engage-worthy partner mail (skip pure platform notices —
  // there's no one to reply to). Best-effort like scoring.
  if (
    scoredItem.suggestedAction === "engage" &&
    scoredItem.intentTag !== "network-notice" &&
    scoredItem.intentTag !== "application"
  ) {
    try {
      const suggestedReply = await draftReply(
        { systemPrompt: AFFILIATE_DRAFT_SYSTEM, pillInstructions: {} },
        {
          promptBody: `Email to reply to:

from: ${fromName ? `${fromName} ` : ""}<${fromEmail ?? "unknown"}>
subject: ${scoredItem.title}
body:
${itemBody(scoredItem).slice(0, 4_000)}

Triage context from our analyst:
- intent: ${scoredItem.intentTag}
- rationale: ${scoredItem.rationale}

Draft the reply.`,
        },
      );
      await db
        .update(affiliateItemTable)
        .set({ suggestedReply })
        .where(eq(affiliateItemTable.id, scoredItem.id));
      scoredItem = { ...scoredItem, suggestedReply };
    } catch (error) {
      console.error("[affiliate] reply drafting failed (item still scored):", error);
    }
  }

  // Broadcast to the affiliate radio channel. Best-effort, never throws.
  await postAffiliateItemsToRadio([scoredItem]);

  return { inserted: true, scored };
}
