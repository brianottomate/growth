import { describe, expect, test } from "bun:test";

import { getSeriesRunway } from "./series-runway";

const now = new Date("2026-08-05T10:00:00.000Z");

describe("series runway", () => {
  test("uses the fastest cross-post cadence", () => {
    expect(
      getSeriesRunway({
        now,
        cadence: [
          { count: 2, period: "week" },
          { count: 3, period: "month" },
        ],
        installments: [],
      }),
    ).toEqual({
      horizonDays: 14,
      required: 4,
      scheduled: 0,
      reserve: 0,
      shortfall: 4,
    });
  });

  test("keeps unscheduled drafts as reserve rather than coverage", () => {
    const runway = getSeriesRunway({
      now,
      cadence: [{ count: 1, period: "week" }],
      installments: [
        { status: "draft", plannedAt: new Date("2026-08-10T10:00:00Z") },
        { status: "approved", plannedAt: null },
        { status: "archived", plannedAt: null },
      ],
    });
    expect(runway?.scheduled).toBe(1);
    expect(runway?.reserve).toBe(1);
    expect(runway?.shortfall).toBe(1);
  });

  test("has no runway until cadence exists", () => {
    expect(getSeriesRunway({ now, cadence: [], installments: [] })).toBeNull();
  });
});
