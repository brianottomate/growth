/** Shared presentation for a platform campaign, used by its card and its view. */

export const STATUS_STYLE: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  paused: "bg-amber-500/15 text-amber-300",
  ended: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

export const statusStyle = (status: string) =>
  STATUS_STYLE[status] ?? STATUS_STYLE.draft;

/** Compact money: thousands abbreviate, because spend gets large. */
export const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}K`
      : `$${n.toLocaleString()}`;

export const fmtDate = (
  d: Date | null,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) => (d ? d.toLocaleDateString([], options) : null);
