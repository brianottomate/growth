/**
 * Reconcile the safe, deterministic portion of the stored HubSpot webhook
 * backlog. Raw events are retained; "processed" means projected or explicitly
 * classified, never deleted.
 *
 * This intentionally leaves two categories pending:
 * - companies not yet linked to a Growth domain
 * - merges and association removals that require a current-state hydration
 *
 * Contacts (0-1) are reconciled by hydrating current HubSpot state rather than
 * replaying their property log — see the contact section below for why.
 *
 *   bun --conditions=react-server scripts/process-hubspot-webhook-backlog.ts
 *   bun --conditions=react-server scripts/process-hubspot-webhook-backlog.ts --apply
 */
import { sql } from "drizzle-orm";

import {
  companyHasDeals,
  HS_OWNER_NAMES,
} from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";
import {
  mirrorContactsByIds,
  softDeleteMirroredContacts,
} from "@/server/services/hubspot-contact-mirror";

const apply = process.argv.includes("--apply");
const ownerNamesJson = JSON.stringify(HS_OWNER_NAMES);

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeDomain(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  let domain = raw.toLowerCase();
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

function toInteger(value: unknown): number | null {
  const raw = clean(value);
  if (!raw) return null;
  const number = Number(raw.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? Math.round(number) : null;
}

async function pendingCount(): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::int as count
    from leads.hubspot_webhook_event
    where processed_at is null
  `);
  return Number(result.rows[0]?.count ?? 0);
}

const before = await pendingCount();
console.log(JSON.stringify({ apply, pendingBefore: before }, null, 2));
if (!apply) process.exit(0);

// The export predates the webhook receiver. Creation events since that export
// have a complete set of property-change events in the durable log, including
// domain. Materialize those companies first so the normal projection below can
// attach every property without an API crawl.
const missingCompanySnapshots = await db.execute<{
  object_id: string;
  props: Record<string, unknown>;
  latest_occurred_at: Date | string | null;
}>(sql`
  with latest as (
    select distinct on (event.object_id, event.property_name)
      event.object_id,
      event.property_name,
      event.property_value,
      event.occurred_at
    from leads.hubspot_webhook_event as event
    where event.processed_at is null
      and event.subscription_type = 'object.propertyChange'
      and event.object_type_id = '0-2'
      and event.property_name is not null
      and not exists (
        select 1
        from leads.domain as domain
        where domain.hubspot_record_id = event.object_id
      )
    order by
      event.object_id,
      event.property_name,
      event.occurred_at desc nulls last,
      event.id desc
  )
  select
    object_id,
    jsonb_object_agg(property_name, property_value) as props,
    max(occurred_at) as latest_occurred_at
  from latest
  group by object_id
  having nullif(jsonb_object_agg(property_name, property_value) ->> 'domain', '') is not null
`);

const missingValues = missingCompanySnapshots.rows.flatMap((snapshot) => {
  const domain = normalizeDomain(snapshot.props.domain);
  if (!domain) return [];
  const occurredAt = snapshot.latest_occurred_at
    ? new Date(snapshot.latest_occurred_at)
    : new Date();
  const ownerId = clean(snapshot.props.hubspot_owner_id);
  const pms = clean(snapshot.props.pms_ai_identified);
  return [
    {
      domain,
      companyName: clean(snapshot.props.name),
      city: clean(snapshot.props.city),
      state: clean(snapshot.props.state),
      country: clean(snapshot.props.country),
      pms: pms && !/^your pms$/i.test(pms) ? pms : null,
      unitCount: toInteger(snapshot.props.portfolio_size),
      hubspotRecordId: snapshot.object_id,
      hubspotLeadStatus: clean(snapshot.props.hs_lead_status),
      hubspotOwner: ownerId ? (HS_OWNER_NAMES[ownerId] ?? ownerId) : null,
      hubspotSyncedAt: new Date(),
      hubspotLastModifiedAt: occurredAt,
      inHubspot: true,
      enrichment: { hubspot: { webhookSnapshot: snapshot.props } },
      updatedAt: new Date(),
    },
  ];
});

for (let index = 0; index < missingValues.length; index += 500) {
  await db
    .insert(leadDomainTable)
    .values(missingValues.slice(index, index + 500))
    .onConflictDoNothing({ target: leadDomainTable.domain });
}

console.log(
  JSON.stringify({
    materializedCompaniesFromWebhook: missingValues.length,
  }),
);

// Collapse every subscribed company property to its latest event value, then
// project the fields Growth already models. Preserve the full property snapshot
// under enrichment.hubspotWebhook so currently-unmodeled fields are not lost.
await db.execute(sql`
  with latest as (
    select distinct on (object_id, property_name)
      object_id,
      property_name,
      property_value,
      occurred_at
    from leads.hubspot_webhook_event
    where processed_at is null
      and subscription_type = 'object.propertyChange'
      and object_type_id = '0-2'
      and property_name is not null
    order by object_id, property_name, occurred_at desc nulls last, id desc
  ),
  pivoted as (
    select
      object_id,
      jsonb_object_agg(property_name, property_value) as props,
      max(occurred_at) as latest_occurred_at
    from latest
    group by object_id
  )
  update leads.domain as domain
  set
    company_name = coalesce(
      nullif(pivoted.props ->> 'name', ''),
      domain.company_name
    ),
    city = coalesce(
      nullif(pivoted.props ->> 'city', ''),
      domain.city
    ),
    state = coalesce(
      nullif(pivoted.props ->> 'state', ''),
      nullif(pivoted.props ->> 'hs_state_code', ''),
      domain.state
    ),
    country = coalesce(
      nullif(pivoted.props ->> 'country', ''),
      nullif(pivoted.props ->> 'hs_country_code', ''),
      domain.country
    ),
    pms = coalesce(
      nullif(pivoted.props ->> 'pms_ai_identified', ''),
      domain.pms
    ),
    unit_count = coalesce(
      case
        when (pivoted.props ->> 'portfolio_size') ~ '^[0-9]+$'
          then (pivoted.props ->> 'portfolio_size')::int
      end,
      domain.unit_count
    ),
    hubspot_lead_status = coalesce(
      nullif(pivoted.props ->> 'hs_lead_status', ''),
      domain.hubspot_lead_status
    ),
    hubspot_owner = coalesce(
      ${ownerNamesJson}::jsonb ->> (pivoted.props ->> 'hubspot_owner_id'),
      nullif(pivoted.props ->> 'hubspot_owner_id', ''),
      domain.hubspot_owner
    ),
    hubspot_synced_at = now(),
    hubspot_last_modified_at = greatest(
      coalesce(domain.hubspot_last_modified_at, pivoted.latest_occurred_at),
      pivoted.latest_occurred_at
    ),
    enrichment = coalesce(domain.enrichment, '{}'::jsonb)
      || jsonb_build_object('hubspotWebhook', pivoted.props),
    updated_at = now()
  from pivoted
  where domain.hubspot_record_id = pivoted.object_id
`);

// Mark property and creation events only when their company is linked. Unlinked
// company events remain visible for a later full-universe backfill.
await db.execute(sql`
  update leads.hubspot_webhook_event as event
  set
    processed_at = now(),
    process_note = 'reconciled: linked company property snapshot'
  from leads.domain as domain
  where event.processed_at is null
    and event.subscription_type = 'object.propertyChange'
    and event.object_type_id = '0-2'
    and domain.hubspot_record_id = event.object_id
`);

await db.execute(sql`
  update leads.hubspot_webhook_event as event
  set
    processed_at = now(),
    process_note = 'reconciled: company already linked'
  from leads.domain as domain
  where event.processed_at is null
    and event.subscription_type = 'object.creation'
    and event.object_type_id = '0-2'
    and domain.hubspot_record_id = event.object_id
`);

// A current or historical deal is a positive guard signal. Additions can safely
// set the flag true; removals need current-state hydration before clearing it.
await db.execute(sql`
  update leads.domain as domain
  set has_hubspot_deal = true, updated_at = now()
  from leads.hubspot_webhook_event as event
  where event.processed_at is null
    and event.subscription_type = 'object.associationChange'
    and event.payload ->> 'associationType' in (
      'COMPANY_TO_DEAL',
      'DEAL_TO_COMPANY'
    )
    and event.payload ->> 'associationRemoved' = 'false'
    and domain.hubspot_record_id = case
      when event.payload ->> 'fromObjectTypeId' = '0-2'
        then event.payload ->> 'fromObjectId'
      else event.payload ->> 'toObjectId'
    end
`);

await db.execute(sql`
  update leads.hubspot_webhook_event as event
  set
    processed_at = now(),
    process_note = 'reconciled: company has HubSpot deal'
  from leads.domain as domain
  where event.processed_at is null
    and event.subscription_type = 'object.associationChange'
    and event.payload ->> 'associationType' in (
      'COMPANY_TO_DEAL',
      'DEAL_TO_COMPANY'
    )
    and event.payload ->> 'associationRemoved' = 'false'
    and domain.hubspot_record_id = case
      when event.payload ->> 'fromObjectTypeId' = '0-2'
        then event.payload ->> 'fromObjectId'
      else event.payload ->> 'toObjectId'
    end
`);

// A removal event cannot safely clear the flag by itself because another deal
// may still be associated. Hydrate current association state for the small set
// of affected companies, then mark both direction events together.
const dealRemovalCompanies = await db.execute<{ company_id: string }>(sql`
  select distinct
    case
      when payload ->> 'fromObjectTypeId' = '0-2'
        then payload ->> 'fromObjectId'
      else payload ->> 'toObjectId'
    end as company_id
  from leads.hubspot_webhook_event
  where processed_at is null
    and subscription_type = 'object.associationChange'
    and payload ->> 'associationType' in (
      'COMPANY_TO_DEAL',
      'DEAL_TO_COMPANY'
    )
    and payload ->> 'associationRemoved' = 'true'
`);

for (const row of dealRemovalCompanies.rows) {
  const hasDeals = await companyHasDeals(row.company_id);
  await db
    .update(leadDomainTable)
    .set({
      hasHubspotDeal: hasDeals,
      hubspotSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(sql`${leadDomainTable.hubspotRecordId} = ${row.company_id}`);

  await db.execute(sql`
    update leads.hubspot_webhook_event
    set
      processed_at = now(),
      process_note = ${`reconciled: current deal associations (${hasDeals ? "has deals" : "no deals"})`}
    where processed_at is null
      and subscription_type = 'object.associationChange'
      and payload ->> 'associationType' in (
        'COMPANY_TO_DEAL',
        'DEAL_TO_COMPANY'
      )
      and payload ->> 'associationRemoved' = 'true'
      and case
        when payload ->> 'fromObjectTypeId' = '0-2'
          then payload ->> 'fromObjectId'
        else payload ->> 'toObjectId'
      end = ${row.company_id}
  `);
}

// ---- CONTACTS (0-1) ------------------------------------------------
//
// Companies above replay their property log, because company property events
// arrive complete and a company's identity never moves. Contacts take the
// opposite approach: hydrate current HubSpot state and let the mirror upsert
// decide.
//
// The reason is that two of the mirrored contact fields — email and
// associatedcompanyid — *are* the row's identity. Replaying them out of a log
// can point a contact at a company it has since left, and the old fast-path
// here did exactly that: it marked association events reconciled whenever the
// contact and company were both known, without checking that the contact's
// domain link actually agreed. Re-reading is one batch call per 100 contacts
// and cannot go stale.
//
// Deletions are the exception: there is nothing left to read.

const contactSurvivors = new Set<string>();
const contactMergeLosers = new Set<string>();

const contactMerges = await db.execute<{
  object_id: string;
  merged_ids: string[] | null;
}>(sql`
  select
    object_id,
    case
      when jsonb_typeof(payload -> 'mergedObjectIds') = 'array'
        then array(
          select jsonb_array_elements_text(payload -> 'mergedObjectIds')
        )
    end as merged_ids
  from leads.hubspot_webhook_event
  where processed_at is null
    and subscription_type = 'object.merge'
    and object_type_id = '0-1'
`);

for (const row of contactMerges.rows) {
  contactSurvivors.add(row.object_id);
  for (const loserId of row.merged_ids ?? []) {
    contactMergeLosers.add(loserId);
  }
}
// HubSpot lists the survivor among mergedObjectIds; never soft-delete the row
// that survived the merge.
for (const survivor of contactSurvivors) contactMergeLosers.delete(survivor);

const contactDeletions = await db.execute<{ object_id: string }>(sql`
  select distinct object_id
  from leads.hubspot_webhook_event
  where processed_at is null
    and subscription_type = 'object.deletion'
    and object_type_id = '0-1'
`);

// Every pending event that names a contact, whether it named it directly or as
// one side of a company association.
const contactsToHydrate = await db.execute<{ contact_id: string | null }>(sql`
  select distinct contact_id from (
    select object_id as contact_id
    from leads.hubspot_webhook_event
    where processed_at is null
      and object_type_id = '0-1'
      and subscription_type in (
        'object.creation',
        'object.propertyChange',
        'object.merge'
      )
    union
    select case
      when payload ->> 'fromObjectTypeId' = '0-1'
        then payload ->> 'fromObjectId'
      else payload ->> 'toObjectId'
    end as contact_id
    from leads.hubspot_webhook_event
    where processed_at is null
      and subscription_type = 'object.associationChange'
      and payload ->> 'associationType' in (
        'CONTACT_TO_COMPANY',
        'COMPANY_TO_CONTACT'
      )
  ) as ids
  where contact_id is not null
`);

const hydrateIds = contactsToHydrate.rows
  .map((row) => row.contact_id)
  .filter((id): id is string => Boolean(id))
  .filter((id) => !contactMergeLosers.has(id));

const contactMirror = await mirrorContactsByIds(hydrateIds);

// Anything HubSpot would not return is gone, whichever way we learned it.
const goneContactIds = [
  ...contactDeletions.rows.map((row) => row.object_id),
  ...contactMergeLosers,
  ...contactMirror.missingIds,
];
const softDeletedContacts = await softDeleteMirroredContacts(goneContactIds);

console.log(
  JSON.stringify({
    contactsHydrated: contactMirror.stats.mirrored,
    contactsSkippedNoEmail: contactMirror.stats.noEmail,
    contactsSkippedUnresolvedDomain: contactMirror.stats.unresolvedDomain,
    contactsGoneFromHubspot: contactMirror.missingIds.length,
    contactRowsSoftDeleted: softDeletedContacts,
  }),
);

// Deletions and merges are unambiguous, so they are noted first and exactly.
await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note = 'reconciled: contact deleted; mirror row soft-deleted'
  where processed_at is null
    and object_type_id = '0-1'
    and subscription_type = 'object.deletion'
`);

await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note =
      'reconciled: contact merge; survivor re-hydrated, losers soft-deleted'
  where processed_at is null
    and object_type_id = '0-1'
    and subscription_type = 'object.merge'
`);

// For the rest, "processed" must not overstate what happened. A contact only
// counts as hydrated if it actually has a live mirror row; a contact HubSpot
// has no email for, or whose company resolves to no Growth domain, is a known
// model limitation rather than a projection we can claim.
await db.execute(sql`
  update leads.hubspot_webhook_event as event
  set
    processed_at = now(),
    process_note = 'reconciled: contact hydrated from current HubSpot state'
  from leads.contact as contact
  where event.processed_at is null
    and contact.deleted_at is null
    and contact.hubspot_contact_id = case
      when event.object_type_id = '0-1' then event.object_id
      when event.payload ->> 'fromObjectTypeId' = '0-1'
        then event.payload ->> 'fromObjectId'
      else event.payload ->> 'toObjectId'
    end
    and (
      (
        event.object_type_id = '0-1'
        and event.subscription_type in (
          'object.creation',
          'object.propertyChange'
        )
      )
      or (
        event.subscription_type = 'object.associationChange'
        and event.payload ->> 'associationType' in (
          'CONTACT_TO_COMPANY',
          'COMPANY_TO_CONTACT'
        )
      )
    )
`);

await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note =
      'classified: contact not mirrored (no email, no resolvable Growth domain, or gone from HubSpot)'
  where processed_at is null
    and (
      (
        object_type_id = '0-1'
        and subscription_type in ('object.creation', 'object.propertyChange')
      )
      or (
        subscription_type = 'object.associationChange'
        and payload ->> 'associationType' in (
          'CONTACT_TO_COMPANY',
          'COMPANY_TO_CONTACT'
        )
      )
    )
`);

// Parent/child company associations still have no first-class projection. They
// are retained losslessly in the raw event log; classify them instead of
// presenting them as a failed company-sync backlog.
await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note = 'classified: association retained raw; no first-class projection'
  where processed_at is null
    and subscription_type = 'object.associationChange'
    and payload ->> 'associationType' = 'COMPANY_TO_COMPANY'
`);

// Engagement association events have no row-level projection in Growth today.
// Classify them explicitly while retaining the full raw payload for analytics.
await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note = 'classified: engagement association retained raw'
  where processed_at is null
    and subscription_type = 'object.associationChange'
    and payload ->> 'associationType' in (
      'COMPANY_TO_EMAIL',
      'EMAIL_TO_COMPANY',
      'CALL_TO_COMPANY',
      'COMPANY_TO_CALL',
      'COMPANY_TO_TASK',
      'TASK_TO_COMPANY',
      'COMPANY_TO_MEETING_EVENT',
      'MEETING_EVENT_TO_COMPANY',
      'COMPANY_TO_NOTE',
      'NOTE_TO_COMPANY',
      'COMPANY_TO_COMMUNICATION',
      'COMMUNICATION_TO_COMPANY'
    )
`);

// A domain-keyed projection cannot represent two HubSpot company records that
// share a domain, or a company with no domain. Keep the payloads, classify the
// exception, and make the queue mean "actionable" rather than "known model
// limitation." The import audit reports these counts separately.
await db.execute(sql`
  update leads.hubspot_webhook_event as event
  set
    processed_at = now(),
    process_note = 'classified: company creation has duplicate or missing domain'
  where event.processed_at is null
    and event.subscription_type = 'object.creation'
    and event.object_type_id = '0-2'
`);

await db.execute(sql`
  update leads.hubspot_webhook_event as event
  set
    processed_at = now(),
    process_note = 'classified: company property belongs to duplicate or missing domain'
  where event.processed_at is null
    and event.subscription_type = 'object.propertyChange'
    and event.object_type_id = '0-2'
    and exists (
      select 1
      from leads.hubspot_webhook_event as creation
      where creation.object_id = event.object_id
        and creation.subscription_type = 'object.creation'
        and creation.object_type_id = '0-2'
        and creation.process_note =
          'classified: company creation has duplicate or missing domain'
    )
`);

await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note =
      'classified: company merge retained raw; current properties projected separately'
  where processed_at is null
    and subscription_type = 'object.merge'
    and object_type_id = '0-2'
`);

await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note = 'classified: company property has no domain projection'
  where processed_at is null
    and subscription_type = 'object.propertyChange'
    and object_type_id = '0-2'
`);

await db.execute(sql`
  update leads.hubspot_webhook_event
  set
    processed_at = now(),
    process_note = 'classified: deal association has no domain projection'
  where processed_at is null
    and subscription_type = 'object.associationChange'
    and payload ->> 'associationType' in (
      'COMPANY_TO_DEAL',
      'DEAL_TO_COMPANY'
    )
`);

const after = await pendingCount();
console.log(
  JSON.stringify(
    {
      pendingBefore: before,
      pendingAfter: after,
      processedThisRun: before - after,
    },
    null,
    2,
  ),
);
