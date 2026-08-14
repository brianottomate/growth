import "server-only";

import type {
  CompanyActivityHistory,
  CompanyEmailHistory,
} from "@/server/services/hubspot-company-email-context.service";

/**
 * What our team has actually said to a company, reduced to counts and dates.
 *
 * The ranker and the sequence generator each load the same two HubSpot
 * histories, and both used to discard everything except their own conclusion.
 * That left the strongest ranking signal we have unavailable anywhere else:
 * the leads card could not tell that Walt Kubiak is named in five logged calls
 * and Barb in one, because reading that costs two API calls per row.
 *
 * So the summary is persisted and the raw correspondence is not. This is a
 * deliberate line, not an optimisation. `sales-email-read` is the sensitive
 * scope in the HubSpot app and the corpus doc forbids copying bodies out of the
 * approved environment; a mention count and a date carry the ranking signal
 * without moving anyone's private mail into our database. Anything needing the
 * actual words re-reads HubSpot, where the record belongs.
 */
export type LeadCorrespondence = {
  computedAt: string;
  hubspotCompanyId: string | null;
  emails: { available: number; inbound: number; outbound: number };
  activity: { calls: number; meetings: number; notes: number };
  /** Newest logged email, call or meeting. */
  lastContactAt: string | null;
  /**
   * Lowercased email to the number of times that person is named in logged
   * call titles, notes and message bodies. Someone our team has spoken to
   * repeatedly is the likeliest person to write to next, and no other field on
   * the contact says so.
   */
  contactMentions: Record<string, number>;
};

export type CorrespondenceContact = {
  email: string;
  firstName: string | null;
  lastName: string | null;
};

/**
 * Count how often each contact is named across the logged record.
 *
 * Call titles carry the counterpart ("Call with Walt Kubiak"); bodies carry
 * whoever was addressed or signed off. A first name under three characters is
 * skipped rather than matched loosely, and matching prefers the full name when
 * we have one so two people sharing a surname stay distinct.
 */
export function countContactMentions(
  contacts: CorrespondenceContact[],
  haystack: string,
): Record<string, number> {
  const text = haystack.toLowerCase();
  const counts: Record<string, number> = {};
  for (const contact of contacts) {
    const first = contact.firstName?.trim().toLowerCase();
    const last = contact.lastName?.trim().toLowerCase();
    if (!first || first.length < 3) continue;
    const needle = last ? `${first} ${last}` : first;
    let count = 0;
    let at = text.indexOf(needle);
    // Bounded because this is a ranking nudge, not a metric worth an unbounded
    // scan over a large body of mail.
    while (at !== -1 && count < 99) {
      count += 1;
      at = text.indexOf(needle, at + needle.length);
    }
    if (count > 0) counts[contact.email.toLowerCase()] = count;
  }
  return counts;
}

export function summarizeCorrespondence(input: {
  hubspotCompanyId: string | null;
  history: CompanyEmailHistory | null;
  activity: CompanyActivityHistory | null;
  contacts: CorrespondenceContact[];
}): LeadCorrespondence {
  const emailItems = input.history?.items ?? [];
  const activityItems = input.activity?.items ?? [];

  const haystack = [
    ...activityItems.map((item) => `${item.title} ${item.body}`),
    ...emailItems.map((item) => `${item.subject} ${item.body}`),
  ].join("\n");

  const dates = [
    ...emailItems.map((item) => item.sentAt),
    ...activityItems.map((item) => item.occurredAt),
  ].filter((value): value is string => Boolean(value));

  const countKind = (kind: string): number =>
    activityItems.filter((item) => item.kind === kind).length;

  return {
    computedAt: new Date().toISOString(),
    hubspotCompanyId: input.hubspotCompanyId,
    emails: {
      available: input.history?.available ?? 0,
      inbound: emailItems.filter((item) => item.direction === "inbound").length,
      outbound: emailItems.filter((item) => item.direction === "outbound")
        .length,
    },
    activity: {
      calls: countKind("call"),
      meetings: countKind("meeting"),
      notes: countKind("note"),
    },
    lastContactAt: dates.length ? dates.sort().at(-1)! : null,
    contactMentions: countContactMentions(input.contacts, haystack),
  };
}

/**
 * Mention counts in the shape `scoreLeadChannel` takes, read off a stored
 * `enrichment` blob. Returns undefined when the domain has never been ranked,
 * which leaves scoring exactly as it was rather than treating "not computed" as
 * "never contacted".
 */
export function storedContactMentions(
  enrichment: unknown,
): Map<string, number> | undefined {
  const correspondence = (
    enrichment as { correspondence?: LeadCorrespondence } | null
  )?.correspondence;
  if (!correspondence?.contactMentions) return undefined;
  return new Map(Object.entries(correspondence.contactMentions));
}
