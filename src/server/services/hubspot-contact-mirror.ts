import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import {
  getContactById,
  getContactsByIds,
  type HubspotContact,
} from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import {
  leadContactTable,
  leadDomainTable,
  type LeadContactInsert,
} from "@/server/db/leads-schema";

// HubSpot contact -> leads.contact mirror.
//
// HubSpot is the system of record for contacts; `leads.contact` is a
// projection. That is the opposite direction from `upsertContact` in the
// HubSpot client, which is audit-always and never overwrites a value the sales
// team set. Here HubSpot wins on every mirrored field — but through
// `coalesce(excluded, existing)`, so a property HubSpot leaves blank does not
// erase something Instantly or Minerva discovered.
//
// Both the webhook receiver and scripts/backfill-hubspot-contacts.ts go through
// this module so there is exactly one upsert shape.

/**
 * Reduce anything URL-, email-, or host-shaped to a bare registrable hostname.
 * Shared with the HubSpot webhook receiver's company projection — the two must
 * agree or a contact will link to a different `leads.domain` row than its
 * company did.
 */
export function normalizeDomain(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  let domain = value.trim().toLowerCase();
  if (!domain) return null;
  if (domain.includes("://")) domain = domain.split("://")[1]!;
  if (domain.includes("@")) domain = domain.split("@").pop()!;
  for (const separator of ["/", "?", "#"]) {
    if (domain.includes(separator)) domain = domain.split(separator)[0]!;
  }
  if (domain.includes(":")) domain = domain.split(":")[0]!;
  while (domain.startsWith("www.")) domain = domain.slice(4);
  domain = domain.replace(/^\.+|\.+$/g, "").trim();
  return domain || null;
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * HubSpot sends booleans as strings. Anything it does not actually assert stays
 * null rather than defaulting to false — for a suppression flag, "we have not
 * been told" and "cleared to email" must not collapse into the same value.
 */
function toBoolean(value: string | null | undefined): boolean | null {
  const raw = clean(value)?.toLowerCase();
  if (!raw) return null;
  if (raw === "true" || raw === "yes" || raw === "1") return true;
  if (raw === "false" || raw === "no" || raw === "0") return false;
  return null;
}

export type MirrorStats = {
  /** Contacts written or refreshed. */
  mirrored: number;
  /** Skipped because HubSpot has no email — nothing to key on. */
  noEmail: number;
  /** Skipped because no `leads.domain` row could be resolved. */
  unresolvedDomain: number;
};

export const emptyMirrorStats = (): MirrorStats => ({
  mirrored: 0,
  noEmail: 0,
  unresolvedDomain: 0,
});

/**
 * Resolve each contact to a `leads.domain` row.
 *
 * Association first: HubSpot's company link is authoritative and survives
 * contacts whose email is on a shared host (gmail, a management-company
 * mailbox). Email host second, which is what recovers contacts HubSpot never
 * associated. Two queries per batch, not two per contact.
 */
async function resolveDomains(contacts: HubspotContact[]) {
  const companyIds = [
    ...new Set(
      contacts
        .map((c) => clean(c.values.associatedcompanyid))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const emailDomains = [
    ...new Set(
      contacts
        .map((c) => normalizeDomain(c.values.email))
        .filter((d): d is string => Boolean(d)),
    ),
  ];

  const byCompanyId = new Map<string, { id: string; domain: string }>();
  const byDomain = new Map<string, { id: string; domain: string }>();

  if (companyIds.length > 0) {
    const rows = await db
      .select({
        id: leadDomainTable.id,
        domain: leadDomainTable.domain,
        hubspotRecordId: leadDomainTable.hubspotRecordId,
      })
      .from(leadDomainTable)
      .where(inArray(leadDomainTable.hubspotRecordId, companyIds));
    for (const row of rows) {
      if (row.hubspotRecordId) {
        byCompanyId.set(row.hubspotRecordId, {
          id: row.id,
          domain: row.domain,
        });
      }
    }
  }

  if (emailDomains.length > 0) {
    const rows = await db
      .select({ id: leadDomainTable.id, domain: leadDomainTable.domain })
      .from(leadDomainTable)
      .where(inArray(leadDomainTable.domain, emailDomains));
    for (const row of rows) {
      byDomain.set(row.domain, { id: row.id, domain: row.domain });
    }
  }

  return { byCompanyId, byDomain };
}

function toInsert(
  contact: HubspotContact,
  target: { id: string; domain: string },
): LeadContactInsert {
  return {
    domainId: target.id,
    domain: target.domain,
    email: contact.values.email!.trim().toLowerCase(),
    firstName: clean(contact.values.firstname),
    lastName: clean(contact.values.lastname),
    jobTitle: clean(contact.values.jobtitle),
    phone: clean(contact.values.phone),
    state: clean(contact.values.state),
    emailOptOut: toBoolean(contact.values.hs_email_optout),
    hubspotContactId: contact.id,
    source: "hubspot",
  };
}

/**
 * Mirror a batch of HubSpot contacts. Idempotent on the `(domain, email)`
 * unique index, so re-running a page is a no-op beyond refreshing values.
 */
export async function mirrorContacts(
  contacts: HubspotContact[],
): Promise<MirrorStats> {
  const stats = emptyMirrorStats();
  if (contacts.length === 0) return stats;

  const { byCompanyId, byDomain } = await resolveDomains(contacts);
  const rows: LeadContactInsert[] = [];

  for (const contact of contacts) {
    if (!clean(contact.values.email)) {
      stats.noEmail += 1;
      continue;
    }
    const companyId = clean(contact.values.associatedcompanyid);
    const target =
      (companyId ? byCompanyId.get(companyId) : undefined) ??
      byDomain.get(normalizeDomain(contact.values.email) ?? "");
    if (!target) {
      stats.unresolvedDomain += 1;
      continue;
    }
    rows.push(toInsert(contact, target));
  }

  if (rows.length === 0) return stats;

  // Dedupe within the batch — HubSpot can hold two contact records with the
  // same email under one company, and Postgres rejects a statement that hits
  // the same conflict target twice. Last write wins, matching a re-run.
  const deduped = [...new Map(rows.map((r) => [`${r.domain}|${r.email}`, r])).values()];

  await db
    .insert(leadContactTable)
    .values(deduped)
    .onConflictDoUpdate({
      target: [leadContactTable.domain, leadContactTable.email],
      set: {
        // HubSpot wins where it has a value; a blank there keeps whatever
        // Instantly/Minerva already established.
        firstName: sql`coalesce(excluded.first_name, ${leadContactTable.firstName})`,
        lastName: sql`coalesce(excluded.last_name, ${leadContactTable.lastName})`,
        jobTitle: sql`coalesce(excluded.job_title, ${leadContactTable.jobTitle})`,
        phone: sql`coalesce(excluded.phone, ${leadContactTable.phone})`,
        state: sql`coalesce(excluded.state, ${leadContactTable.state})`,
        emailOptOut: sql`coalesce(excluded.email_opt_out, ${leadContactTable.emailOptOut})`,
        // The linkage itself is never optional — without it we cannot enroll.
        hubspotContactId: sql`excluded.hubspot_contact_id`,
        domainId: sql`excluded.domain_id`,
        updatedAt: new Date(),
      },
    });

  stats.mirrored += deduped.length;
  return stats;
}

/** Hydrate one contact from HubSpot and mirror it. Used by webhook creation. */
export async function mirrorContactById(
  contactId: string,
): Promise<{ stats: MirrorStats; found: boolean }> {
  const contact = await getContactById(contactId);
  if (!contact) return { stats: emptyMirrorStats(), found: false };
  return { stats: await mirrorContacts([contact]), found: true };
}

/**
 * Hydrate and mirror many contacts by id, for the webhook backlog rail.
 *
 * Chunked at 100 so both the HubSpot read and the resulting upsert statement
 * stay bounded no matter how large the pending set is. `missingIds` are the ids
 * HubSpot did not return — gone from the CRM, so the caller should soft-delete
 * rather than retry them forever.
 */
export async function mirrorContactsByIds(contactIds: string[]): Promise<{
  stats: MirrorStats;
  missingIds: string[];
}> {
  const unique = [...new Set(contactIds)];
  const stats = emptyMirrorStats();
  const missingIds: string[] = [];

  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const contacts = await getContactsByIds(chunk);
    const returned = new Set(contacts.map((contact) => contact.id));
    for (const id of chunk) {
      if (!returned.has(id)) missingIds.push(id);
    }
    const chunkStats = await mirrorContacts(contacts);
    stats.mirrored += chunkStats.mirrored;
    stats.noEmail += chunkStats.noEmail;
    stats.unresolvedDomain += chunkStats.unresolvedDomain;
  }

  return { stats, missingIds };
}

/**
 * Column a subscribed HubSpot contact property projects onto, with the coercion
 * that column needs. Keep in step with CONTACT_MIRROR_PROPERTIES minus the two
 * identity fields, which re-hydrate instead of patching.
 */
const CONTACT_PROPERTY_COLUMNS = {
  firstname: { column: "firstName", parse: clean },
  lastname: { column: "lastName", parse: clean },
  jobtitle: { column: "jobTitle", parse: clean },
  phone: { column: "phone", parse: clean },
  state: { column: "state", parse: clean },
  hs_email_optout: { column: "emailOptOut", parse: toBoolean },
} as const;

export type MirroredContactProperty = keyof typeof CONTACT_PROPERTY_COLUMNS;

export function isMirroredContactProperty(
  name: string,
): name is MirroredContactProperty {
  return name in CONTACT_PROPERTY_COLUMNS;
}

/**
 * Apply a single subscribed property change in place, keyed on
 * `hubspot_contact_id`. Returns the number of rows touched; 0 means the contact
 * is not mirrored yet, which the caller should classify rather than treat as an
 * error.
 *
 * `email` and `associatedcompanyid` deliberately do NOT come through here: both
 * change the row's identity (its unique key and its domain link), so they route
 * to a full re-hydration instead.
 */
export async function applyContactPropertyChange(params: {
  contactId: string;
  propertyName: MirroredContactProperty;
  value: string | null;
}): Promise<number> {
  const { column, parse } = CONTACT_PROPERTY_COLUMNS[params.propertyName];
  const updated = await db
    .update(leadContactTable)
    .set({ [column]: parse(params.value), updatedAt: new Date() })
    .where(eq(leadContactTable.hubspotContactId, params.contactId))
    .returning({ id: leadContactTable.id });
  return updated.length;
}

/**
 * Soft-delete a mirrored contact. HubSpot deletions and merge losers both land
 * here — we never hard-delete, because `leads.contact` carries Instantly
 * linkage and engagement history that outlives the CRM record.
 */
export async function softDeleteMirroredContact(
  contactId: string,
): Promise<number> {
  return softDeleteMirroredContacts([contactId]);
}

/** Batch form of {@link softDeleteMirroredContact}, for the backlog rail. */
export async function softDeleteMirroredContacts(
  contactIds: string[],
): Promise<number> {
  const unique = [...new Set(contactIds)];
  if (unique.length === 0) return 0;
  let removed = 0;
  for (let index = 0; index < unique.length; index += 500) {
    const updated = await db
      .update(leadContactTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(inArray(leadContactTable.hubspotContactId, unique.slice(index, index + 500)))
      .returning({ id: leadContactTable.id });
    removed += updated.length;
  }
  return removed;
}
