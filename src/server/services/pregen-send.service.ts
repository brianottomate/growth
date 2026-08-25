import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { PREGEN_SEQUENCE_SENDER_EMAIL } from "@/lib/pregen-sequence";
import { createCaller } from "@/server/api/root";
import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/leads-schema";
import { storedContactMentions } from "@/server/services/lead-correspondence";
import {
  isPlaceholderEmail,
  scoreStoredContact,
} from "@/server/services/lead-channel.service";

export type PregenSendResult = {
  domain: string;
  action: "skipped" | "would-enrol" | "enrolled" | "refused";
  reason?: string;
  to?: string | null;
  name?: string | null;
  title?: string | null;
  from?: string;
  previewUrl?: string | null;
  enrollmentId?: string;
  sequence?: string;
};

/**
 * Enrol a set of domains in Kyle's pregen sequence, one best contact each.
 *
 * The single batch-send implementation, shared by the lab route and the send
 * queue cron so both go through the same `leads.startPregenSequence` mutation
 * the per-row button uses — every refusal (exclusions, opt-outs, placeholder
 * addresses, missing preview, one-live-enrolment-per-company, provider-side
 * enrolment check) and the send ledger are one code path.
 *
 * Contact choice per domain is the same scorer the leads UI ranks with. With
 * `apply: false` it reports who WOULD be enrolled and calls HubSpot for
 * nothing.
 */
export async function enrolPregenDomains(
  domains: string[],
  options: { apply: boolean; actor: { id: string; email: string } },
): Promise<PregenSendResult[]> {
  // protectedProcedure only checks that a session user exists; the mutations
  // themselves never read it. The caller's gate is the authentication here, so
  // the caller carries a synthetic identity naming the invoking surface.
  const caller = createCaller({
    db,
    session: { user: options.actor },
    authApi: null,
    headers: new Headers(),
  } as never);

  const results: PregenSendResult[] = [];
  for (const domain of domains) {
    const row = await db.query.leadDomainTable.findFirst({
      where: and(
        eq(leadDomainTable.domain, domain),
        isNull(leadDomainTable.deletedAt),
      ),
    });
    if (!row) {
      results.push({ domain, action: "skipped", reason: "Not in leads" });
      continue;
    }

    const contacts = await db
      .select()
      .from(leadContactTable)
      .where(
        and(
          eq(leadContactTable.domainId, row.id),
          isNull(leadContactTable.deletedAt),
        ),
      );
    const mentions = storedContactMentions(row.enrichment);
    const ranked = contacts
      .filter(
        (contact) =>
          contact.hubspotContactId != null &&
          !contact.emailOptOut &&
          !isPlaceholderEmail(contact.email),
      )
      .map((contact) => ({
        contact,
        score: scoreStoredContact(contact, row.domain, {
          historyMentions: mentions?.get(contact.email.toLowerCase()),
        }).score,
      }))
      .sort((left, right) => right.score - left.score);

    const best = ranked[0]?.contact;
    if (!best) {
      results.push({
        domain,
        action: "skipped",
        reason: "No enrollable contact",
      });
      continue;
    }

    if (!options.apply) {
      results.push({
        domain,
        action: "would-enrol",
        to: best.email,
        name: [best.firstName, best.lastName].filter(Boolean).join(" ") || null,
        title: best.jobTitle,
        from: PREGEN_SEQUENCE_SENDER_EMAIL,
        previewUrl: row.pregenSiteUrl,
      });
      continue;
    }

    try {
      const enrolment = await caller.leads.startPregenSequence({
        domainId: row.id,
        contactId: best.id,
        senderEmail: PREGEN_SEQUENCE_SENDER_EMAIL,
        // Warnings (company name in the first-name field, stale preview) must
        // surface as refusals here, not be blanket-acknowledged by a batch.
        acknowledgeWarnings: false,
      });
      results.push({
        domain,
        action: "enrolled",
        to: enrolment.toEmail,
        enrollmentId: enrolment.enrollmentId,
        sequence: enrolment.sequenceName,
      });
    } catch (error) {
      results.push({
        domain,
        action: "refused",
        to: best.email,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
