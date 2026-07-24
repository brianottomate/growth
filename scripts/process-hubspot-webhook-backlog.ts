/**
 * Reconcile the safe, deterministic portion of the stored HubSpot webhook
 * backlog. Raw events are retained; "processed" means projected or explicitly
 * classified, never deleted.
 *
 * This intentionally leaves three categories pending:
 * - companies not yet linked to a Growth domain
 * - contact/company associations outside the imported target cohorts
 * - merges and association removals that require a current-state hydration
 *
 *   bun --conditions=react-server scripts/process-hubspot-webhook-backlog.ts
 *   bun --conditions=react-server scripts/process-hubspot-webhook-backlog.ts --apply
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

const apply = process.argv.includes("--apply");

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

// Collapse every subscribed company property to its latest event value, then
// project the fields Growth already models. Preserve the full property snapshot
// under enrichment.hubspotWebhook so currently-unmodeled fields are not lost.
await db.execute(sql`
  with latest as (
    select distinct on (object_id, property_name)
      object_id,
      property_name,
      property_value
    from leads.hubspot_webhook_event
    where processed_at is null
      and subscription_type = 'object.propertyChange'
      and object_type_id = '0-2'
      and property_name is not null
    order by object_id, property_name, occurred_at desc nulls last, id desc
  ),
  pivoted as (
    select object_id, jsonb_object_agg(property_name, property_value) as props
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
      nullif(pivoted.props ->> 'hubspot_owner_id', ''),
      domain.hubspot_owner
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

// The target-list import hydrated these exact contacts and their company links.
// Mark both directions of those association events as reconciled.
await db.execute(sql`
  update leads.hubspot_webhook_event as event
  set
    processed_at = now(),
    process_note = 'reconciled: target contact/company association'
  from leads.contact as contact, leads.domain as domain
  where event.processed_at is null
    and event.subscription_type = 'object.associationChange'
    and event.payload ->> 'associationType' in (
      'CONTACT_TO_COMPANY',
      'COMPANY_TO_CONTACT'
    )
    and contact.hubspot_contact_id = case
      when event.payload ->> 'fromObjectTypeId' = '0-1'
        then event.payload ->> 'fromObjectId'
      else event.payload ->> 'toObjectId'
    end
    and domain.hubspot_record_id = case
      when event.payload ->> 'fromObjectTypeId' = '0-2'
        then event.payload ->> 'fromObjectId'
      else event.payload ->> 'toObjectId'
    end
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
