/**
 * The pre-gen send batch currently being worked.
 *
 * Lives here rather than in the leads router because both sides need the same
 * string: the server counts it for the pill badge, the client sends it as the
 * population filter. A pill whose count disagrees with its own filtered list is
 * the exact failure the surrounding code keeps commenting about, so the literal
 * is defined once.
 */
export const CURRENT_PREGEN_BATCH = "pregen-4";

/**
 * Where a batch's membership comes from.
 *
 * `recycled`/`untouched` are big dynamic HubSpot lists — pools that a batch is
 * *selected from*, which is what `scripts/select-pregen-batch.ts` does. These
 * are the other shape: a MANUAL HubSpot list that Danny curates by hand, where
 * the list *is* the batch. Membership is therefore stamped straight onto
 * `leads.domain.pregen_batch` rather than mirrored into
 * `leads.hubspot_list_membership` first — one fact, one place, and the
 * "Target list" pill keeps meaning the two cohorts it says it means.
 *
 * Re-run `scripts/stamp-pregen-batch-from-list.ts --batch <label>` after
 * editing the list in HubSpot; it clears and re-stamps, so removals land too.
 */
export const PREGEN_BATCH_LISTS: Record<
  string,
  { listId: string; listName: string }
> = {
  "pregen-3": {
    listId: "3905",
    listName: "Pre-gen Sites - Test 2 - 8/19/26",
  },
  // 239 companies, 10+ units, supported PMS, no sales activity in 30+ days.
  // Two cohorts: exhausted (20+ activities or 12+ calls) and "Not Interested".
  "pregen-4": {
    listId: "3951",
    listName: "Pregen Sites - Batch 9/11",
  },
};
