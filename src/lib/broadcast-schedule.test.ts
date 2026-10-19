import { describe, expect, test } from "bun:test";
import { broadcastJobCanRun } from "./broadcast-schedule";
import { resolveZonedDateTime } from "./scheduling-time";

describe("broadcast delivery authorization", () => {
  const schedule = {
    state: "scheduled",
    dueAt: "2026-11-06T17:00:00.000Z",
    runtimeId: "preview",
  };
  const job = { dueAt: schedule.dueAt, runtimeId: "preview" };
  test("revoked or superseded queue messages cannot authorize a send", () => {
    expect(broadcastJobCanRun(schedule, job)).toBe(true);
    // A signed job can arrive before its queue receipt is persisted.
    expect(broadcastJobCanRun({ ...schedule, state: "approved" }, job)).toBe(
      true,
    );
    expect(broadcastJobCanRun({ ...schedule, state: "paused" }, job)).toBe(
      false,
    );
    expect(
      broadcastJobCanRun(
        { ...schedule, dueAt: "2026-11-13T17:00:00.000Z" },
        job,
      ),
    ).toBe(false);
    expect(
      broadcastJobCanRun(schedule, { ...job, runtimeId: "production" }),
    ).toBe(false);
    expect(broadcastJobCanRun(undefined, job)).toBe(false);
  });
  test("Winter Park's Friday time stays local across the fall clock change", () => {
    const before = resolveZonedDateTime({
      localDateTime: "2026-10-30T10:00",
      timeZone: "America/Denver",
    });
    const after = resolveZonedDateTime({
      localDateTime: "2026-11-06T10:00",
      timeZone: "America/Denver",
    });
    expect(before).toBe("2026-10-30T16:00:00.000Z");
    expect(after).toBe("2026-11-06T17:00:00.000Z");
  });
});
