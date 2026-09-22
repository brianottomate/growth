import { expect, test } from "bun:test";
import { resolveMetaSchedule, metaScheduleIssue } from "./meta-schedule";
const now = new Date("2026-09-22T12:00:00Z");
const future = new Date("2026-10-01T12:00:00Z");
test("daily campaigns can launch without dates and lifetime budgets need an end", () => {
  const schedule = resolveMetaSchedule({});
  expect(schedule).toEqual({ startAt: null, endAt: null });
  expect(metaScheduleIssue(schedule, "daily", now)).toBeNull();
  expect(metaScheduleIssue(schedule, "lifetime", now)).toContain("end date");
});
test("existing inherited dates survive unless operator explicitly chooses no schedule", () => {
  expect(
    resolveMetaSchedule({ campaignStartAt: now, campaignEndAt: future }),
  ).toEqual({ startAt: now, endAt: future });
  expect(
    resolveMetaSchedule({
      campaignStartAt: now,
      campaignEndAt: future,
      startWhenLaunched: true,
      runUntilPaused: true,
    }),
  ).toEqual({ startAt: null, endAt: null });
});
test("expired and reversed schedules cannot be pushed", () => {
  expect(
    metaScheduleIssue({ startAt: null, endAt: now }, "daily", now),
  ).toContain("future");
  expect(
    metaScheduleIssue(
      { startAt: new Date("2026-11-01"), endAt: future },
      "daily",
      now,
    ),
  ).toContain("after start");
  expect(
    metaScheduleIssue({ startAt: null, endAt: future }, "lifetime", now),
  ).toBeNull();
});
