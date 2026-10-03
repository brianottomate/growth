/** Whole dollars as the desk writes them. */
export function deskMoney(n: number | null | undefined) {
  return n == null
    ? "—"
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}K`
      : `$${Math.round(n)}`;
}
