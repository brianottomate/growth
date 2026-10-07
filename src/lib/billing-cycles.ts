import { currentPeriod } from "./performance-billing";

export function shiftBillingPeriod(period: string, offset: number) {
  const [year, month] = period.split("-").map(Number);
  return currentPeriod(new Date(Date.UTC(year!, month! - 1 + offset, 1)));
}

/** End dates are exclusive. Partial months keep explicit amounts for review. */
export function billingPeriods(
  input: {
    effectiveDate: string | null;
    endDate: string | null;
    status: string;
  },
  now = new Date(),
  ahead = 2,
) {
  if (!["active", "onboarding"].includes(input.status) || !input.effectiveDate)
    return [];
  const current = currentPeriod(now);
  return Array.from({ length: ahead + 1 }, (_, i) =>
    shiftBillingPeriod(current, i),
  ).filter((period) => {
    const next = `${shiftBillingPeriod(period, 1)}-01`;
    return (
      next > input.effectiveDate! &&
      (!input.endDate || `${period}-01` < input.endDate)
    );
  });
}

export function wanderMediaContribution(
  budget: number | null,
  client: number | null,
) {
  return budget == null || client == null
    ? null
    : Math.round((budget - client) * 100) / 100;
}
