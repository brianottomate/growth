import "server-only";

import type {
  CompanyActivityHistory,
  CompanyEmailHistory,
} from "@/server/services/hubspot-company-email-context.service";

/**
 * What our team has actually said to a company, persisted where the leads UI
 * can read it without paying two HubSpot calls per row.
 *
 * The ranker and the sequence generator each load the same two HubSpot
 * histories, and both used to discard everything except their own conclusion.
 * That left the strongest ranking signal we have unavailable anywhere else:
 * the leads card could not tell that Walt Kubiak is named in five logged calls
 * and Barb in one.
 *
 * This started as counts and dates only, with the bodies deliberately left in
 * HubSpot. That line moved (2026-08-17): drafts already persist email excerpts
 * in generationContext, the corpus stores anonymized bodies, and the review
 * surface needs the record visible without an on-demand provider read that
 * 429s under load. So the summary now carries capped excerpts too. The full
 * messages still live in HubSpot; the live fetch remains the source of truth.
 */
export type CorrespondenceEmailItem = {
  engagementId: string;
  direction: "outbound" | "inbound" | "unknown";
  sentAt: string;
  subject: string;
  excerpt: string;
};

export type CorrespondenceActivityItem = {
  engagementId: string;
  kind: string;
  occurredAt: string;
  qualifier: string | null;
  title: string;
  excerpt: string;
};

export type LeadCorrespondence = {
  computedAt: string;
  hubspotCompanyId: string | null;
  emails: {
    available: number;
    inbound: number;
    outbound: number;
    /** Newest first, capped. Absent on blobs written before 2026-08-17. */
    items?: CorrespondenceEmailItem[];
  };
  activity: {
    calls: number;
    meetings: number;
    notes: number;
    items?: CorrespondenceActivityItem[];
  };
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

const MAX_ITEMS = 20;
const EMAIL_EXCERPT = 700;
const ACTIVITY_EXCERPT = 500;

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

  const newestFirst = <T>(items: T[], at: (item: T) => string): T[] =>
    [...items].sort((a, b) => at(b).localeCompare(at(a)));

  return {
    computedAt: new Date().toISOString(),
    hubspotCompanyId: input.hubspotCompanyId,
    emails: {
      available: input.history?.available ?? 0,
      inbound: emailItems.filter((item) => item.direction === "inbound").length,
      outbound: emailItems.filter((item) => item.direction === "outbound")
        .length,
      items: newestFirst(emailItems, (item) => item.sentAt)
        .slice(0, MAX_ITEMS)
        .map((item) => ({
          engagementId: item.engagementId,
          direction: item.direction,
          sentAt: item.sentAt,
          subject: item.subject,
          excerpt: item.body.slice(0, EMAIL_EXCERPT),
        })),
    },
    activity: {
      calls: countKind("call"),
      meetings: countKind("meeting"),
      notes: countKind("note"),
      items: newestFirst(activityItems, (item) => item.occurredAt)
        .slice(0, MAX_ITEMS)
        .map((item) => ({
          engagementId: item.engagementId,
          kind: item.kind,
          occurredAt: item.occurredAt,
          qualifier: item.qualifier,
          title: item.title,
          excerpt: item.body.slice(0, ACTIVITY_EXCERPT),
        })),
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
