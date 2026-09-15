/**
 * Demand-sales HubSpot sink.
 *
 * The HubSpot half of `processLead`: find the guest's Contact, write the
 * `demand_*` payload, remember the record. Two entry points so the sync can
 * read existing state (who already owns this lead) before it decides what
 * to write:
 *
 *   lookupDemandContact(email) → existing demand state or null
 *   writeDemandContact(...)    → create or force-update, then link
 *
 * Writes go through `updateContact`, never `upsertContact`: that helper is
 * fill-blank-only by design (it protects sales-edited fields), and every
 * property here is ours to overwrite. The `DemandContactProperties` type is
 * what guarantees "ours" — its keys are all `demand_*`.
 */
import { eq, sql } from "drizzle-orm";

import {
  createContact,
  findContactByEmail,
  getContactProperties,
  updateContact,
} from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { demandCrmLinkTable } from "@/server/db/demand-schema";
import type { LeadData } from "@/server/services/outreach/field-mapping";

import type { ResolvedBdr } from "./bdr-assignment.service";
import { conflictingContactId, withHubspotRetry } from "./hubspot-errors";
import {
  DEMAND_STATE_PROPERTIES,
  mapLeadToContactIdentity,
  mapLeadToDemandProps,
  type DemandContactProperties,
} from "./field-mapping";

export interface DemandContactState {
  id: string;
  email: string | null;
  stage: string | null;
  bdrOwnerId: string | null;
  bdrEmail: string | null;
  syncCount: number | null;
  /** Current `demand_signals` set, parsed from the `;`-delimited value. */
  signals: string[];
  /** How the record was found — the link table is the cheap path. */
  foundVia: "link" | "search";
}

const STATE_PROPERTIES = ["email", ...DEMAND_STATE_PROPERTIES] as const;

function toState(
  found: {
    id: string;
    values: Record<(typeof STATE_PROPERTIES)[number], string | null>;
  },
  foundVia: DemandContactState["foundVia"],
): DemandContactState {
  const count = Number(found.values.demand_sync_count);
  return {
    id: found.id,
    email: found.values.email,
    stage: found.values.demand_stage,
    bdrOwnerId: found.values.demand__bdr,
    bdrEmail: found.values.demand_bdr_email,
    syncCount: Number.isFinite(count) ? count : null,
    signals: (found.values.demand_signals ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean),
    foundVia,
  };
}

/**
 * Existing HubSpot contact for this email, with its demand state. Tries the
 * remembered contact id first; falls back to CRM search when the lead is
 * new to us or the remembered record has gone (deleted / merged away).
 */
export async function lookupDemandContact(
  email: string,
): Promise<DemandContactState | null> {
  const normalized = email.trim().toLowerCase();

  const [link] = await db
    .select({ hubspotContactId: demandCrmLinkTable.hubspotContactId })
    .from(demandCrmLinkTable)
    .where(eq(demandCrmLinkTable.email, normalized))
    .limit(1);

  if (link?.hubspotContactId) {
    const found = await withHubspotRetry("getContactProperties", () =>
      getContactProperties(link.hubspotContactId!, [...STATE_PROPERTIES]),
    );
    if (found) return toState(found, "link");
    console.warn(
      `⚠️ [DemandSink] Linked contact ${link.hubspotContactId} for ${normalized} no longer exists — re-searching`,
    );
  }

  const found = await withHubspotRetry("findContactByEmail", () =>
    findContactByEmail(normalized, [...DEMAND_STATE_PROPERTIES]),
  );
  if (!found) return null;
  return toState(
    {
      id: found.id,
      values: {
        email: found.values.email,
        demand_stage: found.values.demand_stage,
        demand__bdr: found.values.demand__bdr,
        demand_bdr_email: found.values.demand_bdr_email,
        demand_sync_count: found.values.demand_sync_count,
        demand_signals: found.values.demand_signals,
      },
    },
    "search",
  );
}

export interface WriteDemandContactParams {
  email: string;
  lead: LeadData;
  eventType: string;
  existing: DemandContactState | null;
  bdr: ResolvedBdr | null;
  /** True when this sync chose the BDR (stamps `demand_assigned_at`). */
  newlyAssigned: boolean;
  dryRun?: boolean;
}

export interface WriteDemandContactResult {
  action: "created" | "updated" | "dry_run";
  contactId: string | null;
  props: DemandContactProperties;
}

/**
 * Create the contact or force-write the `demand_*` payload onto it, then
 * remember the mapping. A failure is recorded on the link row before it is
 * re-thrown so a stuck lead is visible without reading logs.
 */
export async function writeDemandContact(
  params: WriteDemandContactParams,
): Promise<WriteDemandContactResult> {
  const { email, lead, existing, bdr, newlyAssigned, eventType } = params;
  const normalized = email.trim().toLowerCase();

  const mappedBdr = bdr
    ? { name: bdr.name, email: bdr.email, hubspotOwnerId: bdr.hubspotOwnerId }
    : null;
  const props = mapLeadToDemandProps(lead, {
    bdr: mappedBdr,
    newlyAssigned,
    existingStage: existing ? existing.stage : undefined,
    existingSyncCount: existing?.syncCount ?? null,
    existingSignals: existing?.signals ?? null,
  });

  if (params.dryRun) {
    return { action: "dry_run", contactId: existing?.id ?? null, props };
  }

  try {
    let contactId: string;
    let action: WriteDemandContactResult["action"];
    if (existing) {
      await withHubspotRetry("updateContact", () =>
        updateContact(existing.id, props),
      );
      contactId = existing.id;
      action = "updated";
    } else {
      try {
        // Never retried: a 5xx after commit would create a duplicate.
        const created = await createContact({
          ...mapLeadToContactIdentity(lead, normalized),
          ...props,
        });
        contactId = created.id;
        action = "created";
      } catch (error) {
        // Two episodes for one brand-new guest can race through "no contact
        // found" together, or the email may be a secondary address on a
        // contact search cannot see. HubSpot answers 409 with the id. That
        // contact may be BDR-worked, so re-read it and recompute the payload
        // against its real state instead of writing the new-contact one.
        const existingId = conflictingContactId(error);
        if (!existingId) throw error;
        const found = await withHubspotRetry("getContactProperties", () =>
          getContactProperties(existingId, [...STATE_PROPERTIES]),
        );
        const state = found ? toState(found, "search") : null;
        const alreadyOwned = !!(state?.bdrOwnerId || state?.bdrEmail);
        console.warn(
          `⚠️ [DemandSink] ${normalized} already exists as ${existingId} (stage=${state?.stage ?? "-"}, owned=${alreadyOwned}) — updating instead`,
        );
        const recomputed = mapLeadToDemandProps(lead, {
          bdr: alreadyOwned ? null : mappedBdr,
          newlyAssigned: alreadyOwned ? false : newlyAssigned,
          existingStage: state ? state.stage : undefined,
          existingSyncCount: state?.syncCount ?? null,
          existingSignals: state?.signals ?? null,
        });
        await withHubspotRetry("updateContact", () =>
          updateContact(existingId, recomputed),
        );
        contactId = existingId;
        action = "updated";
      }
    }

    // The HubSpot write is done; the link row is an optimisation for the
    // next sync, so a failure here is logged rather than reported as a
    // failed lead.
    try {
      await rememberDemandLink({
        email: normalized,
        userId: lead.id_user ?? null,
        hubspotContactId: contactId,
        eventType,
        error: null,
      });
    } catch (linkError) {
      console.error(
        `⚠️ [DemandSink] HubSpot ${action} ${contactId} for ${normalized} but the link row failed`,
        linkError,
      );
    }

    return { action, contactId, props };
  } catch (error) {
    await rememberDemandLink({
      email: normalized,
      userId: lead.id_user ?? null,
      hubspotContactId: existing?.id ?? null,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    }).catch((linkError) => {
      console.error("⚠️ [DemandSink] Failed to record sync error", linkError);
    });
    throw error;
  }
}

/**
 * Record a HubSpot failure that happened before any write (the lookup), so
 * a dark shadow period is visible in `demand_crm_link.last_error` and not
 * only in logs.
 */
export async function recordDemandLinkError(params: {
  email: string;
  userId: string | null;
  eventType: string;
  error: unknown;
}): Promise<void> {
  await rememberDemandLink({
    email: params.email.trim().toLowerCase(),
    userId: params.userId,
    hubspotContactId: null,
    eventType: params.eventType,
    error:
      params.error instanceof Error
        ? params.error.message
        : String(params.error),
  });
}

async function rememberDemandLink(params: {
  email: string;
  userId: string | null;
  hubspotContactId: string | null;
  eventType: string;
  error: string | null;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(demandCrmLinkTable)
    .values({
      email: params.email,
      userId: params.userId,
      hubspotContactId: params.hubspotContactId,
      lastEventType: params.eventType,
      lastSyncedAt: params.error ? null : now,
      lastError: params.error,
      attemptCount: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: demandCrmLinkTable.email,
      set: {
        userId: sql`coalesce(excluded.user_id, ${demandCrmLinkTable.userId})`,
        hubspotContactId: sql`coalesce(excluded.hubspot_contact_id, ${demandCrmLinkTable.hubspotContactId})`,
        lastEventType: params.eventType,
        ...(params.error ? {} : { lastSyncedAt: now }),
        lastError: params.error,
        attemptCount: sql`${demandCrmLinkTable.attemptCount} + 1`,
        updatedAt: now,
      },
    });
}
