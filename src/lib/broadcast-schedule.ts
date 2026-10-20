import { z } from "zod";

export const broadcastScheduleInput = z.object({
  brandId: z.string().min(1),
  timeZone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Use an IANA time zone"),
  sends: z
    .array(
      z.object({
        messageSendId: z.string().min(1),
        scheduledAt: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(50),
});
export type BroadcastScheduleInput = z.infer<typeof broadcastScheduleInput>;

export const broadcastScheduleApprovalInput = broadcastScheduleInput.extend({
  reviewedHash: z.string().min(1),
  customerIoStopped: z.literal(true),
});
export type BroadcastScheduleApprovalInput = z.infer<
  typeof broadcastScheduleApprovalInput
>;

/** A queued wakeup cannot authorize a changed date, paused send or another runtime. */
export function broadcastJobCanRun(
  schedule:
    | {
        state: string;
        dueAt: string;
        runtimeId: string;
        customerIoStopped?: true;
      }
    | undefined,
  job: { dueAt: string; runtimeId: string },
) {
  return Boolean(
    (schedule?.state === "approved" || schedule?.state === "scheduled") &&
    schedule.customerIoStopped === true &&
    schedule.dueAt === job.dueAt &&
    schedule.runtimeId === job.runtimeId,
  );
}

/** Pause is allowed only before the final provider-handoff claim wins. */
export function broadcastCanPause(send: {
  status: string;
  schedule?: { state: string };
}) {
  return Boolean(
    send.status === "approved" &&
    send.schedule &&
    (send.schedule.state === "approved" || send.schedule.state === "scheduled"),
  );
}

/**
 * Final atomic transition into provider handoff. A schedule-controlled send
 * must still match the exact authorized wakeup while its row is locked.
 */
export function broadcastCanEnterProviderHandoff(
  send: {
    status: string;
    schedule?: {
      state: string;
      dueAt: string;
      runtimeId: string;
      customerIoStopped?: true;
    };
  },
  job?: { dueAt: string; runtimeId: string },
) {
  if (send.status !== "approved") return false;
  if (!send.schedule) return !job;
  return Boolean(job && broadcastJobCanRun(send.schedule, job));
}

/** Recovery republishes only a valid, acknowledged schedule for this runtime. */
export function broadcastCanRecover(
  send: {
    status: string;
    schedule?: {
      state: string;
      dueAt: string;
      runtimeId: string;
      customerIoStopped?: true;
    };
  },
  runtimeId: string | undefined,
) {
  if (!runtimeId || send.status !== "approved" || !send.schedule) return false;
  if (!Number.isFinite(Date.parse(send.schedule.dueAt))) return false;
  return broadcastJobCanRun(send.schedule, {
    dueAt: send.schedule.dueAt,
    runtimeId,
  });
}

/** A queue receipt is authoritative only while the exact approved job is active. */
export function broadcastQueueReceiptCanAttach(
  send: {
    status: string;
    schedule?: {
      state: string;
      dueAt: string;
      runtimeId: string;
      customerIoStopped?: true;
    };
  },
  job: { dueAt: string; runtimeId: string },
  postStatus: string | undefined,
) {
  return Boolean(
    send.status === "approved" &&
    broadcastJobCanRun(send.schedule, job) &&
    postStatus &&
    ["approved", "scheduled"].includes(postStatus),
  );
}

/** A newly approved send for one email revokes older unstarted queue authority. */
export function shouldPauseSupersededBroadcast(
  selectedSendId: string,
  sibling: {
    id: string;
    status: string;
    schedule?: { state: string };
  },
) {
  return Boolean(
    sibling.id !== selectedSendId &&
    sibling.status === "approved" &&
    sibling.schedule &&
    (sibling.schedule.state === "approved" ||
      sibling.schedule.state === "scheduled"),
  );
}

/** Persist a worker error only while this exact queue message is authoritative. */
export function shouldPersistBroadcastJobFailure(
  send: {
    status: string;
    schedule?: {
      state: string;
      dueAt: string;
      runtimeId: string;
      queueMessageId?: string;
    };
  },
  job: { dueAt: string; runtimeId: string; sourceMessageId?: string },
) {
  return Boolean(
    send.status === "approved" &&
    broadcastJobCanRun(send.schedule, job) &&
    (!job.sourceMessageId ||
      !send.schedule?.queueMessageId ||
      send.schedule.queueMessageId === job.sourceMessageId),
  );
}
