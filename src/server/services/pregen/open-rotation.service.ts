import "server-only";

import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { pregenBuildTable } from "@/server/db/leads-schema";

/**
 * Who picks up a prospect that opened their pregen site.
 *
 * Deliberately NOT `nextRepInRR` from the HubSpot client. That one ranks reps
 * by deficit against HubSpot contacts filtered on `inbound_outbound =
 * 'Inbound - Sites'` with an `inbound_date` inside the current month. A pregen
 * open is not an inbound form fill, so none of those counts ever move, every
 * rep's deficit stays frozen, and the first name in the table takes every lead
 * in the batch. Same shape as the argmin bug `bdr-assignment.service.ts`
 * records from 2026-08-05.
 *
 * It also drops the portfolio bands. The pregen batch spans 15 to 51 units,
 * which straddles the OTE and SMB tables; splitting a 50-company test across
 * two rosters gives each rep a handful and makes the result unreadable.
 */

/**
 * The demand BDRs the inbound router already routes 17-99 unit leads to
 * (`BDR_SMB_ROUND_ROBIN`), which is the band most of the pregen batch sits in.
 *
 * Order matters only as the tie-break when everyone is carrying the same load.
 * Edit this list to change the rotation; nothing else reads the roster.
 */
export const PREGEN_OPEN_ROTATION: Array<{ ownerId: string; name: string }> = [
  { ownerId: "430737561", name: "Karolina Tenorio" },
  { ownerId: "79859550", name: "Skyler Rickey" },
  { ownerId: "93221525", name: "Paige Madigan" },
];

/**
 * Least-assigned rep wins, ties broken by roster order.
 *
 * The count lives in Postgres rather than a module counter because Fluid runs
 * many instances and each one would start its own counter at zero, so every
 * cold start hands the next open to the same person — the trap
 * `bdr-assignment.service.ts` documents. Counting rows also means the rotation
 * self-heals: add or remove someone and the load evens out on its own instead
 * of needing the index reset.
 */
async function nextInRotation(): Promise<{ ownerId: string; name: string }> {
  const loads = await db
    .select({
      ownerId: pregenBuildTable.assignedOwnerId,
      count: sql<number>`count(*)::int`,
    })
    .from(pregenBuildTable)
    .where(isNotNull(pregenBuildTable.assignedOwnerId))
    .groupBy(pregenBuildTable.assignedOwnerId);

  const byOwner = new Map(loads.map((row) => [row.ownerId!, row.count]));
  return PREGEN_OPEN_ROTATION.reduce((best, candidate) =>
    (byOwner.get(candidate.ownerId) ?? 0) < (byOwner.get(best.ownerId) ?? 0)
      ? candidate
      : best,
  );
}

/**
 * Assign this build to a rep, once. Returns whoever holds it — the winner of a
 * concurrent race included, since the `is null` guard means only one write
 * lands and the loser should report the same name Slack is about to mention.
 */
export async function assignPregenOpen(
  buildId: string,
): Promise<{ ownerId: string; name: string | null } | null> {
  const candidate = await nextInRotation();

  const [claimed] = await db
    .update(pregenBuildTable)
    .set({ assignedOwnerId: candidate.ownerId, assignedAt: new Date() })
    .where(
      and(
        eq(pregenBuildTable.id, buildId),
        isNull(pregenBuildTable.assignedOwnerId),
      ),
    )
    .returning({ ownerId: pregenBuildTable.assignedOwnerId });

  if (claimed?.ownerId) return candidate;

  const [existing] = await db
    .select({ ownerId: pregenBuildTable.assignedOwnerId })
    .from(pregenBuildTable)
    .where(eq(pregenBuildTable.id, buildId))
    .limit(1);

  if (!existing?.ownerId) return null;
  return {
    ownerId: existing.ownerId,
    name:
      PREGEN_OPEN_ROTATION.find((r) => r.ownerId === existing.ownerId)?.name ??
      null,
  };
}
