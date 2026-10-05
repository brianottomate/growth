import { describe, expect, test } from "bun:test";
import {
  findExistingDemandBdr,
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
      hubspotDemandBdr: {
        ownerId: "81150805",
        email: "stacy@wander.com",
      },
      cioAssignment: {
        email: "james.crawford@wander.com",
        outreachId: "37",
      },
    });
    expect(result.source).toBe("outreach_owner");
    expect(result.bdr?.email).toBe("serrelle.baker@wander.com");
    // …and the HubSpot id is filled from the roster so the contact can be stamped.
    expect(result.bdr?.hubspotOwnerId).toBe("612529696");
  });
  test("an off-roster picker is preserved even when demand_bdr_email is a stale roster address", () => {
    // The picker points at an off-roster owner (999); the sibling email field
    // still names a roster rep (Stacy). The picker wins — the lead must not be
    // silently reassigned to Stacy off the stale email.
    const result = findExistingDemandBdr({
      outreachActive: false,
      hubspotDemandBdr: {
        ownerId: "999",
        email: "stacy@wander.com",
      },
    });
    expect(result.source).toBe("hubspot_demand__bdr");
    expect(result.bdr?.hubspotOwnerId).toBe("999");
  });
});
