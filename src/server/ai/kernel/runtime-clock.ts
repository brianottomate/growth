import "server-only";

import { isValidTimeZone } from "@/lib/scheduling-time";

export function runtimeClockSection(input: {
  now: Date;
  timeZone: string | null | undefined;
}): string {
  const timeZone =
    input.timeZone && isValidTimeZone(input.timeZone) ? input.timeZone : "UTC";
  const localTime = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone,
  }).format(input.now);
  return `# Runtime clock
Current instant (UTC): ${input.now.toISOString()}
Operator timezone: ${timeZone}
Operator local date and time: ${localTime}

Interpret today, tomorrow, named weekdays, midday, and relative durations from this instant in the operator timezone. For scheduling actions, pass the agreed operator wall-clock time without an offset plus this IANA timezone. The server resolves the canonical UTC provider timestamp.`;
}
