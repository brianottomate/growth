import { NextResponse, after, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";

import { env } from "@/env";
import {
  companyHasDeals,
  getCompanyById,
  HS_OWNER_NAMES,
  type HubspotCompany,
} from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import {
  hubspotWebhookEventTable,
  leadDomainTable,
  type HubspotWebhookEventInsert,
} from "@/server/db/leads-schema";
import {
  applyContactPropertyChange,
  isMirroredContactProperty,
  mirrorContactById,
  normalizeDomain,
  softDeleteMirroredContact,
} from "@/server/services/hubspot-contact-mirror";

// HubSpot webhook receiver (private app "Operated", account 22480390).
//
// Accept-then-process: every event row is stored raw in
// leads.hubspot_webhook_event BEFORE anything is applied, so a processing bug
// can never lose an event, and HubSpot redeliveries dedupe on eventId. A
// light inline pass (via after()) refreshes lead_domain status/owner for
// companies the link pass already matched; everything else stays pending for
// the projection processor that lands with the full company backfill.
// See docs/leads-convergence-plan.md — sync design.

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // HubSpot rejects replays > 5 min

const COMPANY_OBJECT_TYPE_ID = "0-2"; // HubSpot's canonical company objectTypeId
const CONTACT_OBJECT_TYPE_ID = "0-1"; // ...and contact

/**
 * True for a company property-change event under either subscription model:
 * classic ("company.propertyChange") or expanded object support
 * ("object.propertyChange" + objectTypeId "0-2").
 */
function isCompanyPropertyChange(row: {
  subscriptionType: string;
  objectTypeId?: string | null;
}): boolean {
  if (row.subscriptionType === "company.propertyChange") return true;
  return (
    row.subscriptionType === "object.propertyChange" &&
    row.objectTypeId === COMPANY_OBJECT_TYPE_ID
  );
}

/** Contact equivalent of {@link isCompanyPropertyChange}. */
function isContactPropertyChange(row: {
  subscriptionType: string;
  objectTypeId?: string | null;
}): boolean {
  if (row.subscriptionType === "contact.propertyChange") return true;
  return (
    row.subscriptionType === "object.propertyChange" &&
    row.objectTypeId === CONTACT_OBJECT_TYPE_ID
  );
}

/** True for any subscription that names the contact object explicitly. */
function isContactEvent(
  row: { subscriptionType: string; objectTypeId?: string | null },
  action: "creation" | "deletion" | "merge",
): boolean {
  if (row.subscriptionType === `contact.${action}`) return true;
  return (
    row.subscriptionType === `object.${action}` &&
    row.objectTypeId === CONTACT_OBJECT_TYPE_ID
  );
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toInteger(value: string | null | undefined): number | null {
  if (!value) return null;
  const number = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? Math.round(number) : null;
}

function ownerName(ownerId: string | null | undefined): string | null {
  const normalized = clean(ownerId);
  return normalized ? (HS_OWNER_NAMES[normalized] ?? normalized) : null;
}

function companyProjection(company: HubspotCompany) {
  const values = company.values;
  const domain = normalizeDomain(values.domain);
  if (!domain) return null;
  const pms = clean(values.pms_ai_identified);
  return {
    domain,
    companyName: clean(values.name),
    city: clean(values.city),
    state: clean(values.state),
    country: clean(values.country),
    pms: pms && !/^your pms$/i.test(pms) ? pms : null,
    unitCount: toInteger(values.portfolio_size),
    pregenSiteUrl: clean(values.sites_preview_url),
    hubspotRecordId: company.id,
    hubspotLeadStatus: clean(values.hs_lead_status),
    hubspotOwner: ownerName(values.hubspot_owner_id),
    hubspotSyncedAt: new Date(),
    hubspotLastModifiedAt: new Date(),
    inHubspot: true,
    enrichment: {
      hubspot: {
        recordId: company.id,
        lifecycleStage: clean(values.lifecyclestage),
        inboundOutbound: clean(values.inbound_outbound),
        website: clean(values.website),
        pmCompany: clean(values.pm_company_),
        wwListingUrl: clean(values.ww_listing_url),
      },
    },
    updatedAt: new Date(),
  };
}

/**
 * HubSpot v3 signature: base64(HMAC-SHA256(method + uri + body + timestamp))
 * signed with the private app's client secret. The uri must match the target
 * URL configured in HubSpot exactly — we reconstruct it from
 * NEXT_PUBLIC_BASE_URL rather than trusting proxy headers.
 */
function verifyV3Signature(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
}): { valid: boolean; reason?: string } {
  const { rawBody, signature, timestamp, secret } = params;
  if (!signature) return { valid: false, reason: "missing signature header" };
  if (!timestamp) return { valid: false, reason: "missing timestamp header" };

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age > MAX_TIMESTAMP_SKEW_MS) {
    return { valid: false, reason: "timestamp too old" };
  }

  const uri = `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/hubspot`;
  const expected = createHmac("sha256", secret)
    .update(`POST${uri}${rawBody}${timestamp}`)
    .digest("base64");

  const actual = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actual.length !== expectedBuf.length) {
    return { valid: false, reason: "signature mismatch" };
  }
  try {
    return timingSafeEqual(actual, expectedBuf)
      ? { valid: true }
      : { valid: false, reason: "signature mismatch" };
  } catch {
    return { valid: false, reason: "signature comparison failed" };
  }
}

function parseEvents(rawBody: string): HubspotWebhookEventInsert[] {
  const parsed: unknown = JSON.parse(rawBody);
  if (!Array.isArray(parsed)) return [];

  const rows: HubspotWebhookEventInsert[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const eventId = asString(item.eventId);
    const subscriptionType = asString(item.subscriptionType);
    // objectId across event shapes: propertyChange/creation/deletion use
    // objectId; merge uses primaryObjectId; associationChange (generic model)
    // uses fromObjectId for the primary object.
    const objectId =
      asString(item.objectId) ??
      asString(item.primaryObjectId) ??
      asString(item.fromObjectId);
    if (!eventId || !subscriptionType || !objectId) {
      // Never drop silently — store-raw-first is the whole point. Surface the
      // shape so an unexpected payload is visible instead of lost.
      console.warn(
        "⚠️ [HubSpot Webhook] unparseable event skipped",
        JSON.stringify({
          hasEventId: Boolean(eventId),
          subscriptionType,
          keys: Object.keys(item),
        }),
      );
      continue;
    }

    const occurredAtMs = Number(item.occurredAt);
    rows.push({
      eventId,
      subscriptionType,
      objectTypeId: asString(item.objectTypeId),
      objectId,
      portalId: asString(item.portalId),
      propertyName: asString(item.propertyName),
      propertyValue: asString(item.propertyValue),
      changeSource: asString(item.changeSource),
      attemptNumber:
        typeof item.attemptNumber === "number" ? item.attemptNumber : 0,
      occurredAt: Number.isFinite(occurredAtMs) ? new Date(occurredAtMs) : null,
      payload: item,
    });
  }
  return rows;
}

/** Close out a raw event row. `processedAt` means projected *or* classified. */
async function markProcessed(eventId: string, processNote: string) {
  await db
    .update(hubspotWebhookEventTable)
    .set({ processedAt: new Date(), processNote })
    .where(eq(hubspotWebhookEventTable.eventId, eventId));
}

/**
 * Apply every subscribed company property to the compact HubSpot snapshot and
 * update the first-class fields Growth actually reads. This keeps the raw
 * event log lossless without allowing the pending queue to grow for already
 * linked companies. Contact events mirror onto `leads.contact` through
 * `hubspot-contact-mirror`, which the backfill script shares.
 */
async function applyInline(rows: HubspotWebhookEventInsert[]) {
  for (const row of rows) {
    try {
      if (row.subscriptionType === "object.associationChange") {
        const associationType = asString(row.payload.associationType);
        const removed = row.payload.associationRemoved === true;
        const fromType = asString(row.payload.fromObjectTypeId);
        const toType = asString(row.payload.toObjectTypeId);
        const companyId =
          fromType === COMPANY_OBJECT_TYPE_ID
            ? asString(row.payload.fromObjectId)
            : toType === COMPANY_OBJECT_TYPE_ID
              ? asString(row.payload.toObjectId)
              : null;

        if (
          companyId &&
          (associationType === "COMPANY_TO_DEAL" ||
            associationType === "DEAL_TO_COMPANY")
        ) {
          const hasDeals = removed ? await companyHasDeals(companyId) : true;
          const updated = await db
            .update(leadDomainTable)
            .set({
              hasHubspotDeal: hasDeals,
              hubspotSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(leadDomainTable.hubspotRecordId, companyId))
            .returning({ id: leadDomainTable.id });
          if (updated.length > 0) {
            await db
              .update(hubspotWebhookEventTable)
              .set({
                processedAt: new Date(),
                processNote: removed
                  ? `inline: reconciled current deal associations (${hasDeals ? "has deals" : "no deals"})`
                  : "inline: company has HubSpot deal",
              })
              .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
          } else {
            await db
              .update(hubspotWebhookEventTable)
              .set({
                processedAt: new Date(),
                processNote:
                  "classified: deal association has no domain projection",
              })
              .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
          }
          continue;
        }

        // A contact gaining or losing its company changes which lead_domain it
        // belongs to, so re-hydrate rather than patch. On removal HubSpot has
        // already dropped the association, so the mirror falls back to the
        // email host — which is usually the same company anyway.
        const contactId =
          fromType === CONTACT_OBJECT_TYPE_ID
            ? asString(row.payload.fromObjectId)
            : toType === CONTACT_OBJECT_TYPE_ID
              ? asString(row.payload.toObjectId)
              : null;

        if (
          contactId &&
          (associationType === "CONTACT_TO_COMPANY" ||
            associationType === "COMPANY_TO_CONTACT")
        ) {
          const { stats, found } = await mirrorContactById(contactId);
          await markProcessed(
            row.eventId,
            found
              ? `inline: re-linked contact after ${removed ? "removed" : "added"} company association (mirrored ${stats.mirrored}, unresolved ${stats.unresolvedDomain})`
              : "classified: contact association target no longer readable",
          );
          continue;
        }

        await markProcessed(
          row.eventId,
          "classified: association retained raw; no first-class projection",
        );
        continue;
      }

      if (
        row.subscriptionType === "object.merge" &&
        row.objectTypeId === COMPANY_OBJECT_TYPE_ID
      ) {
        await db
          .update(hubspotWebhookEventTable)
          .set({
            processedAt: new Date(),
            processNote:
              "classified: company merge retained raw; current properties arrive separately",
          })
          .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
        continue;
      }

      if (
        row.subscriptionType === "object.creation" &&
        row.objectTypeId === COMPANY_OBJECT_TYPE_ID
      ) {
        const company = await getCompanyById(row.objectId);
        const projection = company ? companyProjection(company) : null;
        if (!projection) {
          await db
            .update(hubspotWebhookEventTable)
            .set({
              processedAt: new Date(),
              processNote: company
                ? "classified: company creation missing domain"
                : "classified: company creation no longer readable",
            })
            .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
          continue;
        }

        await db
          .insert(leadDomainTable)
          .values(projection)
          .onConflictDoUpdate({
            target: leadDomainTable.domain,
            set: {
              companyName: sql`coalesce(excluded.company_name, ${leadDomainTable.companyName})`,
              city: sql`coalesce(excluded.city, ${leadDomainTable.city})`,
              state: sql`coalesce(excluded.state, ${leadDomainTable.state})`,
              country: sql`coalesce(excluded.country, ${leadDomainTable.country})`,
              pms: sql`coalesce(excluded.pms, ${leadDomainTable.pms})`,
              unitCount: sql`coalesce(excluded.unit_count, ${leadDomainTable.unitCount})`,
              pregenSiteUrl: sql`coalesce(excluded.pregen_site_url, ${leadDomainTable.pregenSiteUrl})`,
              hubspotRecordId: company!.id,
              hubspotLeadStatus: projection.hubspotLeadStatus,
              hubspotOwner: projection.hubspotOwner,
              hubspotSyncedAt: projection.hubspotSyncedAt,
              hubspotLastModifiedAt: projection.hubspotLastModifiedAt,
              inHubspot: true,
              enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb)
                || jsonb_build_object('hubspot', excluded.enrichment -> 'hubspot')`,
              updatedAt: new Date(),
            },
          });

        await db
          .update(hubspotWebhookEventTable)
          .set({
            processedAt: new Date(),
            processNote: "inline: hydrated newly created company",
          })
          .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
        continue;
      }

      if (isContactEvent(row, "creation")) {
        const { stats, found } = await mirrorContactById(row.objectId);
        await markProcessed(
          row.eventId,
          found
            ? stats.mirrored > 0
              ? "inline: mirrored newly created contact"
              : stats.noEmail > 0
                ? "classified: contact creation has no email"
                : "classified: contact creation has no resolvable lead_domain"
            : "classified: contact creation no longer readable",
        );
        continue;
      }

      if (isContactEvent(row, "deletion")) {
        const removed = await softDeleteMirroredContact(row.objectId);
        await markProcessed(
          row.eventId,
          removed > 0
            ? `inline: soft-deleted ${removed} mirrored contact row(s)`
            : "classified: contact deletion has no mirrored row",
        );
        continue;
      }

      if (isContactEvent(row, "merge")) {
        // The surviving record keeps the primary id; losers stop existing in
        // HubSpot. Soft-delete the losers so their Instantly linkage and
        // engagement history survive, then re-hydrate the survivor.
        const mergedIds = Array.isArray(row.payload.mergedObjectIds)
          ? row.payload.mergedObjectIds
              .map((id) => asString(id))
              .filter((id): id is string => Boolean(id) && id !== row.objectId)
          : [];
        let removed = 0;
        for (const loserId of mergedIds) {
          removed += await softDeleteMirroredContact(loserId);
        }
        const { found } = await mirrorContactById(row.objectId);
        await markProcessed(
          row.eventId,
          `inline: contact merge — soft-deleted ${removed} loser row(s), survivor ${found ? "re-hydrated" : "unreadable"}`,
        );
        continue;
      }

      if (isContactPropertyChange(row) && row.propertyName) {
        // `email` is the mirror's unique key and `associatedcompanyid` is its
        // domain link — changing either changes the row's identity, so a patch
        // in place would strand the old row. Re-hydrate instead.
        if (
          row.propertyName === "email" ||
          row.propertyName === "associatedcompanyid"
        ) {
          const { stats, found } = await mirrorContactById(row.objectId);
          await markProcessed(
            row.eventId,
            found
              ? `inline: re-hydrated contact after ${row.propertyName} change (mirrored ${stats.mirrored})`
              : "classified: contact no longer readable",
          );
          continue;
        }

        if (isMirroredContactProperty(row.propertyName)) {
          const updated = await applyContactPropertyChange({
            contactId: row.objectId,
            propertyName: row.propertyName,
            value: clean(row.propertyValue),
          });
          await markProcessed(
            row.eventId,
            updated > 0
              ? `inline: contact property ${row.propertyName} on ${updated} lead_contact row(s)`
              : "classified: contact property has no mirrored row",
          );
          continue;
        }

        await markProcessed(
          row.eventId,
          `classified: contact property ${row.propertyName} retained raw; not mirrored`,
        );
        continue;
      }

      if (!isCompanyPropertyChange(row) || !row.propertyName) continue;

      const value = clean(row.propertyValue);
      const occurredAt = row.occurredAt ?? new Date();
      const fieldUpdates: Partial<typeof leadDomainTable.$inferInsert> = {};
      switch (row.propertyName) {
        case "name":
          if (value) fieldUpdates.companyName = value;
          break;
        case "city":
          if (value) fieldUpdates.city = value;
          break;
        case "state":
          if (value) fieldUpdates.state = value;
          break;
        case "country":
          if (value) fieldUpdates.country = value;
          break;
        case "pms_ai_identified":
          if (value && !/^your pms$/i.test(value)) fieldUpdates.pms = value;
          break;
        case "portfolio_size": {
          const count = toInteger(value);
          if (count !== null) fieldUpdates.unitCount = count;
          break;
        }
        case "hs_lead_status":
          fieldUpdates.hubspotLeadStatus = value;
          break;
        case "hubspot_owner_id":
          fieldUpdates.hubspotOwner = ownerName(value);
          break;
        case "sites_preview_url":
          fieldUpdates.pregenSiteUrl = value;
          break;
        case "website_quality":
          fieldUpdates.websiteQuality = value;
          break;
      }

      const updated = await db
        .update(leadDomainTable)
        .set({
          ...fieldUpdates,
          hubspotSyncedAt: new Date(),
          hubspotLastModifiedAt: sql`greatest(
            coalesce(${leadDomainTable.hubspotLastModifiedAt}, ${occurredAt}),
            ${occurredAt}
          )`,
          enrichment: sql`jsonb_set(
            coalesce(${leadDomainTable.enrichment}, '{}'::jsonb),
            '{hubspotWebhook}',
            coalesce(${leadDomainTable.enrichment} -> 'hubspotWebhook', '{}'::jsonb)
              || jsonb_build_object(
                ${row.propertyName}::text,
                to_jsonb(${value}::text)
              ),
            true
          )`,
          updatedAt: new Date(),
        })
        .where(eq(leadDomainTable.hubspotRecordId, row.objectId))
        .returning({ id: leadDomainTable.id });

      if (updated.length > 0) {
        await db
          .update(hubspotWebhookEventTable)
          .set({
            processedAt: new Date(),
            processNote: `inline: company property ${row.propertyName} on ${updated.length} lead_domain row(s)`,
          })
          .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
      } else {
        await db
          .update(hubspotWebhookEventTable)
          .set({
            processedAt: new Date(),
            processNote:
              "classified: company property has no domain projection",
          })
          .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
      }
    } catch (error) {
      console.error(
        `❌ [HubSpot Webhook] inline apply failed (eventId=${row.eventId})`,
        error,
      );
    }
  }
}

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { success: false, error: "Unreadable body" },
      { status: 400 },
    );
  }

  if (env.HUBSPOT_WEBHOOK_CLIENT_SECRET) {
    const result = verifyV3Signature({
      rawBody,
      signature: request.headers.get("x-hubspot-signature-v3"),
      timestamp: request.headers.get("x-hubspot-request-timestamp"),
      secret: env.HUBSPOT_WEBHOOK_CLIENT_SECRET,
    });
    if (!result.valid) {
      console.error(`❌ [HubSpot Webhook] rejected: ${result.reason}`);
      return NextResponse.json(
        { success: false, error: "Invalid signature" },
        { status: 401 },
      );
    }
  } else {
    console.warn(
      "⚠️ [HubSpot Webhook] HUBSPOT_WEBHOOK_CLIENT_SECRET not set — accepting unverified events",
    );
  }

  let rows: HubspotWebhookEventInsert[];
  try {
    rows = parseEvents(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // Store raw first — this is the durability contract. Redeliveries no-op on
  // the eventId unique index.
  if (rows.length > 0) {
    await db
      .insert(hubspotWebhookEventTable)
      .values(rows)
      .onConflictDoNothing({ target: hubspotWebhookEventTable.eventId });
  }

  // Respond fast; apply the light pass after the response is sent.
  after(() => applyInline(rows));

  return NextResponse.json({ success: true, received: rows.length });
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "HubSpot webhook endpoint ready",
    webhookUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/hubspot`,
    signatureVerificationEnabled: Boolean(env.HUBSPOT_WEBHOOK_CLIENT_SECRET),
  });
}
