import { expect, test } from "bun:test";
import {
  BOOKING_DEMAND_CONTEXT_LIMIT,
  bookingDemandContext,
  type BookingDemand,
  type BookingDemandSummary,
} from "./booking-demand";

const summary = (town: string | null): BookingDemandSummary => ({
  town,
  bookings: 228,
  profileMatched: 1,
  cityKnown: 1,
  stateKnown: 1,
  medianNights: 2,
  medianLeadDays: 19,
  cities: Array.from({ length: 30 }, () => ({
    city: "C".repeat(500),
    state: "S".repeat(500),
    country: "X".repeat(500),
    bookings: 3,
    share: 0.013,
  })),
  states: Array.from({ length: 30 }, () => ({
    state: "S".repeat(500),
    country: "X".repeat(500),
    bookings: 3,
    share: 0.013,
  })),
  checkinMonths: Array.from({ length: 24 }, (_, i) => ({
    month: String(i + 1),
    bookings: 19,
  })),
});
const demand: BookingDemand = {
  status: "available",
  source:
    "BigQuery direct-site confirmed bookings; current guest profile location",
  period: "Confirmed in past 12 months",
  scope: "Imported WanderOS homes on this brand's booking website",
  summaries: [
    summary(null),
    ...Array.from({ length: 30 }, (_, i) => summary(`Town ${i}`)),
  ],
};

test("large portfolios stay inside the context budget and preserve totals and coverage", () => {
  const escaped = {
    ...demand,
    summaries: demand.summaries.map((row) => ({
      ...row,
      cities: row.cities.map((origin) => ({
        ...origin,
        city: "\u0001".repeat(500),
        state: "\u0001".repeat(500),
        country: "\u0001".repeat(500),
      })),
      states: row.states.map((origin) => ({
        ...origin,
        state: "\u0001".repeat(500),
        country: "\u0001".repeat(500),
      })),
    })),
  };
  expect(bookingDemandContext(escaped).length).toBeLessThanOrEqual(
    BOOKING_DEMAND_CONTEXT_LIMIT,
  );
  const text = bookingDemandContext(demand);
  const parsed = JSON.parse(text) as BookingDemand;
  expect(text.length).toBeLessThanOrEqual(BOOKING_DEMAND_CONTEXT_LIMIT);
  expect(parsed.summaries.length).toBeLessThanOrEqual(7);
  expect(parsed.summaries[0]?.town).toBeNull();
  expect(parsed.summaries[0]?.bookings).toBe(228);
  expect(parsed.summaries[0]?.cityKnown).toBe(1);
  expect(
    parsed.summaries.every(
      (s) =>
        s.cities.length <= 5 &&
        s.states.length <= 5 &&
        s.checkinMonths.length <= 12,
    ),
  ).toBe(true);
});

test("context projects aggregate fields even when warehouse objects gain personal fields", () => {
  const withExtraFields = {
    ...demand,
    guestEmail: "private@example.test",
    summaries: [
      {
        ...summary(null),
        id_user: "private-user",
        cities: [
          {
            city: "Chicago",
            state: "IL",
            country: "US",
            bookings: 3,
            share: 0.013,
            email: "private@example.test",
          },
        ],
      },
    ],
  };
  const text = bookingDemandContext(withExtraFields);
  expect(text).not.toContain("private");
  expect(text).not.toContain("id_user");
  expect(text).toContain("Chicago");
});
