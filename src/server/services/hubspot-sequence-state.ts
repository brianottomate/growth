import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getContactReplyEvidence } from "@/server/clients/hubspot.client";
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
 * Neither dated property can be trusted alone. The bare enrolled-flag flip goes
 * false whenever an enrolment stops. An unenrolled-date change looked like the
 * reply discriminator, but a one-step sequence finishing fires it too — the
 * whole 2026-08-21 wave self-marked replied within a minute of sending, while
 * HubSpot's own enrollment page said Finished / No response on every one. So a
 * stop event only says "stopped"; whether it was a reply is decided by fetching
 * `hs_sales_email_last_replied` and checking it lands inside this enrolment.
 * When HubSpot cannot be reached the row records `sent` — a missed reply is
 * recoverable from the thread, a false `replied` blocks the next send.
 */
export async function applySequenceStateChange(input: {
  hubspotContactId: string;
  propertyName: string;
  value: string | null;
}): Promise<number> {
  const stopped =
    input.propertyName === "hs_latest_sequence_unenrolled_date" ||
    input.propertyName === "hs_latest_sequence_finished_date";
  // "Still enrolled" is not news; the row already says so.
  if (!stopped) return 0;

  const contacts = await db
    .select({ id: leadContactTable.id })
    .from(leadContactTable)
    .where(eq(leadContactTable.hubspotContactId, input.hubspotContactId));
  if (!contacts.length) return 0;

  let status: "sent" | "replied" = "sent";
  if (input.propertyName === "hs_latest_sequence_unenrolled_date") {
    const evidence = await getContactReplyEvidence(input.hubspotContactId);
    if (
      evidence?.lastRepliedAt &&
      (!evidence.lastEnrolledAt ||
        evidence.lastRepliedAt >= evidence.lastEnrolledAt)
    ) {
      status = "replied";
    }
  }

  const result = await db
    .update(leadSequenceTable)
    .set({ status, updatedAt: new Date() })
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
