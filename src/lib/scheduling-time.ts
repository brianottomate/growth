const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function partsEpoch(parts: ReturnType<typeof zonedParts>): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

/** Resolve an operator wall-clock time to one canonical UTC instant. */
export function resolveZonedDateTime(input: {
  localDateTime: string;
  timeZone: string;
}): string {
  if (!isValidTimeZone(input.timeZone)) {
    throw new Error("Choose a valid IANA timezone");
  }
  const match = LOCAL_DATE_TIME_PATTERN.exec(input.localDateTime);
  if (!match) {
    throw new Error(
      "Use local time as YYYY-MM-DDTHH:mm[:ss], without an offset",
    );
  }
  const requested = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0"),
  };
  const wallClockEpoch = partsEpoch(requested);
  const normalized = new Date(wallClockEpoch);
  if (
    normalized.getUTCFullYear() !== requested.year ||
    normalized.getUTCMonth() + 1 !== requested.month ||
    normalized.getUTCDate() !== requested.day ||
    normalized.getUTCHours() !== requested.hour ||
    normalized.getUTCMinutes() !== requested.minute ||
    normalized.getUTCSeconds() !== requested.second
  ) {
    throw new Error("Choose a valid local date and time");
  }

  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const probe = new Date(wallClockEpoch + hours * 60 * 60 * 1_000);
      return partsEpoch(zonedParts(probe, input.timeZone)) - probe.getTime();
    }),
  );
  const matches = [...offsets]
    .map((offset) => new Date(wallClockEpoch - offset))
    .filter(
      (candidate) =>
        partsEpoch(zonedParts(candidate, input.timeZone)) === wallClockEpoch,
    );
  const unique = [
    ...new Map(matches.map((date) => [date.getTime(), date])).values(),
  ];
  if (unique.length === 0) {
    throw new Error(
      "That local time does not exist because the clock changes then",
    );
  }
  if (unique.length > 1) {
    throw new Error(
      "That local time occurs twice because the clock changes then",
    );
  }
  return unique[0]!.toISOString();
}

export function formatResolvedPublishingTime(input: {
  localDateTime: string;
  timeZone: string;
  locale?: string;
}): string {
  try {
    const scheduledAt = resolveZonedDateTime(input);
    const date = new Date(scheduledAt);
    const format = (timeZone: string) =>
      new Intl.DateTimeFormat(input.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }).format(date);
    return `${format(input.timeZone)} ${input.timeZone} (${format("UTC")} UTC)`;
  } catch {
    return `${input.localDateTime} ${input.timeZone}`;
  }
}
