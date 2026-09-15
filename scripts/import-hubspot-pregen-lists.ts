/**
 * Mirror Danny's four dynamic pregen target lists into Growth.
 *
 * HubSpot owns the filters; Growth stores current memberships for querying,
 * joins company records to lead_domain via hubspot_record_id, and links valid
 * HubSpot contacts to their corresponding company/domain by association.
 *
 * Rerunnable and non-destructive: current members are upserted. Membership rows
 * no longer returned by HubSpot are removed only for these four explicit lists,
 * inside the same transaction, so the projection matches HubSpot exactly.
 *
 *   bun --conditions=react-server scripts/import-hubspot-pregen-lists.ts
 *   bun --conditions=react-server scripts/import-hubspot-pregen-lists.ts --dry
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { env } from "@/env";
import {
  HUBSPOT_PREGEN_LISTS,
  type HubspotPregenCohort,
} from "@/lib/hubspot-pregen-lists";
import { db } from "@/server/db";
import {
  hubspotListMembershipTable,
  leadContactTable,
  leadDomainTable,
  leadImportTable,
} from "@/server/db/leads-schema";

const token = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");
const dryRun = process.argv.includes("--dry");

type HubspotContact = {
  id: string;
  properties: {
    email?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    jobtitle?: string | null;
    phone?: string | null;
  };
};

type AssociationResult = {
  from: { id: string };
  to: Array<{ toObjectId: number | string }>;
};

type Membership = {
  listId: string;
  listName: string;
  objectType: "company" | "contact";
  objectId: string;
  cohort: HubspotPregenCohort;
  domainId: string | null;
  contactId: string | null;
};

async function hubspot<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `HubSpot ${path} -> ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

async function listMemberIds(listId: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  do {
    const page = await hubspot<{
      results?: Array<{ recordId: string }>;
      paging?: { next?: { after?: string } };
    }>(
      `/crm/v3/lists/${listId}/memberships?limit=250${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    ids.push(...(page.results ?? []).map((row) => String(row.recordId)));
    after = page.paging?.next?.after;
  } while (after);
  return ids;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function readContacts(ids: string[]): Promise<HubspotContact[]> {
  const contacts: HubspotContact[] = [];
  for (const batch of chunks(ids, 100)) {
    const page = await hubspot<{ results?: HubspotContact[] }>(
      "/crm/v3/objects/contacts/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
          properties: ["email", "firstname", "lastname", "jobtitle", "phone"],
        }),
      },
    );
    contacts.push(...(page.results ?? []));
  }
  return contacts;
}

async function readContactCompanyAssociations(
  ids: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const batch of chunks(ids, 100)) {
    const page = await hubspot<{ results?: AssociationResult[] }>(
      "/crm/v4/associations/contacts/companies/batch/read",
      {
        method: "POST",
        body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
      },
    );
    for (const row of page.results ?? []) {
      map.set(
        String(row.from.id),
        row.to.map((target) => String(target.toObjectId)),
      );
    }
  }
  return map;
}

const companyIdsByCohort = new Map<HubspotPregenCohort, string[]>();
const contactIdsByCohort = new Map<HubspotPregenCohort, string[]>();

for (const cohort of Object.keys(
  HUBSPOT_PREGEN_LISTS,
) as HubspotPregenCohort[]) {
  const config = HUBSPOT_PREGEN_LISTS[cohort];
  companyIdsByCohort.set(cohort, await listMemberIds(config.company.id));
  contactIdsByCohort.set(cohort, await listMemberIds(config.contact.id));
}

const allCompanyIds = [...new Set([...companyIdsByCohort.values()].flat())];
const domainRows = await db
  .select({
    id: leadDomainTable.id,
    domain: leadDomainTable.domain,
    hubspotRecordId: leadDomainTable.hubspotRecordId,
  })
  .from(leadDomainTable)
  .where(inArray(leadDomainTable.hubspotRecordId, allCompanyIds));
const domainByCompanyId = new Map(
  domainRows
    .filter((row) => row.hubspotRecordId)
    .map((row) => [row.hubspotRecordId!, row]),
);

const allContactIds = [...new Set([...contactIdsByCohort.values()].flat())];
const [contacts, contactCompanies] = await Promise.all([
  readContacts(allContactIds),
  readContactCompanyAssociations(allContactIds),
]);
const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

const memberships: Membership[] = [];
const contactCandidates: Array<{
  hubspotContactId: string;
  domainId: string;
  domain: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  phone: string | null;
}> = [];
let ambiguousContactAssociations = 0;

for (const cohort of Object.keys(
  HUBSPOT_PREGEN_LISTS,
) as HubspotPregenCohort[]) {
  const config = HUBSPOT_PREGEN_LISTS[cohort];
  const cohortCompanyIds = new Set(companyIdsByCohort.get(cohort) ?? []);

  for (const objectId of cohortCompanyIds) {
    memberships.push({
      listId: config.company.id,
      listName: config.company.name,
      objectType: "company",
      objectId,
      cohort,
      domainId: domainByCompanyId.get(objectId)?.id ?? null,
      contactId: null,
    });
  }

  for (const objectId of contactIdsByCohort.get(cohort) ?? []) {
    const contact = contactById.get(objectId);
    const matchingCompanies = (contactCompanies.get(objectId) ?? []).filter(
      (companyId) => cohortCompanyIds.has(companyId),
    );
    if (matchingCompanies.length > 1) ambiguousContactAssociations += 1;
    const companyId = matchingCompanies[0];
    const domain = companyId ? domainByCompanyId.get(companyId) : undefined;
    const email = contact?.properties.email?.trim().toLowerCase();
    if (domain && email && contact) {
      contactCandidates.push({
        hubspotContactId: objectId,
        domainId: domain.id,
        domain: domain.domain,
        email,
        firstName: contact.properties.firstname?.trim() || null,
        lastName: contact.properties.lastname?.trim() || null,
        jobTitle: contact.properties.jobtitle?.trim() || null,
        phone: contact.properties.phone?.trim() || null,
      });
    }
    memberships.push({
      listId: config.contact.id,
      listName: config.contact.name,
      objectType: "contact",
      objectId,
      cohort,
      domainId: domain?.id ?? null,
      contactId: null,
    });
  }
}

const summary = {
  dryRun,
  companyMemberships: memberships.filter((m) => m.objectType === "company")
    .length,
  contactMemberships: memberships.filter((m) => m.objectType === "contact")
    .length,
  linkedCompanyMemberships: memberships.filter(
    (m) => m.objectType === "company" && m.domainId,
  ).length,
  linkedContactCandidates: contactCandidates.length,
  ambiguousContactAssociations,
};

console.log(JSON.stringify(summary, null, 2));
if (dryRun) process.exit(0);

// Drizzle's Neon HTTP driver has no transaction support. Each phase is
// deliberately chunked and idempotent so a failed run can be rerun safely.
const uniqueContactCandidates = [
  ...new Map(
    contactCandidates.map((candidate) => [
      `${candidate.domain}\u0000${candidate.email}`,
      candidate,
    ]),
  ).values(),
];

for (const batch of chunks(uniqueContactCandidates, 500)) {
  await db
    .insert(leadContactTable)
    .values(
      batch.map((candidate) => ({
        domainId: candidate.domainId,
        domain: candidate.domain,
        email: candidate.email,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle: candidate.jobTitle,
        phone: candidate.phone,
        hubspotContactId: candidate.hubspotContactId,
        source: "hubspot" as const,
        raw: { hubspotListImport: true },
      })),
    )
    .onConflictDoUpdate({
      target: [leadContactTable.domain, leadContactTable.email],
      set: {
        hubspotContactId: sql`excluded.hubspot_contact_id`,
        firstName: sql`coalesce(${leadContactTable.firstName}, excluded.first_name)`,
        lastName: sql`coalesce(${leadContactTable.lastName}, excluded.last_name)`,
        jobTitle: sql`coalesce(${leadContactTable.jobTitle}, excluded.job_title)`,
        phone: sql`coalesce(${leadContactTable.phone}, excluded.phone)`,
        updatedAt: new Date(),
      },
    });
}

const contactIdByHubspotId = new Map<string, string>();
for (const batch of chunks(
  uniqueContactCandidates.map((candidate) => candidate.hubspotContactId),
  500,
)) {
  const rows = await db
    .select({
      id: leadContactTable.id,
      hubspotContactId: leadContactTable.hubspotContactId,
    })
    .from(leadContactTable)
    .where(inArray(leadContactTable.hubspotContactId, batch));
  for (const row of rows) {
    if (row.hubspotContactId) {
      contactIdByHubspotId.set(row.hubspotContactId, row.id);
    }
  }
}

for (const batch of chunks(memberships, 500)) {
  await db
    .insert(hubspotListMembershipTable)
    .values(
      batch.map((membership) => ({
        ...membership,
        contactId:
          membership.objectType === "contact"
            ? (contactIdByHubspotId.get(membership.objectId) ?? null)
            : null,
      })),
    )
    .onConflictDoUpdate({
      target: [
        hubspotListMembershipTable.listId,
        hubspotListMembershipTable.objectId,
      ],
      set: {
        listName: sql`excluded.list_name`,
        objectType: sql`excluded.object_type`,
        cohort: sql`excluded.cohort`,
        domainId: sql`excluded.domain_id`,
        contactId: sql`excluded.contact_id`,
        importedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

for (const config of Object.values(HUBSPOT_PREGEN_LISTS)) {
  for (const list of [config.company, config.contact]) {
    const currentIds = memberships
      .filter((membership) => membership.listId === list.id)
      .map((membership) => membership.objectId);
    if (currentIds.length > 0) {
      await db.delete(hubspotListMembershipTable).where(
        and(
          eq(hubspotListMembershipTable.listId, list.id),
          sql`${hubspotListMembershipTable.objectId} not in (${sql.join(
            currentIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );
    }
  }
}

await db.insert(leadImportTable).values({
  filename: "hubspot-pregen-lists-3808-3809-3811-3812",
  source: "hubspot",
  rowCount: memberships.length,
  domainsSeen: new Set(
    memberships.flatMap((membership) =>
      membership.domainId ? [membership.domainId] : [],
    ),
  ).size,
  contactsUpdated: contactIdByHubspotId.size,
  notes: JSON.stringify(summary),
});

console.log("HubSpot pregen target-list projection is current.");
