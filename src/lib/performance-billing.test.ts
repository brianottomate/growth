import { describe, expect, test } from "bun:test";

import {
  currentPeriod,
  isSettled,
  lineLabel,
  periodLabel,
  type BillingSummary,
} from "./performance-billing";

describe("billing period", () => {
  test("keys the cycle by UTC month so a late-night US payment lands in the right month", () => {
    expect(currentPeriod(new Date("2026-09-30T23:30:00-07:00"))).toBe(
      "2026-10",
    );
    expect(currentPeriod(new Date("2026-09-15T12:00:00Z"))).toBe("2026-09");
    expect(periodLabel("2026-09")).toBe("Sep 2026");
  });
});

describe("billing lines", () => {
  const paid = new Date("2026-09-15T00:00:00Z");
  test("fee and media settle independently", () => {
    const summary: BillingSummary = {
      period: "2026-09",
      fee: { amount: 2500, paidAt: paid },
      media: { amount: 2500, paidAt: null },
      spend: 0,
    };
    expect(isSettled(summary)).toBe(false);
    expect(lineLabel(summary.fee)).toBe("$2,500 paid");
    expect(lineLabel(summary.media)).toBe("$2,500 open");
    expect(
      isSettled({ ...summary, media: { amount: 2500, paidAt: paid } }),
    ).toBe(true);
  });

  test("an unknown amount still reports its state", () => {
    expect(lineLabel({ amount: null, paidAt: null })).toBe("open");
    expect(lineLabel({ amount: null, paidAt: paid })).toBe("paid");
  });
});
