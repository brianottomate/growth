/**
 * wander.com's "~$X less than other sites" line, to the dollar.
 *
 * Ported from wander.com `useOtaPriceComparison.ts` so an email quotes the same
 * number the property card shows for the same stay. It is not a scraped OTA
 * price: the site takes Airbnb's 8.9% guest fee on the pre-tax direct total,
 * rounds the way its price rows print, and floors every estimate to $5.
 */

const AIRBNB_GUEST_FEE_MULTIPLIER = 1.089;

const ceilToWholeDollar = (cents: number) => Math.ceil(cents / 100) * 100;
const floorToNearestFiveDollars = (cents: number) =>
  Math.floor(cents / 500) * 500;

const US_NAMES = new Set([
  "us",
  "usa",
  "united states",
  "united states of america",
]);

/** Savings in whole dollars, or 0 when the site would show no line. */
export function otaSavingsUsd(input: {
  /** The pre-tax stay total, in cents. */
  priceCents: number;
  /** Country name or code; the site shows the line on US homes only. */
  country: string | null | undefined;
}): number {
  if (!input.country || !US_NAMES.has(input.country.trim().toLowerCase()))
    return 0;
  if (!(input.priceCents > 0)) return 0;
  const direct = ceilToWholeDollar(input.priceCents);
  const ota = floorToNearestFiveDollars(
    ceilToWholeDollar(
      Math.round(input.priceCents * AIRBNB_GUEST_FEE_MULTIPLIER),
    ),
  );
  if (ota <= direct) return 0;
  return floorToNearestFiveDollars(ota - direct) / 100;
}

/** The stay total as the card prints it: whole dollars, rounded up. */
export function stayTotalUsd(priceCents: number) {
  return ceilToWholeDollar(priceCents) / 100;
}
