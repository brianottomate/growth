// The X listening watchlist — the real keyword surface behind the scan.
// twitter-monitor.service.ts derives its recent-search query from these terms,
// and the /app/listen X tab renders them as the filterable rail. Keep the
// terms aligned with the Reddit keyword filter.

export interface XWatchlistGroup {
  id: "brand" | "competitors" | "pain" | "thesis";
  name: string;
  terms: readonly string[];
  // Static Tailwind classes (literal strings so the scanner picks them up).
  dotClass: string;
  textClass: string;
  markClass: string;
  activeCardClass: string;
}

export const X_WATCHLIST: readonly XWatchlistGroup[] = [
  {
    id: "brand",
    name: "Brand terms",
    terms: ["wander.com", "WanderOS", "Wander Sites", "Wander Operated"],
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-400",
    markClass: "rounded-[3px] bg-emerald-500/15 px-0.5 text-inherit",
    activeCardClass: "border-emerald-500/40 bg-emerald-500/5",
  },
  {
    id: "competitors",
    name: "Competitors",
    terms: ["Hostaway", "Guesty", "OwnerRez", "Hospitable", "Lodgify"],
    dotClass: "bg-rose-500",
    textClass: "text-rose-400",
    markClass: "rounded-[3px] bg-rose-500/15 px-0.5 text-inherit",
    activeCardClass: "border-rose-500/40 bg-rose-500/5",
  },
  {
    id: "pain",
    name: "STR pain",
    terms: [
      "fire my property manager",
      "OTA fees",
      "OTA commission",
      "Airbnb fees too high",
      "switching from Airbnb",
      "tired of OTAs",
    ],
    dotClass: "bg-amber-500",
    textClass: "text-amber-400",
    markClass: "rounded-[3px] bg-amber-500/15 px-0.5 text-inherit",
    activeCardClass: "border-amber-500/40 bg-amber-500/5",
  },
  {
    id: "thesis",
    name: "Direct booking",
    terms: [
      "Airbnb alternative",
      "direct booking site",
      "direct booking platform",
      "own booking website",
      "need my own website",
    ],
    dotClass: "bg-purple-500",
    textClass: "text-purple-400",
    markClass: "rounded-[3px] bg-purple-500/15 px-0.5 text-inherit",
    activeCardClass: "border-purple-500/40 bg-purple-500/5",
  },
] as const;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Which watchlist group a tweet belongs to, plus the exact terms that hit.
 * First group (in rail order) with a match wins, so brand terms take priority.
 */
export function matchWatchlist(
  text: string,
): { group: XWatchlistGroup; terms: string[] } | null {
  for (const group of X_WATCHLIST) {
    const terms = group.terms.filter((t) =>
      new RegExp(escapeRegExp(t), "i").test(text),
    );
    if (terms.length > 0) return { group, terms };
  }
  return null;
}
