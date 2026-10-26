import { expect, test } from "bun:test";

import {
  isDigestSizedLead,
  isInboundDigestHour,
  postsInboundAlertImmediately,
} from "./inbound-lead-digest";

test("the digest lists leads at 5 units or fewer and leads with no count", () => {
  expect(isDigestSizedLead(null)).toBe(true);
  expect(isDigestSizedLead(1)).toBe(true);
  expect(isDigestSizedLead(5)).toBe(true);
  expect(isDigestSizedLead(6)).toBe(false);
  expect(isDigestSizedLead(19)).toBe(false);
});

test("only leads above 5 units, with a meeting, already worked or resubmitted alert in real time", () => {
  const lead = {
    units: 5,
    meetingBooked: false,
    leadType: "New Inbound Lead" as const,
  };
  expect(postsInboundAlertImmediately(lead)).toBe(false);
  expect(postsInboundAlertImmediately({ ...lead, units: 0 })).toBe(false);
  expect(
    postsInboundAlertImmediately({ ...lead, leadType: "Inactive Lead" }),
  ).toBe(false);
  expect(
    postsInboundAlertImmediately({ ...lead, leadType: "Resubmission" }),
  ).toBe(true);
  expect(postsInboundAlertImmediately({ ...lead, units: 6 })).toBe(true);
  expect(postsInboundAlertImmediately({ ...lead, meetingBooked: true })).toBe(
    true,
  );
  expect(
    postsInboundAlertImmediately({ ...lead, leadType: "Active wOS Deal" }),
  ).toBe(true);
  expect(
    postsInboundAlertImmediately({ ...lead, leadType: "Closed Won wOS Deal" }),
  ).toBe(true);
  expect(
    postsInboundAlertImmediately({ ...lead, leadType: "Active Lead" }),
  ).toBe(true);
});

test("the digest fires once a day at 5pm Mountain across daylight saving", () => {
  // Summer (MDT, UTC-6): 23:00 UTC is 5pm, 00:00 UTC is 6pm.
  expect(isInboundDigestHour(new Date("2026-07-01T23:00:00Z"))).toBe(true);
  expect(isInboundDigestHour(new Date("2026-07-02T00:00:00Z"))).toBe(false);
  // Winter (MST, UTC-7): 23:00 UTC is 4pm, 00:00 UTC is 5pm.
  expect(isInboundDigestHour(new Date("2026-12-01T23:00:00Z"))).toBe(false);
  expect(isInboundDigestHour(new Date("2026-12-02T00:00:00Z"))).toBe(true);
});
