import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { leadContactTable, leadSequenceTable } from "@/server/db/leads-schema";

/**
 * Sequence outcomes, arriving on the webhook we already run.
 *
 * HubSpot publishes no webhook events for sequences themselves, which looked
 * like it left Growth blind: our row said `sent` forever, even if the prospect
 * replied the next morning. But HubSpot mirrors sequence state onto ordinary
 * contact properties, and `contact.propertyChange` is a subscription the
 * receiver already handles. So this needs no new endpoint and no polling, only
 * these property names added to the private app's subscription list.
 *
 * The properties (verified against portal 22480390):
 *   hs_sequences_is_enrolled            bool     currently in a sequence
 *   hs_latest_sequence_unenrolled_date  datetime stopped before finishing
 *   hs_latest_sequence_finished_date    datetime ran every step
 */
export const SEQUENCE_STATE_PROPERTIES = [
  "hs_sequences_is_enrolled",
  "hs_latest_sequence_unenrolled_date",
  "hs_latest_sequence_finished_date",
] as const;

export function isSequenceStateProperty(name: string): boolean {
  return (SEQUENCE_STATE_PROPERTIES as readonly string[]).includes(name);
}

/**
 * Move the enrolment ledger to match what HubSpot just reported.
 *
 * Only rows this app enrolled are touched (`hubspotEnrollmentId` present) and
 * only from a live status, so a manual HubSpot enrolment of some unrelated
 * sequence cannot rewrite a draft.
 *
 * On unenrolment we record `replied`, and that is an inference worth naming:
 * HubSpot unenrols automatically when a prospect answers, which is the dominant
 * cause, but a rep pulling someone out by hand looks identical on this
 * property. The alternative was leaving every finished enrolment stuck on
 * `sent`, which is wrong more often. Anyone acting on it has the enrolment id
 * and can read the thread.
 */
export async function applySequenceStateChange(input: {
  hubspotContactId: string;
  propertyName: string;
  value: string | null;
}): Promise<number> {
  const stopped =
    input.propertyName === "hs_latest_sequence_unenrolled_date"
      ? "replied"
      : input.propertyName === "hs_latest_sequence_finished_date"
        ? "sent"
        : input.propertyName === "hs_sequences_is_enrolled" &&
            (input.value === "false" || input.value === null)
          ? "replied"
          : null;

  // "Still enrolled" is not news; the row already says so.
  if (!stopped) return 0;

  const contacts = await db
    .select({ id: leadContactTable.id })
    .from(leadContactTable)
    .where(eq(leadContactTable.hubspotContactId, input.hubspotContactId));
  if (!contacts.length) return 0;

  const result = await db
    .update(leadSequenceTable)
    .set({ status: stopped, updatedAt: new Date() })
    .where(
      and(
        inArray(
          leadSequenceTable.contactId,
          contacts.map((contact) => contact.id),
        ),
        // Ours to move, and only from a live state.
        inArray(leadSequenceTable.status, ["queued", "sent"]),
      ),
    )
    .returning({ id: leadSequenceTable.id });

  return result.length;
}
