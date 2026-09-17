import { describe, expect, test } from "bun:test";

import type { LeadData } from "@/server/services/outreach/field-mapping";

import {
  DEMAND_PROPERTY_NAMES,
  DEMAND_STAGES,
  mapLeadToContactIdentity,
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

  test("identity fields are separate from the demand payload and only used on create", () => {
    const identity = mapLeadToContactIdentity(lead(), "Guest@Example.com");
    expect(identity).toEqual({
      email: "guest@example.com",
      firstname: "Ada",
      lastname: "Lovelace",
      phone: "5551234567",
    });
  });

  test("a new contact starts at New; a direct booking lands at Booked Direct", () => {
    expect(mapLeadToDemandProps(lead(), { now: NOW }).demand_stage).toBe(
      DEMAND_STAGES.NEW,
    );
    expect(
      mapLeadToDemandProps(lead({ webhook_event_type: "order_completed" }), {
        existingStage: DEMAND_STAGES.NEW,
        now: NOW,
      }).demand_stage,
    ).toBe(DEMAND_STAGES.BOOKED_DIRECT);
  });

  test("a stage the BDR set is never regressed by a later abandonment", () => {
    const props = mapLeadToDemandProps(lead(), {
      existingStage: DEMAND_STAGES.BOOKED,
      now: NOW,
    });
    expect(props.demand_stage).toBeUndefined();
  });

  test("BDR assignment stamps the picker, the email, and the time only when new", () => {
    const bdr = {
      name: "Stacy Darko",
      email: "Stacy@wander.com",
      hubspotOwnerId: "81150805",
    };
    const fresh = mapLeadToDemandProps(lead(), {
      bdr,
      newlyAssigned: true,
      now: NOW,
    });
    expect(fresh.demand__bdr).toBe("81150805");
    expect(fresh.demand_bdr_email).toBe("stacy@wander.com");
    expect(fresh.demand_assigned_at).toBe(NOW.toISOString());

    const kept = mapLeadToDemandProps(lead(), {
      bdr,
      newlyAssigned: false,
      now: NOW,
    });
    expect(kept.demand_assigned_at).toBeUndefined();
  });

  test("a BDR without a HubSpot owner id clears the picker so a stale value cannot outrank the email", () => {
    const props = mapLeadToDemandProps(lead(), {
      bdr: {
        name: "Off Roster",
        email: "offroster@wander.com",
        hubspotOwnerId: null,
      },
      newlyAssigned: true,
      now: NOW,
    });
    expect(props.demand__bdr).toBe("");
    expect(props.demand_bdr_email).toBe("offroster@wander.com");
  });

  test("a booking event never re-attributes a BDR-assisted booking as direct", () => {
    const order = lead({ webhook_event_type: "order_completed" });
    expect(
      mapLeadToDemandProps(order, {
        existingStage: DEMAND_STAGES.BOOKED,
        now: NOW,
      }).demand_stage,
    ).toBeUndefined();
    expect(
      mapLeadToDemandProps(order, { existingStage: "Booked OTA", now: NOW })
        .demand_stage,
    ).toBeUndefined();
    // …but an unbooked pipeline stage does close to Booked Direct (Outreach parity).
    expect(
      mapLeadToDemandProps(order, { existingStage: "Invoice Sent", now: NOW })
        .demand_stage,
    ).toBe(DEMAND_STAGES.BOOKED_DIRECT);
  });

  test("sync count increments from the contact's current value", () => {
    expect(
      mapLeadToDemandProps(lead(), { existingSyncCount: 7, now: NOW })
        .demand_sync_count,
    ).toBe("8");
    expect(mapLeadToDemandProps(lead(), { now: NOW }).demand_sync_count).toBe(
      "1",
    );
  });

  test("checkout context reads like the Outreach note BDRs are used to", () => {
    const props = mapLeadToDemandProps(lead(), { now: NOW });
    expect(props.demand__note_2).toBe(
      "Abandoned Cart (Sep 14, 2026): Property: Wander Broken Bow | Check-in: 2026-10-01 | Check-out: 2026-10-05 | Amount: $4,200",
    );
    expect(props.demand_activity_tag).toBe("Abandoned Cart");
  });

  test("demand_signals maps the event and accumulates without duplicating", () => {
    // A single triggering event → its signal value.
    expect(mapLeadToDemandProps(lead(), { now: NOW }).demand_signals).toBe(
      "abandoned_cart",
    );
    // Renamed events map to the picker value, not the raw event token.
    expect(
      mapLeadToDemandProps(lead({ webhook_event_type: "user_signed_up" }), {
        now: NOW,
      }).demand_signals,
    ).toBe("new_signup");

    // The new event is unioned into the existing set; order follows the
    // manifest and an already-present signal is not duplicated.
    const props = mapLeadToDemandProps(lead(), {
      existingSignals: ["new_signup", "abandoned_cart"],
      now: NOW,
    });
    expect(props.demand_signals).toBe("new_signup;abandoned_cart");

    // An aggregated event_types string seeds every known signal at once.
    expect(
      mapLeadToDemandProps(
        lead({
          event_types: "user_signed_up,abandoned_search,checkout_started",
          webhook_event_type: "checkout_started",
        }),
        { now: NOW },
      ).demand_signals,
    ).toBe("new_signup;abandoned_search;checkout_started");
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
    const empty = mapLeadToDemandProps(lead({ webhook_event_type: null }), {
      now: NOW,
    });
    expect(empty.demand_signals).toBeUndefined();
  });

  test("abandoned search carries destination and a date range", () => {
    const props = mapLeadToDemandProps(
      lead({
        webhook_event_type: "abandoned_search",
        webhook_search_destination: "Joshua Tree",
        webhook_search_count: 3,
        webhook_last_search_date: "2026-09-13T10:00:00Z",
      }),
      { now: NOW },
    );
    expect(props.demand_last_search_destination).toBe("Joshua Tree");
    expect(props.demand_last_search_dates).toBe("2026-10-01 → 2026-10-05");
    expect(props.demand_search_count).toBe("3");
    expect(props.demand_last_search_at).toBe("2026-09-13");
  });
});
