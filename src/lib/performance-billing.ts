/**
 * What a Performance client pays each month, as two lines: the fee Wander
 * charges for running the account, and the media that reaches the ad
 * platforms. They are invoiced and paid separately, so each line carries its
 * own paid date. Lives on the cycle, not the brand: the brand's business
 * stage says the client is paying at all, the cycle says for which month.
 */

/** Performance by Wander is $2,500 a month until plans are modelled. */
export const PERFORMANCE_FEE_DOLLARS = 2500;

/** The plan slugs an account can carry; Plus is the default. */
export const PERFORMANCE_PLANS = [
  "performance_plus",
  "performance_pro",
] as const;

export type BillingLine = {
  /** Whole dollars, or null when nobody has set the amount yet. */
  amount: number | null;
  paidAt: Date | null;
};

export type BillingSummary = {
  /** "2026-09" */
  period: string;
  fee: BillingLine;
  media: BillingLine;
  /** Whole dollars the platforms report spent this cycle. */
  spend: number;
};

/** The billing period a date falls in, in UTC, as the cycle table keys it. */
export function currentPeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Sep 2026" for a period key. */
export function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** "$2,500 paid" / "$2,500 open" / "paid" when the amount is unknown. */
export function lineLabel(line: BillingLine) {
  const state = line.paidAt ? "paid" : "open";
  return line.amount != null ? `${money(line.amount)} ${state}` : state;
}

/** Whether both lines are settled for the period. */
export function isSettled(summary: BillingSummary) {
  return Boolean(summary.fee.paidAt && summary.media.paidAt);
}
