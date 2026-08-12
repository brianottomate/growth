import { describe, expect, it } from "bun:test";

import type { ImpactDayPerformance } from "@/server/clients/impact.client";

import { evaluateTrackingHealth } from "./affiliate-monitor.service";

// Newest-first series builder: [date, clicks, actions].
function series(
  rows: Array<[string, number, number]>,
): ImpactDayPerformance[] {
  return rows.map(([date, clicks, actions]) => ({
    date,
    clicks,
    actions,
    revenue: 0,
  }));
}

describe("evaluateTrackingHealth", () => {
  // The page that started this: one zero-action day at a ~1/day baseline is
  // expected roughly a third of the time and must stay silent.
  it("stays silent on a single zero-action day at a ~1/day baseline", () => {
    const days = series([
      ["2026-08-11", 45, 0],
      ["2026-08-10", 65, 3],
      ["2026-08-09", 40, 0],
      ["2026-08-08", 44, 0],
      ["2026-08-07", 48, 0],
      ["2026-08-06", 47, 1],
      ["2026-08-05", 59, 2],
      ["2026-08-04", 59, 1],
      ["2026-08-03", 63, 0],
      ["2026-08-02", 61, 2],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });

  it("stays silent on a 3-day zero-action run at λ≈1 (run × λ < 4)", () => {
    const days = series([
      ["2026-08-09", 40, 0],
      ["2026-08-08", 44, 0],
      ["2026-08-07", 48, 0],
      ["2026-08-06", 47, 1],
      ["2026-08-05", 59, 2],
      ["2026-08-04", 59, 1],
      ["2026-08-03", 63, 0],
      ["2026-08-02", 61, 2],
      ["2026-08-01", 55, 1],
      ["2026-07-31", 50, 1],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-09")).toBeNull();
  });

  it("pages a conversion drought once run × baseline crosses the bar", () => {
    const days = series([
      ["2026-08-10", 45, 0],
      ["2026-08-09", 40, 0],
      ["2026-08-08", 44, 0],
      ["2026-08-07", 48, 0],
      ["2026-08-06", 47, 1],
      ["2026-08-05", 59, 2],
      ["2026-08-04", 59, 1],
      ["2026-08-03", 63, 0],
      ["2026-08-02", 61, 2],
      ["2026-08-01", 55, 1],
      ["2026-07-31", 50, 1],
    ]);
    const finding = evaluateTrackingHealth(days, "2026-08-10");
    expect(finding?.kind).toBe("conversion-drought");
    // Episode anchor = first day of the zero run, so the page fires once and
    // the same episode dedups as the run keeps growing.
    expect(finding?.runStart).toBe("2026-08-07");
  });

  it("pages a tracking break on a single zero-click day against a healthy click baseline", () => {
    const days = series([
      ["2026-08-11", 0, 0],
      ["2026-08-10", 65, 3],
      ["2026-08-09", 40, 0],
      ["2026-08-08", 44, 0],
      ["2026-08-07", 48, 0],
      ["2026-08-06", 47, 1],
      ["2026-08-05", 59, 2],
      ["2026-08-04", 59, 1],
    ]);
    const finding = evaluateTrackingHealth(days, "2026-08-11");
    expect(finding?.kind).toBe("tracking-break");
    expect(finding?.runStart).toBe("2026-08-11");
  });

  it("prefers the tracking-break signal when clicks and actions are both dead", () => {
    const days = series([
      ["2026-08-11", 0, 0],
      ["2026-08-10", 0, 0],
      ["2026-08-09", 0, 0],
      ["2026-08-08", 44, 0],
      ["2026-08-07", 48, 2],
      ["2026-08-06", 47, 1],
      ["2026-08-05", 59, 2],
      ["2026-08-04", 59, 1],
    ]);
    const finding = evaluateTrackingHealth(days, "2026-08-11");
    expect(finding?.kind).toBe("tracking-break");
    expect(finding?.runStart).toBe("2026-08-09");
  });

  it("does not arm the click signal on a low-click program", () => {
    const days = series([
      ["2026-08-11", 0, 0],
      ["2026-08-10", 2, 0],
      ["2026-08-09", 1, 0],
      ["2026-08-08", 3, 0],
      ["2026-08-07", 1, 0],
      ["2026-08-06", 2, 0],
      ["2026-08-05", 1, 0],
      ["2026-08-04", 2, 0],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });

  it("stays silent without enough baseline days", () => {
    const days = series([
      ["2026-08-11", 45, 0],
      ["2026-08-10", 50, 0],
      ["2026-08-09", 40, 0],
      ["2026-08-08", 44, 2],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });

  it("stays silent when the report is missing yesterday", () => {
    const days = series([
      ["2026-08-10", 65, 3],
      ["2026-08-09", 40, 0],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });

  it("stays silent when the whole window is zero-action (no baseline to judge against)", () => {
    const days = series([
      ["2026-08-11", 45, 0],
      ["2026-08-10", 50, 0],
      ["2026-08-09", 40, 0],
      ["2026-08-08", 44, 0],
      ["2026-08-07", 48, 0],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });
});
