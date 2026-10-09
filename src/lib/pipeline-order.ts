import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export type OrderedPipelineCard = {
  id: string;
  name: string;
  pipelineOrder?: string | null;
};

// Fractional keys use byte ordering, not locale-aware alphabetical comparison.
export function comparePipelineOrder(
  a: OrderedPipelineCard,
  b: OrderedPipelineCard,
) {
  if (a.pipelineOrder && b.pipelineOrder && a.pipelineOrder !== b.pipelineOrder)
    return a.pipelineOrder < b.pipelineOrder ? -1 : 1;
  if (Boolean(a.pipelineOrder) !== Boolean(b.pipelineOrder))
    return a.pipelineOrder ? -1 : 1;
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/** Assign missing initial ranks once, then change only the moved card's rank. */
export function planPipelineOrder(
  cards: OrderedPipelineCard[],
  moved: OrderedPipelineCard,
  beforeId: string | null,
) {
  const rows = cards
    .filter((card) => card.id !== moved.id)
    .map((card) => ({ ...card }))
    .sort(comparePipelineOrder);
  const updates = new Map<string, string>();
  const missing = rows.filter((card) => !card.pipelineOrder);
  const lastRank =
    [...rows].reverse().find((card) => card.pipelineOrder)?.pipelineOrder ??
    null;
  const initial = generateNKeysBetween(lastRank, null, missing.length);
  missing.forEach((card, index) => {
    card.pipelineOrder = initial[index]!;
    updates.set(card.id, card.pipelineOrder);
  });
  const index =
    beforeId === null
      ? rows.length
      : rows.findIndex((card) => card.id === beforeId);
  if (index < 0)
    throw new Error(
      "The destination card is no longer in this stage. Refresh and try again.",
    );
  updates.set(
    moved.id,
    generateKeyBetween(
      rows[index - 1]?.pipelineOrder ?? null,
      rows[index]?.pipelineOrder ?? null,
    ),
  );
  return updates;
}
