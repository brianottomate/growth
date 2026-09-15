import "server-only";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/server/db";
import { salesEmailCorpusTable } from "@/server/db/leads-schema";

/**
 * Real exchanges that worked, formatted for a generation prompt.
 *
 * The generator's voice guidance used to be entirely negative — a list of
 * banned phrases — and what survives all the prohibitions reads efficient and
 * cold. This is the positive half: a few anonymized sends that actually earned
 * replies, shown together with the reply they earned, so the model has a
 * register to match instead of only edges to avoid.
 *
 * Winners only, defined by outcome: `gotReply` is set by the corpus builder
 * when the same counterpart wrote back within 45 days. That is a noisy label
 * (some replies are "unsubscribe"), which is why the exemplars carry the reply
 * text — a model reading "please stop emailing me" under an exemplar treats it
 * accordingly, where a bare thumbs-up label would mislead.
 */
export async function winningExemplarsBlock(count = 3): Promise<string | null> {
  try {
    const winners = await db
      .select()
      .from(salesEmailCorpusTable)
      .where(
        and(
          eq(salesEmailCorpusTable.direction, "outbound"),
          eq(salesEmailCorpusTable.gotReply, true),
          // A 15-word bump and a 400-word essay are both poor registers to
          // imitate for this motion.
          gte(salesEmailCorpusTable.wordCount, 35),
          lte(salesEmailCorpusTable.wordCount, 220),
        ),
      )
      .orderBy(desc(salesEmailCorpusTable.sentAt))
      .limit(60);
    if (!winners.length) return null;

    const replyIds = winners
      .map((row) => row.replyEngagementId)
      .filter((value): value is string => Boolean(value));
    const replies = replyIds.length
      ? await db
          .select()
          .from(salesEmailCorpusTable)
          .where(inArray(salesEmailCorpusTable.engagementId, replyIds))
      : [];
    const replyById = new Map(replies.map((row) => [row.engagementId, row]));

    // The reply label is mechanical — "an inbound landed within 45 days" — so
    // out-of-office bounces and departure notices count as wins. They are not.
    // An exemplar exists to show what earned a human answer, and "I am
    // experiencing a higher-than-usual volume of emails" earned nothing.
    const AUTO_REPLY =
      /out of (?:the )?office|auto(?:matic|mated)?[- ]?repl|no longer with|higher.than.usual volume|response times? may be (?:longer|delayed)|currently (?:away|traveling|travelling)|i(?:'| wi)ll be (?:away|out)|limited access to (?:my )?email|unsubscribe|remove me from|stop email|please allow us time|thank you for contacting|email disclaimer|we will (?:get back|respond) to you/i;

    // The corpus holds every one-to-one sales mail — onboarding welcomes,
    // scheduling, invoices — and those are the wrong register for prospecting
    // however many replies they earn. A welcome email to a signed customer
    // gets a reply because they are a customer, not because the writing works.
    const NOT_PROSPECTING_SUBJECT =
      /welcome|onboarding|kick[- ]?off|invoice|agreement|contract|launch|next steps|intro call|recap/i;

    const qualified = winners.filter((row) => {
      if (NOT_PROSPECTING_SUBJECT.test(row.subject)) return false;
      const reply = row.replyEngagementId
        ? replyById.get(row.replyEngagementId)
        : null;
      return reply != null && !AUTO_REPLY.test(reply.body);
    });
    if (!qualified.length) return null;

    // One per rep, so three exemplars show three voices rather than the most
    // recent rep three times.
    const picked: typeof qualified = [];
    const seenReps = new Set<string>();
    for (const row of qualified) {
      const rep = row.rep ?? "unknown";
      if (seenReps.has(rep)) continue;
      seenReps.add(rep);
      picked.push(row);
      if (picked.length >= count) break;
    }
    for (const row of qualified) {
      if (picked.length >= count) break;
      if (!picked.includes(row)) picked.push(row);
    }

    const blocks = picked.map((row, index) => {
      const reply = replyById.get(row.replyEngagementId!)!;
      const replyText = reply.body.replace(/\s+/g, " ").trim().slice(0, 400);
      return `EXCHANGE ${index + 1} — a real send from ${row.rep ?? "a rep"} that earned a reply:
Subject: ${row.subject || "(no subject)"}
${row.body}

THE REPLY IT EARNED:
${replyText}`;
    });

    return blocks.join("\n\n---\n\n");
  } catch (error) {
    // Missing table, cold DB, whatever — exemplars are an upgrade, not a
    // dependency. Generation must not fail because the corpus is unavailable.
    console.warn("⚠️ [corpus] exemplar read failed", error);
    return null;
  }
}
