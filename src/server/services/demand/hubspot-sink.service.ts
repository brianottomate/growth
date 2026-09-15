/**
 * Demand-sales HubSpot sink.
 *
 * The HubSpot half of `processLead`, kept deliberately stateless so it mirrors
 * the Outreach sink (search-by-email, then create or update). Two entry points
 * so the sync can read existing state (who already owns this lead) before it
 * decides what to write:
 *
 *   lookupDemandContact(email) → existing demand state or null
 *   writeDemandContact(...)    → create or force-update the contact
 *
 * Writes go through `updateContact`, never `upsertContact`: that helper is
 * fill-blank-only by design (it protects sales-edited fields), and every
 * property here is ours to overwrite. The `DemandContactProperties` type is
 * what guarantees "ours" — its keys are all `demand_*`. HubSpot failures are
 * left to the caller to log (non-fatal while Outreach is configured); nothing
 * is persisted here.
 */
import {
  createContact,
  findContactByEmail,
  getContactProperties,
  updateContact,
} from "@/server/clients/hubspot.client";
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
}

function toState(found: {
  id: string;
  values: Record<
    "email" | (typeof DEMAND_STATE_PROPERTIES)[number],
    string | null
  >;
}): DemandContactState {
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
  };
}

/**
 * Existing HubSpot contact for this email, with its demand state, found by
 * CRM search — the Outreach `searchProspectByEmail` equivalent. `null` when
 * the guest is new to us.
 */
export async function lookupDemandContact(
  email: string,
): Promise<DemandContactState | null> {
  const normalized = email.trim().toLowerCase();
  const found = await withHubspotRetry("findContactByEmail", () =>
    findContactByEmail(normalized, [...DEMAND_STATE_PROPERTIES]),
  );
  if (!found) return null;
  return toState({
    id: found.id,
    values: {
      email: found.values.email,
      demand_stage: found.values.demand_stage,
      demand__bdr: found.values.demand__bdr,
      demand_bdr_email: found.values.demand_bdr_email,
      demand_sync_count: found.values.demand_sync_count,
      demand_signals: found.values.demand_signals,
    },
  });
}

export interface WriteDemandContactParams {
  email: string;
  lead: LeadData;
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
 * Create the contact or force-write the `demand_*` payload onto it. Throws on
 * a HubSpot failure; the caller logs it (non-fatal while Outreach is the
 * system of record).
 */
export async function writeDemandContact(
  params: WriteDemandContactParams,
): Promise<WriteDemandContactResult> {
  const { email, lead, existing, bdr, newlyAssigned } = params;
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

  if (existing) {
    await withHubspotRetry("updateContact", () =>
      updateContact(existing.id, props),
    );
    return { action: "updated", contactId: existing.id, props };
  }

  try {
    // Never retried: a 5xx after commit would create a duplicate.
    const created = await createContact({
      ...mapLeadToContactIdentity(lead, normalized),
      ...props,
    });
    return { action: "created", contactId: created.id, props };
  } catch (error) {
    // Two episodes for one brand-new guest can race through "no contact
    // found" together, or the email may be a secondary address on a contact
    // search cannot see. HubSpot answers 409 with the id. That contact may be
    // BDR-worked, so re-read it and recompute the payload against its real
    // state instead of writing the new-contact one.
    const existingId = conflictingContactId(error);
    if (!existingId) throw error;
    const found = await withHubspotRetry("getContactProperties", () =>
      getContactProperties(existingId, ["email", ...DEMAND_STATE_PROPERTIES]),
    );
    const state = found ? toState(found) : null;
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
    return { action: "updated", contactId: existingId, props: recomputed };
  }
}
