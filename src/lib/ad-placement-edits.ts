import type {
  AdPlacementCell,
  AdPlacementVariant,
  AdPlacements,
} from "@/server/db/ads-schema";

// The write side of the placement map, as pure `AdPlacements -> AdPlacements`
// transforms. No I/O: the service verbs load the ad, call these, and save the
// one column, and file derivation (a story crop, an outpaint) happens in the
// service before it hands the finished variants here. Keeping the map logic
// pure is what lets the precedence and pruning rules be pinned in a unit test
// rather than discovered against the database.

export type CopyPatch = {
  headline?: string | null;
  body?: string | null;
  callToAction?: string | null;
  linkUrl?: string | null;
};

export type CellTouch = {
  via?: NonNullable<AdPlacementCell["via"]>;
  at?: string;
  note?: string | null;
};

/** A cell decides nothing: no copy, no files, not frozen. Such a cell is dropped. */
export function isEmptyCell(cell: AdPlacementCell): boolean {
  const hasCopy = Boolean(cell.copy && Object.keys(cell.copy).length > 0);
  const hasCards = Boolean(cell.cards?.some((card) => card !== null));
  return !hasCopy && !hasCards && !cell.frozenAt;
}

function stamp(cell: AdPlacementCell, touch?: CellTouch): AdPlacementCell {
  if (!touch) return cell;
  const next = { ...cell };
  if (touch.via) next.via = touch.via;
  next.updatedAt = touch.at ?? new Date().toISOString();
  if (touch.note !== undefined) {
    if (touch.note === null) delete next.note;
    else next.note = touch.note;
  }
  return next;
}

/** Put a cell back, or drop its key when nothing is decided in it. */
function put(
  placements: AdPlacements,
  key: string,
  cell: AdPlacementCell,
): AdPlacements {
  const next = { ...placements };
  if (isEmptyCell(cell)) delete next[key];
  else next[key] = cell;
  return next;
}

/**
 * Merge a copy patch onto one cell. A field set to `null` clears that
 * override back to the base; a field left out is untouched. A cell that ends
 * up deciding nothing is dropped, so clearing the last override is the same
 * as never having had one.
 */
export function withCopy(
  placements: AdPlacements,
  key: string,
  patch: CopyPatch,
  touch?: CellTouch,
): AdPlacements {
  const current = placements[key] ?? {};
  const copy = { ...current.copy };
  for (const field of [
    "headline",
    "body",
    "callToAction",
    "linkUrl",
  ] as const) {
    const value = patch[field];
    if (value === undefined) continue;
    if (value === null) delete copy[field];
    else copy[field] = value;
  }
  const cell: AdPlacementCell = { ...current };
  if (Object.keys(copy).length > 0) cell.copy = copy;
  else delete cell.copy;
  return put(placements, key, stamp(cell, touch));
}

/**
 * Set or clear one card's own file for one placement. `variant` of `null`
 * drops that card back to the base; the array is kept at `cardCount` so a
 * later card's index stays stable.
 */
export function withCard(
  placements: AdPlacements,
  key: string,
  index: number,
  variant: AdPlacementVariant | null,
  cardCount: number,
  touch?: CellTouch,
): AdPlacements {
  if (index < 0 || index >= cardCount) {
    throw new Error(`Card ${index} is outside 0..${cardCount - 1}`);
  }
  const current = placements[key] ?? {};
  const cards: (AdPlacementVariant | null)[] = Array.from(
    { length: cardCount },
    (_, i) => current.cards?.[i] ?? null,
  );
  cards[index] = variant;
  const cell: AdPlacementCell = { ...current };
  if (cards.some((card) => card !== null)) cell.cards = cards;
  else delete cell.cards;
  return put(placements, key, stamp(cell, touch));
}

/** Drop a whole cell, back to a pure render of the base. */
export function withoutKey(
  placements: AdPlacements,
  key: string,
): AdPlacements {
  if (!(key in placements)) return placements;
  const next = { ...placements };
  delete next[key];
  return next;
}

/**
 * Freeze a cell: the copy and files handed in are what the push takes for it.
 * `cards` are the materialized files (a story crop, an uploaded image, or the
 * base asset pinned as-is); `copy` snapshots the resolved copy so a later
 * global edit does not move a frozen cell. Freezing an empty base is allowed
 * only if it carries a copy snapshot, so a frozen cell is never dropped.
 */
export function withFrozen(
  placements: AdPlacementsInput,
  key: string,
  input: {
    at: string;
    by: string;
    cards?: (AdPlacementVariant | null)[];
    copy?: NonNullable<AdPlacementCell["copy"]>;
  },
): AdPlacements {
  const map = placements ?? {};
  const current = map[key] ?? {};
  const cell: AdPlacementCell = {
    ...current,
    frozenAt: input.at,
    frozenBy: input.by,
  };
  if (input.cards?.some((card) => card !== null)) {
    cell.cards = input.cards;
  }
  if (input.copy && Object.keys(input.copy).length > 0) cell.copy = input.copy;
  const next = { ...map };
  next[key] = cell;
  return next;
}

/** Clear the frozen stamp, keeping the copy and files the cell had. */
export function withUnfrozen(
  placements: AdPlacements,
  key: string,
): AdPlacements {
  const current = placements[key];
  if (!current?.frozenAt) return placements;
  const { frozenAt: _at, frozenBy: _by, ...rest } = current;
  return put(placements, key, rest);
}

type AdPlacementsInput = AdPlacements | null | undefined;

/** Normalize the column, which is null on an ad drawn before it existed. */
export function asPlacements(placements: AdPlacementsInput): AdPlacements {
  return placements ?? {};
}
