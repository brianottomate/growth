import { beforeEach, describe, expect, test } from "bun:test";

import {
  findExistingDemandBdr,
  getAssignableDemandBdrs,
  getNextDemandBdr,
  resetDemandRoundRobin,
  type ResolvedBdr,
} from "./bdr-assignment.service";

const OUTREACH_OWNER: ResolvedBdr = {
  name: "Serrelle Baker",
  email: "serrelle.baker@wander.com",
  outreachUserId: "3",
  hubspotOwnerId: null,
};

describe("who works a demand lead (both CRMs written)", () => {
  test("Outreach's owner is authoritative over HubSpot's picker and CIO", () => {
    const result = findExistingDemandBdr({
      outreachActive: true,
      outreachOwner: OUTREACH_OWNER,
      hubspotDemandBdr: { ownerId: "81150805", email: "stacy@wander.com" },
      cioAssignment: { email: "james.crawford@wander.com", outreachId: "37" },
    });
    expect(result.source).toBe("outreach_owner");
    expect(result.bdr?.email).toBe("serrelle.baker@wander.com");
    // …and the HubSpot id is filled from the roster so the contact can be stamped.
    expect(result.bdr?.hubspotOwnerId).toBe("612529696");
  });

  test("with no Outreach owner, a roster rep in the HubSpot picker keeps the lead", () => {
    const result = findExistingDemandBdr({
      outreachActive: true,
      outreachOwner: null,
      hubspotDemandBdr: { ownerId: "81150805", email: null },
      cioAssignment: { email: "james.crawford@wander.com", outreachId: "37" },
    });
    expect(result.source).toBe("hubspot_demand__bdr");
    expect(result.bdr?.email).toBe("stacy@wander.com");
    expect(result.bdr?.outreachUserId).toBe("32");
  });

  test("a HubSpot-only rep never leaves the Outreach prospect ownerless", () => {
    // A rep set demand__bdr to someone Outreach cannot hold. Honouring it
    // would create an ownerless prospect, so the caller rotates instead.
    const result = findExistingDemandBdr({
      outreachActive: true,
      outreachOwner: null,
      hubspotDemandBdr: { ownerId: "999", email: "newrep@wander.com" },
      cioAssignment: { email: null, outreachId: null },
    });
    expect(result).toEqual({ bdr: null, source: "none" });
  });

  test("once Outreach is gone, a rep outside the roster is kept rather than reassigned", () => {
    const result = findExistingDemandBdr({
      outreachActive: false,
      hubspotDemandBdr: { ownerId: "999", email: "newrep@wander.com" },
    });
    expect(result.source).toBe("hubspot_demand__bdr");
    expect(result.bdr).toEqual({
      name: "newrep@wander.com",
      email: "newrep@wander.com",
      hubspotOwnerId: "999",
      outreachUserId: null,
    });
  });

  test("an off-roster picker is preserved even when demand_bdr_email is a stale roster address", () => {
    // The picker points at an off-roster owner (999); the sibling email field
    // still names a roster rep (Stacy). The picker wins — the lead must not be
    // silently reassigned to Stacy off the stale email.
    const result = findExistingDemandBdr({
      outreachActive: false,
      hubspotDemandBdr: { ownerId: "999", email: "stacy@wander.com" },
    });
    expect(result.source).toBe("hubspot_demand__bdr");
    expect(result.bdr?.hubspotOwnerId).toBe("999");
  });

  test("CIO's attributes are honoured before rotation when neither CRM has an owner", () => {
    const result = findExistingDemandBdr({
      outreachActive: true,
      hubspotDemandBdr: { ownerId: null, email: null },
      cioAssignment: { email: "james.crawford@wander.com", outreachId: null },
    });
    expect(result.source).toBe("cio_existing");
    expect(result.bdr?.hubspotOwnerId).toBe("82516259");
    expect(result.bdr?.outreachUserId).toBe("37");
  });

  test("a CIO rep Outreach cannot resolve rotates while Outreach is active, and is kept after", () => {
    const cioAssignment = { email: "departed@wander.com", outreachId: "41" };
    const rotated = findExistingDemandBdr({
      outreachActive: true,
      cioAssignment,
    });
    expect(rotated).toEqual({ bdr: null, source: "none" });

    const kept = findExistingDemandBdr({
      outreachActive: false,
      cioAssignment,
    });
    expect(kept.source).toBe("cio_existing");
    expect(kept.bdr?.email).toBe("departed@wander.com");
    expect(kept.bdr?.hubspotOwnerId).toBeNull();
  });

  test("nobody has the lead → none, so the caller rotates", () => {
    const result = findExistingDemandBdr({
      outreachActive: true,
      hubspotDemandBdr: null,
      cioAssignment: { email: null, outreachId: null },
    });
    expect(result).toEqual({ bdr: null, source: "none" });
  });
});

describe("demand rotation", () => {
  beforeEach(() => resetDemandRoundRobin());

  test("only BDRs with a HubSpot owner id can receive new leads", () => {
    for (const bdr of getAssignableDemandBdrs()) {
      expect(bdr.hubspotOwnerId).not.toBeNull();
      expect(bdr.active && bdr.assignNewLeads).toBe(true);
    }
  });

  test("phone and email-only leads rotate on independent indexes", () => {
    const pool = getAssignableDemandBdrs();
    if (pool.length < 2) return; // roster too small to observe rotation

    const withPhone = [getNextDemandBdr(true), getNextDemandBdr(true)];
    const emailOnly = getNextDemandBdr(false);

    expect(withPhone[0]?.email).toBe(pool[0]!.email);
    expect(withPhone[1]?.email).toBe(pool[1]!.email);
    // The email-only pool starts over rather than continuing the phone pool.
    expect(emailOnly?.email).toBe(pool[0]!.email);
  });
});
