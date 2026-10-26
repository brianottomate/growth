export type InboundLeadType =
  | "Closed Won wOS Deal"
  | "Active wOS Deal"
  | "Inactive wOS Deal"
  | "Active Lead"
  | "Resubmission"
  | "Inactive Lead"
  | "New Inbound Lead";

/**
 * Leads already being worked keep their real-time alert at any size.
 * Resubmissions too: the router doesn't re-stamp `inbound_date` on them, so
 * the HubSpot-backed digest would never list them.
 */
const LIVE_LEAD_TYPES = new Set<InboundLeadType>([
  "Closed Won wOS Deal",
  "Active wOS Deal",
  "Active Lead",
  "Resubmission",
]);

/** Leads at or under this many units wait for the digest instead of alerting live. */
export const INBOUND_DIGEST_MAX_UNITS = 5;

/**
 * True for a lead the digest should list: 5 units or fewer, or no unit count
 * at all. Used both by the WanderOS inbound summary and the Listed summary.
 */
export function isDigestSizedLead(units: number | null): boolean {
  return units === null || units <= INBOUND_DIGEST_MAX_UNITS;
}

/**
 * Sales asked for real-time alerts only on leads above 5 units, a booked
 * meeting, or an account someone is already working. Everything else,
 * including leads with no unit count yet, waits for the 5pm digest.
 */
export function postsInboundAlertImmediately(input: {
  units: number;
  meetingBooked: boolean;
  leadType: InboundLeadType;
}): boolean {
  return (
    input.units > INBOUND_DIGEST_MAX_UNITS ||
    input.meetingBooked ||
    LIVE_LEAD_TYPES.has(input.leadType)
  );
}

const INBOUND_DIGEST_TIME_ZONE = "America/Denver";
const INBOUND_DIGEST_HOUR = 17;

/**
 * Vercel crons run in UTC, so the digest is scheduled at both 23:00 and 00:00
 * UTC and only the run that lands on 5pm Mountain (MDT or MST) posts.
 */
export function isInboundDigestHour(now: Date): boolean {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: INBOUND_DIGEST_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(hour) === INBOUND_DIGEST_HOUR;
}
