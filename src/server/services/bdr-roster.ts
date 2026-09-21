/**
 * Single source of truth for the demand-sales BDR pool.
 *
 * Both sinks derive their roster from this one list: the Outreach prospect
 * owner (`outreach/bdr-assignment.service.ts`) and the HubSpot contact
 * `demand__bdr` owner (`demand/bdr-assignment.service.ts`). Keep it here so a
 * join or a departure is a one-line edit instead of two arrays to hold in sync.
 *
 * Snapshotted from the Outreach BDR pool (2026-08-05) joined to HubSpot owners
 * (all four (re)invited to HubSpot 2026-09-14). `GET /api/lab/cio-to-hubspot?roster=1`
 * reports each entry's live HubSpot owner status.
 */
export interface BdrRosterEntry {
  name: string;
  email: string;
  /** Outreach user id for prospect ownership. */
  outreachUserId: string;
  /**
   * HubSpot owner id written to `demand__bdr`. Null when the person has no
   * HubSpot owner record yet — they can still be named on `demand_bdr_email`
   * but cannot be picked by rotation.
   */
  hubspotOwnerId: string | null;
  active: boolean;
  assignNewLeads: boolean;
}

export const BDR_ROSTER: BdrRosterEntry[] = [
  {
    name: "Serrelle Baker",
    email: "serrelle.baker@wander.com",
    outreachUserId: "3",
    hubspotOwnerId: "612529696",
    active: true,
    assignNewLeads: true,
  },
  {
    // Offboarded 2026-09-21 — kept here so leads she still owns resolve by
    // id/email while they're reassigned; assignNewLeads:false drops her from
    // rotation. The Outreach live-load picker (getNextBdrFromOutreachLoad) reads
    // Outreach directly and ignores this flag, so it only stops picking her once
    // her Outreach user is locked. Remove this entry once both are done.
    name: "Stacy Darko",
    email: "stacy@wander.com",
    outreachUserId: "32",
    hubspotOwnerId: "81150805",
    active: true,
    assignNewLeads: false,
  },
  {
    name: "Cate Hutcherson",
    email: "catherine@wander.com",
    outreachUserId: "33",
    hubspotOwnerId: "82516258",
    active: true,
    assignNewLeads: true,
  },
  {
    name: "James Crawford",
    email: "james.crawford@wander.com",
    outreachUserId: "37",
    hubspotOwnerId: "82516259",
    active: true,
    assignNewLeads: true,
  },
];
