/**
 * Key dates — hard-coded registry of holidays, travel moments, and awareness
 * days plotted as pins on the Studio year wheel. Mirrors the `pillars` registry
 * pattern (single source of truth until a CRUD table is needed).
 *
 * `month`/`day` are 1-based and recurring (resolved per displayed year). A few
 * US holidays float (nth-weekday) — those carry a `floating` resolver instead.
 */

export type KeyDateType =
  | "holiday" // public/cultural holiday
  | "travel" // peak travel moment / season marker
  | "awareness" // themed day relevant to content
  | "company"; // Wander-specific moment

export type KeyDate = {
  slug: string;
  name: string;
  type: KeyDateType;
  emoji: string;
  // Fixed-date entries use month+day; floating entries use a resolver.
  month?: number; // 1-12
  day?: number; // 1-31
  floating?: (year: number) => Date; // for nth-weekday holidays
  note?: string; // why it matters for travel content
};

/** nth weekday of a month (weekday: 0=Sun..6=Sat). nth=-1 => last. */
function nthWeekday(
  year: number,
  month1: number,
  weekday: number,
  nth: number,
): Date {
  const month = month1 - 1;
  if (nth > 0) {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (nth - 1) * 7);
  }
  // last weekday of month
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month + 1, 0 - offset);
}

export const KEY_DATES: KeyDate[] = [
  {
    slug: "new-year",
    name: "New Year's",
    type: "holiday",
    emoji: "🎉",
    month: 1,
    day: 1,
    note: "Resolutions, fresh-start travel planning.",
  },
  {
    slug: "valentines",
    name: "Valentine's Day",
    type: "holiday",
    emoji: "💝",
    month: 2,
    day: 14,
    note: "Couples getaways, romantic stays.",
  },
  {
    slug: "presidents-day",
    name: "Presidents' Day",
    type: "holiday",
    emoji: "🇺🇸",
    floating: (y) => nthWeekday(y, 2, 1, 3),
    note: "Long-weekend ski + warm escapes.",
  },
  {
    slug: "spring-break",
    name: "Spring Break",
    type: "travel",
    emoji: "🌸",
    month: 3,
    day: 15,
    note: "Family + student peak travel window.",
  },
  {
    slug: "easter",
    name: "Easter (approx.)",
    type: "holiday",
    emoji: "🐣",
    month: 4,
    day: 5,
    note: "Family gatherings, spring trips.",
  },
  {
    slug: "earth-day",
    name: "Earth Day",
    type: "awareness",
    emoji: "🌍",
    month: 4,
    day: 22,
    note: "Sustainable / nature stays.",
  },
  {
    slug: "memorial-day",
    name: "Memorial Day",
    type: "travel",
    emoji: "☀️",
    floating: (y) => nthWeekday(y, 5, 1, -1),
    note: "Unofficial start of summer travel.",
  },
  {
    slug: "pride",
    name: "Pride Month",
    type: "awareness",
    emoji: "🏳️‍🌈",
    month: 6,
    day: 1,
    note: "Inclusive travel, city trips.",
  },
  {
    slug: "july-4",
    name: "Independence Day",
    type: "holiday",
    emoji: "🎆",
    month: 7,
    day: 4,
    note: "Peak summer long weekend.",
  },
  {
    slug: "labor-day",
    name: "Labor Day",
    type: "travel",
    emoji: "🍂",
    floating: (y) => nthWeekday(y, 9, 1, 1),
    note: "End-of-summer last hurrah.",
  },
  {
    slug: "indigenous-day",
    name: "Indigenous Peoples' Day",
    type: "holiday",
    emoji: "🪶",
    floating: (y) => nthWeekday(y, 10, 1, 2),
    note: "Fall long weekend.",
  },
  {
    slug: "halloween",
    name: "Halloween",
    type: "holiday",
    emoji: "🎃",
    month: 10,
    day: 31,
    note: "Themed stays, fall foliage.",
  },
  {
    slug: "thanksgiving",
    name: "Thanksgiving",
    type: "travel",
    emoji: "🦃",
    floating: (y) => nthWeekday(y, 11, 4, 4),
    note: "Highest-volume US travel week.",
  },
  {
    slug: "black-friday",
    name: "Black Friday / Cyber",
    type: "company",
    emoji: "🏷️",
    floating: (y) => {
      const t = nthWeekday(y, 11, 4, 4);
      return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    },
    note: "Booking promos / deals push.",
  },
  {
    slug: "christmas",
    name: "Christmas",
    type: "holiday",
    emoji: "🎄",
    month: 12,
    day: 25,
    note: "Winter escapes, family stays.",
  },
  {
    slug: "nye",
    name: "New Year's Eve",
    type: "holiday",
    emoji: "🥂",
    month: 12,
    day: 31,
    note: "Celebration getaways.",
  },
];

/** Resolve a key date to a concrete Date in the given year. */
export function resolveKeyDate(kd: KeyDate, year: number): Date {
  if (kd.floating) return kd.floating(year);
  return new Date(year, (kd.month ?? 1) - 1, kd.day ?? 1);
}

/** All key dates resolved + sorted for a given year. */
export function keyDatesForYear(
  year: number,
): { keyDate: KeyDate; date: Date }[] {
  return KEY_DATES.map((keyDate) => ({
    keyDate,
    date: resolveKeyDate(keyDate, year),
  })).sort((a, b) => a.date.getTime() - b.date.getTime());
}
