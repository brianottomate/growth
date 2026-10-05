import type { LeadData } from "@/server/services/outreach/field-mapping";
import { describe, expect, test } from "bun:test";
import {
  DEMAND_PROPERTY_NAMES,
  DEMAND_STAGES,
  mapLeadToDemandProps,
} from "./field-mapping";
const NOW = new Date("2026-09-14T15:00:00.000Z");
function lead(overrides: Partial<LeadData> = {}): LeadData {
  return {
    id_user: "usr_123",
    email: "guest@example.com",
    first_name: "Ada",
    last_name: "Lovelace",
    phone: "(555) 123-4567",
    webhook_event_type: "abandoned_cart",
    webhook_property_name: "Wander Broken Bow",
    webhook_checkin_date: "2026-10-01",
    webhook_checkout_date: "2026-10-05",
    webhook_checkout_amount: 4200,
    total_spend: 1234.5,
    count_confirmed_bookings: 2,
    ...overrides,
  };
}
describe("demand field mapping", () => {
  test("writes only demand_* properties, never a supply-side field", () => {
    const props = mapLeadToDemandProps(lead(), {
      bdr: {
        name: "Stacy Darko",
        email: "stacy@wander.com",
        hubspotOwnerId: "81150805",
      },
      newlyAssigned: true,
      now: NOW,
    });
    const keys = Object.keys(props);
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) {
      expect(key.startsWith("demand_")).toBe(true);
      expect((DEMAND_PROPERTY_NAMES as string[]).includes(key)).toBe(true);
    }
    expect(keys).not.toContain("hubspot_owner_id");
    expect(keys).not.toContain("inbound_date");
    expect(keys).not.toContain("bdr_for_rr");
  });
  test("a stage the BDR set is never regressed by a later abandonment", () => {
    const props = mapLeadToDemandProps(lead(), {
      existingStage: DEMAND_STAGES.BOOKED,
      now: NOW,
    });
    expect(props.demand_stage).toBeUndefined();
  });
  test("a booking event never re-attributes a BDR-assisted booking as direct", () => {
    const order = lead({
      webhook_event_type: "order_completed",
    });
    expect(
      mapLeadToDemandProps(order, {
        existingStage: DEMAND_STAGES.BOOKED,
        now: NOW,
      }).demand_stage,
    ).toBeUndefined();
    expect(
      mapLeadToDemandProps(order, {
        existingStage: "Booked OTA",
        now: NOW,
      }).demand_stage,
    ).toBeUndefined();
    // …but an unbooked pipeline stage does close to Booked Direct (Outreach parity).
    expect(
      mapLeadToDemandProps(order, {
        existingStage: "Invoice Sent",
        now: NOW,
      }).demand_stage,
    ).toBe(DEMAND_STAGES.BOOKED_DIRECT);
  });
  test("demand_signals preserves a BDR's manual pick and never clears on an eventless lead", () => {
    // A signal outside our map (a BDR ticked a box) survives, sorted last.
    const props = mapLeadToDemandProps(lead(), {
      existingSignals: ["manual_bdr_signal"],
      now: NOW,
    });
    expect(props.demand_signals).toBe("abandoned_cart;manual_bdr_signal");

    // No known event and no existing set → the property is omitted, so the
    // force-update can never wipe a set that is already on the contact.
    const empty = mapLeadToDemandProps(
      lead({
        webhook_event_type: null,
      }),
      {
        now: NOW,
      },
    );
    expect(empty.demand_signals).toBeUndefined();
  });
});
