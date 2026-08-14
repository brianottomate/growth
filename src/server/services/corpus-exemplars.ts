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
export async function winningExemplarsBlock(
  count = 3,
): Promise<string | null> {
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
      .limit(24);
    if (!winners.length) return null;

    // One per rep, so three exemplars show three voices rather than the most
    // recent rep three times.
    const picked: typeof winners = [];
    const seenReps = new Set<string>();
    for (const row of winners) {
      const rep = row.rep ?? "unknown";
      if (seenReps.has(rep) && picked.length + (winners.length - picked.length) > count) {
        continue;
      }
      seenReps.add(rep);
      picked.push(row);
      if (picked.length >= count) break;
    }
    if (picked.length < count) {
      for (const row of winners) {
        if (picked.length >= count) break;
        if (!picked.includes(row)) picked.push(row);
      }
    }

    const replyIds = picked
      .map((row) => row.replyEngagementId)
      .filter((value): value is string => Boolean(value));
    const replies = replyIds.length
      ? await db
          .select()
          .from(salesEmailCorpusTable)
          .where(inArray(salesEmailCorpusTable.engagementId, replyIds))
      : [];
    const replyById = new Map(replies.map((row) => [row.engagementId, row]));

    const blocks = picked.map((row, index) => {
      const reply = row.replyEngagementId
        ? replyById.get(row.replyEngagementId)
        : null;
      const replyText = reply
        ? reply.body.replace(/\s+/g, " ").trim().slice(0, 400)
        : "(reply body not retained)";
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
