import { describe, expect, test } from "bun:test";
import {
  broadcastCanEnterProviderHandoff,
  broadcastCanPause,
  broadcastCanRecover,
  broadcastJobCanRun,
  broadcastQueueReceiptCanAttach,
  broadcastScheduleApprovalInput,
  shouldPauseSupersededBroadcast,
  shouldPersistBroadcastJobFailure,
} from "./broadcast-schedule";
import { resolveZonedDateTime } from "./scheduling-time";

describe("broadcast delivery authorization", () => {
  const schedule = {
    state: "scheduled",
    dueAt: "2026-11-06T17:00:00.000Z",
    runtimeId: "preview",
    customerIoStopped: true as const,
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
    expect(
      broadcastJobCanRun(
        {
          state: "scheduled",
          dueAt: schedule.dueAt,
          runtimeId: schedule.runtimeId,
        },
        job,
      ),
    ).toBe(false);
  });

  test("schedule approval requires the exact Customer.io cutover acknowledgement", () => {
    const input = {
      brandId: "brand",
      timeZone: "America/Denver",
      sends: [
        {
          messageSendId: "send",
          scheduledAt: "2026-11-06T17:00:00.000Z",
        },
      ],
      reviewedHash: "reviewed",
    };
    expect(
      broadcastScheduleApprovalInput.safeParse({
        ...input,
        customerIoStopped: true,
      }).success,
    ).toBe(true);
    expect(broadcastScheduleApprovalInput.safeParse(input).success).toBe(false);
    expect(
      broadcastScheduleApprovalInput.safeParse({
        ...input,
        customerIoStopped: false,
      }).success,
    ).toBe(false);
  });

  test("pause and provider handoff have one deterministic winner", () => {
    const approved = { status: "approved", schedule };
    expect(broadcastCanPause(approved)).toBe(true);
    expect(broadcastCanEnterProviderHandoff(approved, job)).toBe(true);

    // Pause wins the row lock first: the provider claim can no longer run.
    const paused = {
      status: "approved",
      schedule: { ...schedule, state: "paused" },
    };
    expect(broadcastCanPause(paused)).toBe(false);
    expect(broadcastCanEnterProviderHandoff(paused, job)).toBe(false);

    // Provider claim wins the row lock first: pause cannot report success.
    const sending = { status: "sending", schedule };
    expect(broadcastCanPause(sending)).toBe(false);
    expect(broadcastCanEnterProviderHandoff(sending, job)).toBe(false);
  });

  test("recovery requires an active acknowledged schedule for this runtime", () => {
    expect(
      broadcastCanRecover({ status: "approved", schedule }, "preview"),
    ).toBe(true);
    expect(
      broadcastCanRecover(
        {
          status: "approved",
          schedule: { ...schedule, customerIoStopped: undefined },
        },
        "preview",
      ),
    ).toBe(false);
    expect(
      broadcastCanRecover(
        {
          status: "approved",
          schedule: { ...schedule, dueAt: "not-a-date" },
        },
        "preview",
      ),
    ).toBe(false);
    expect(
      broadcastCanRecover(
        {
          status: "approved",
          schedule: { ...schedule, state: "paused" },
        },
        "preview",
      ),
    ).toBe(false);
    expect(
      broadcastCanRecover({ status: "approved", schedule }, "production"),
    ).toBe(false);
    expect(
      broadcastCanRecover({ status: "sending", schedule }, "preview"),
    ).toBe(false);

    expect(
      broadcastQueueReceiptCanAttach(
        { status: "approved", schedule },
        job,
        "approved",
      ),
    ).toBe(true);
    expect(
      broadcastQueueReceiptCanAttach(
        {
          status: "approved",
          schedule: { ...schedule, customerIoStopped: undefined },
        },
        job,
        "approved",
      ),
    ).toBe(false);
    expect(
      broadcastQueueReceiptCanAttach(
        { status: "approved", schedule },
        job,
        "published",
      ),
    ).toBe(false);
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
  test("a newly selected send pauses an older active sibling", () => {
    expect(
      shouldPauseSupersededBroadcast("new", {
        id: "old",
        status: "approved",
        schedule: { state: "scheduled" },
      }),
    ).toBe(true);
    expect(
      shouldPauseSupersededBroadcast("new", {
        id: "old",
        status: "approved",
        schedule: { state: "paused" },
      }),
    ).toBe(false);
    expect(
      shouldPauseSupersededBroadcast("new", {
        id: "new",
        status: "approved",
        schedule: { state: "scheduled" },
      }),
    ).toBe(false);
  });
  test("worker errors persist only for the still-authoritative job", () => {
    expect(
      shouldPersistBroadcastJobFailure({ status: "approved", schedule }, job),
    ).toBe(true);
    expect(
      shouldPersistBroadcastJobFailure(
        { status: "approved", schedule: { ...schedule, state: "paused" } },
        job,
      ),
    ).toBe(false);
    expect(
      shouldPersistBroadcastJobFailure(
        { status: "approved", schedule },
        { ...job, dueAt: "2026-11-13T17:00:00.000Z" },
      ),
    ).toBe(false);
    expect(
      shouldPersistBroadcastJobFailure(
        {
          status: "approved",
          schedule: { ...schedule, queueMessageId: "current-message" },
        },
        { ...job, sourceMessageId: "stale-message" },
      ),
    ).toBe(false);
    expect(
      shouldPersistBroadcastJobFailure(
        {
          status: "approved",
          schedule: { ...schedule, queueMessageId: "current-message" },
        },
        { ...job, sourceMessageId: "current-message" },
      ),
    ).toBe(true);
  });
});
