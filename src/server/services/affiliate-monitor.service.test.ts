import { describe, expect, it } from "bun:test";

import type { ImpactDayPerformance } from "@/server/clients/impact.client";

import { evaluateTrackingHealth } from "./affiliate-monitor.service";

// Newest-first series builder: [date, clicks, actions].
function series(rows: Array<[string, number, number]>): ImpactDayPerformance[] {
  return rows.map(([date, clicks, actions]) => ({
    date,
    clicks,
    actions,
    revenue: 0,
  }));
}

describe("evaluateTrackingHealth", () => {
  // The page that started this: actions go quiet all the time at ~1/day
  // (a Poisson zero day happens ~1 in 3). Zero actions must NEVER page —
  // slow conversion weeks belong to the weekly report.
  it("never pages on zero-action days while clicks are flowing", () => {
    const days = series([
      ["2026-08-11", 45, 0],
      ["2026-08-10", 65, 0],
      ["2026-08-09", 40, 0],
      ["2026-08-08", 44, 0],
      ["2026-08-07", 48, 0],
      ["2026-08-06", 47, 0],
      ["2026-08-05", 59, 0],
      ["2026-08-04", 59, 0],
      ["2026-08-03", 63, 0],
      ["2026-08-02", 61, 0],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });

  it("pages a tracking break on a single zero-click day against a healthy baseline", () => {
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
    expect(finding).not.toBeNull();
    expect(finding?.runStart).toBe("2026-08-11");
  });

  // Episode anchor = first day of the zero run, so a persisting break pages
  // once and then dedups while it continues.
  it("anchors a multi-day break on the run's first day", () => {
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
    expect(finding?.runStart).toBe("2026-08-09");
  });

  it("does not arm on a low-click program", () => {
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

  it("stays silent when the report is missing yesterday", () => {
    const days = series([
      ["2026-08-10", 65, 3],
      ["2026-08-09", 40, 0],
    ]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });

  it("stays silent with no baseline days at all", () => {
    const days = series([["2026-08-11", 0, 0]]);
    expect(evaluateTrackingHealth(days, "2026-08-11")).toBeNull();
  });
});
