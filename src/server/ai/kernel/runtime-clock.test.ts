import { describe, expect, test } from "bun:test";

import { runtimeClockSection } from "./runtime-clock";

describe("runtimeClockSection", () => {
  test("includes one UTC instant and the operator wall clock", () => {
    const result = runtimeClockSection({
      now: new Date("2026-08-11T09:47:00.000Z"),
      timeZone: "Europe/Oslo",
    });
    expect(result).toContain("2026-08-11T09:47:00.000Z");
    expect(result).toContain("Europe/Oslo");
    expect(result).toContain("Tuesday, 11 August 2026 at 11:47:00 CEST");
  });

  test("falls back to UTC for an invalid timezone", () => {
    expect(
      runtimeClockSection({
        now: new Date("2026-08-11T09:47:00.000Z"),
        timeZone: "not/a-zone",
      }),
    ).toContain("Operator timezone: UTC");
  });
});
