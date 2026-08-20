import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { PREGEN_SEQUENCE_SENDER_EMAIL } from "@/lib/pregen-sequence";
import { createCaller } from "@/server/api/root";
import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/leads-schema";
import { storedContactMentions } from "@/server/services/lead-correspondence";
import {
  isPlaceholderEmail,
  scoreStoredContact,
} from "@/server/services/lead-channel.service";
import { assertLabAccess } from "@/server/lab-access";

/**
 * Enrol a batch of pregen prospects in Kyle's sequence, from a script.
 *
 * Exists for the same reason as /api/lab/pregen-builds: the per-row button in
 * /app/leads needs a browser session, and batch sends happen from wherever the
 * operator is. This is NOT another send path — it builds a server-side caller
 * for the same `leads.startPregenSequence` mutation the button invokes, so
 * every refusal (exclusions, opt-outs, placeholder addresses, missing preview,
 * one-live-enrolment-per-company, provider-side enrolment check) and the send
 * ledger are the same code, not a copy that drifts.
 *
 * Contact choice per domain is the same scorer the leads UI ranks with. Dry by
 * default: reports who WOULD be enrolled, calls HubSpot for nothing.
 */

const BodySchema = z.object({
  domains: z.array(z.string().trim().min(3)).min(1).max(10),
  apply: z.boolean().default(false),
});

export async function POST(request: Request) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { apply } = parsed.data;
  const domains = [...new Set(parsed.data.domains.map((d) => d.toLowerCase()))];

  // protectedProcedure only checks that a session user exists; the mutations
  // themselves never read it. The lab gate is the authentication here, so the
  // caller carries a synthetic identity naming this route as the actor.
  const caller = createCaller({
    db,
    session: {
      user: { id: "lab-pregen-send", email: "growth-lab@wander.com" },
    },
    authApi: null,
    headers: new Headers(),
  } as never);

  const results = [];
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

    if (!apply) {
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

  return NextResponse.json({ mode: apply ? "apply" : "dry", results });
}
