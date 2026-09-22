/** Blank dates preserve existing campaign inheritance unless explicitly disabled. */
export function resolveMetaSchedule(input: {
  startAt?: Date | null;
  endAt?: Date | null;
  campaignStartAt?: Date | null;
  campaignEndAt?: Date | null;
  startWhenLaunched?: boolean;
  runUntilPaused?: boolean;
}) {
  return {
    startAt: input.startWhenLaunched
      ? null
      : (input.startAt ?? input.campaignStartAt ?? null),
    endAt: input.runUntilPaused
      ? null
      : (input.endAt ?? input.campaignEndAt ?? null),
  };
}

export function metaScheduleIssue(
  schedule: { startAt: Date | null; endAt: Date | null },
  budgetType: string | null | undefined,
  now = new Date(),
): string | null {
  if (budgetType === "lifetime" && !schedule.endAt)
    return "A lifetime budget requires an end date.";
  if (schedule.endAt && schedule.endAt <= now)
    return "Choose an end date in the future.";
  if (schedule.startAt && schedule.endAt && schedule.endAt <= schedule.startAt)
    return "End must be after start.";
  return null;
}
