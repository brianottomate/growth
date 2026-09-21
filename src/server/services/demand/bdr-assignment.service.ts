/**
 * Demand-sales BDR assignment — HubSpot edition.
 *
 * Pure module: the roster, the dual-pool round robin, and the precedence
 * rule that decides which BDR a lead keeps or gets. No I/O, so the rule is
 * unit-testable and the sink just executes what it returns.
 *
 * Round-robin state is in-memory and resets on cold start, exactly like the
 * Outreach-era `getNextBdr`. Load-based selection (the PM side's deficit
 * rotation on `bdr_for_rr`) is a later step once `demand__bdr` has volume.
 */

import { BDR_ROSTER, type BdrRosterEntry } from "@/server/services/bdr-roster";

// =====================================================
// ROSTER
// =====================================================

/**
 * The roster lives in one place (`bdr-roster.ts`) so a join or departure is a
 * single edit shared with the Outreach sink. `DemandBdr` / `DEMAND_BDR_ROSTER`
 * are the names this sink and the lab routes read it under.
 */
export type DemandBdr = BdrRosterEntry;
export const DEMAND_BDR_ROSTER = BDR_ROSTER;

export function findDemandBdrByOwnerId(
  hubspotOwnerId: string | null | undefined,
): DemandBdr | null {
  if (!hubspotOwnerId) return null;
  return (
    DEMAND_BDR_ROSTER.find((bdr) => bdr.hubspotOwnerId === hubspotOwnerId) ??
    null
  );
}

export function findDemandBdrByEmail(
  email: string | null | undefined,
): DemandBdr | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  return (
    DEMAND_BDR_ROSTER.find((bdr) => bdr.email.toLowerCase() === normalized) ??
    null
  );
}

export function findDemandBdrByOutreachId(
  outreachUserId: string | null | undefined,
): DemandBdr | null {
  if (!outreachUserId) return null;
  return (
    DEMAND_BDR_ROSTER.find((bdr) => bdr.outreachUserId === outreachUserId) ??
    null
  );
}

// =====================================================
// ROUND ROBIN
// =====================================================

interface RotationState {
  emailPhoneIndex: number;
  emailOnlyIndex: number;
  totalAssignments: number;
}

let state: RotationState = {
  emailPhoneIndex: 0,
  emailOnlyIndex: 0,
  totalAssignments: 0,
};

/** BDRs rotation may hand a new lead to: active, taking leads, and in HubSpot. */
export function getAssignableDemandBdrs(): DemandBdr[] {
  return DEMAND_BDR_ROSTER.filter(
    (bdr) => bdr.active && bdr.assignNewLeads && bdr.hubspotOwnerId !== null,
  );
}

/**
 * Dual-pool round robin: leads with a phone number rotate through one index,
 * email-only leads through another, so each pool is distributed fairly.
 */
export function getNextDemandBdr(hasPhone: boolean): DemandBdr | null {
  const pool = getAssignableDemandBdrs();
  if (pool.length === 0) {
    console.warn("⚠️ [DemandBDR] No assignable BDRs in the roster");
    return null;
  }

  let index: number;
  if (hasPhone) {
    index = state.emailPhoneIndex % pool.length;
    state.emailPhoneIndex++;
  } else {
    index = state.emailOnlyIndex % pool.length;
    state.emailOnlyIndex++;
  }
  state.totalAssignments++;

  const bdr = pool[index]!;
  console.log(
    `👤 [DemandBDR] Assigned ${bdr.name} (pool: ${hasPhone ? "email+phone" : "email-only"}, index: ${index})`,
  );
  return bdr;
}

export function resetDemandRoundRobin(): void {
  state = { emailPhoneIndex: 0, emailOnlyIndex: 0, totalAssignments: 0 };
}

export function getDemandAssignmentStats(): RotationState & {
  assignable: number;
  roster: number;
} {
  return {
    ...state,
    assignable: getAssignableDemandBdrs().length,
    roster: DEMAND_BDR_ROSTER.length,
  };
}

// =====================================================
// PRECEDENCE
// =====================================================

/** A BDR as the sync resolved it, whichever system it came from. */
export interface ResolvedBdr {
  name: string;
  email: string;
  hubspotOwnerId: string | null;
  outreachUserId: string | null;
}

export type DemandAssignmentSource =
  | "outreach_owner"
  | "hubspot_demand__bdr"
  | "cio_existing"
  | "outreach_load"
  | "static_round_robin"
  | "rotation"
  | "none";

export interface DemandAssignmentInputs {
  /**
   * Whether Outreach is being written. While it is, every owner this returns
   * must be someone Outreach can hold, or the prospect ends up ownerless.
   */
  outreachActive: boolean;
  /** Owner already on the Outreach prospect. */
  outreachOwner?: ResolvedBdr | null;
  /** `demand__bdr` / `demand_bdr_email` already on the HubSpot contact. */
  hubspotDemandBdr?: { ownerId: string | null; email: string | null } | null;
  /**
   * Customer.io's `assigned_bdr_*` attributes. `resolved` is the caller's
   * lookup against the live Outreach user list (people outside the static
   * roster); when absent the roster is consulted instead.
   */
  cioAssignment?: {
    email: string | null;
    outreachId: string | null;
    resolved?: ResolvedBdr | null;
  } | null;
}

/**
 * Who already works this lead, if anyone.
 *
 *   Outreach owner → HubSpot demand__bdr → CIO attrs → (none: caller rotates)
 *
 * An existing owner is always preserved (a BDR who has started a
 * conversation keeps it). Both CRMs are written on every sync, so an owner
 * is only honoured if it can be represented in both: while Outreach is
 * active, a HubSpot picker value or CIO email that maps to nobody Outreach
 * knows falls through to rotation rather than leaving the prospect
 * ownerless. Once Outreach is gone (`outreachActive: false`) off-roster
 * reps are kept by id or email instead.
 */
export function findExistingDemandBdr(inputs: DemandAssignmentInputs): {
  bdr: ResolvedBdr | null;
  source: DemandAssignmentSource;
} {
  if (inputs.outreachOwner) {
    return {
      bdr: withRosterIds(inputs.outreachOwner),
      source: "outreach_owner",
    };
  }

  if (inputs.hubspotDemandBdr) {
    const { ownerId, email } = inputs.hubspotDemandBdr;
    // The picker is authoritative. `demand_bdr_email` is a sibling text field
    // that can drift (a rep changes the picker to an off-roster owner without
    // touching it), so it is consulted only when the picker itself is empty —
    // never as a fallback that could reassign an off-roster pick to whoever
    // the stale email happens to name.
    const roster = ownerId
      ? findDemandBdrByOwnerId(ownerId)
      : findDemandBdrByEmail(email);
    if (roster && (!inputs.outreachActive || roster.outreachUserId)) {
      return { bdr: toResolved(roster), source: "hubspot_demand__bdr" };
    }
    if (!inputs.outreachActive && (ownerId || email)) {
      // Someone outside the roster — preserve them rather than reassign.
      return {
        bdr: {
          name: email ?? `HubSpot owner ${ownerId}`,
          email: email ?? "",
          hubspotOwnerId: ownerId,
          outreachUserId: null,
        },
        source: "hubspot_demand__bdr",
      };
    }
  }

  if (inputs.cioAssignment) {
    if (inputs.cioAssignment.resolved) {
      return {
        bdr: withRosterIds(inputs.cioAssignment.resolved),
        source: "cio_existing",
      };
    }
    const roster =
      findDemandBdrByEmail(inputs.cioAssignment.email) ??
      findDemandBdrByOutreachId(inputs.cioAssignment.outreachId);
    if (roster && (!inputs.outreachActive || roster.outreachUserId)) {
      return { bdr: toResolved(roster), source: "cio_existing" };
    }

    const email = inputs.cioAssignment.email?.trim().toLowerCase();
    if (!inputs.outreachActive && email) {
      // Off-roster rep named on the CIO profile: keep them. The sink fills
      // the HubSpot owner id from the live owner list when it can.
      return {
        bdr: {
          name: email,
          email,
          hubspotOwnerId: null,
          outreachUserId: inputs.cioAssignment.outreachId,
        },
        source: "cio_existing",
      };
    }
  }

  return { bdr: null, source: "none" };
}

export function toResolved(bdr: DemandBdr): ResolvedBdr {
  return {
    name: bdr.name,
    email: bdr.email.toLowerCase(),
    hubspotOwnerId: bdr.hubspotOwnerId,
    outreachUserId: bdr.outreachUserId,
  };
}

/** Fill whichever CRM id is missing from the roster, matched by email. */
export function withRosterIds(bdr: ResolvedBdr): ResolvedBdr {
  if (bdr.hubspotOwnerId && bdr.outreachUserId) return bdr;
  const roster =
    findDemandBdrByEmail(bdr.email) ??
    findDemandBdrByOwnerId(bdr.hubspotOwnerId) ??
    findDemandBdrByOutreachId(bdr.outreachUserId);
  if (!roster) return bdr;
  return {
    ...bdr,
    hubspotOwnerId: bdr.hubspotOwnerId ?? roster.hubspotOwnerId,
    outreachUserId: bdr.outreachUserId ?? roster.outreachUserId,
  };
}
