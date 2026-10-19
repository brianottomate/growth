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

/** A queued wakeup cannot authorize a changed date, paused send or another runtime. */
export function broadcastJobCanRun(
  schedule: { state: string; dueAt: string; runtimeId: string } | undefined,
  job: { dueAt: string; runtimeId: string },
) {
  return Boolean(
    (schedule?.state === "approved" || schedule?.state === "scheduled") &&
    schedule.dueAt === job.dueAt &&
    schedule.runtimeId === job.runtimeId,
  );
}
