import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type Campaign,
  campaignTable,
  type Initiative,
  initiativeTable,
} from "@/server/db/schema";

import { diffInitiative, type InitiativeAlignment } from "./ads-alignment.core";

export * from "./ads-alignment.core";

// ---- db-backed entry points ------------------------------------------------

/** Full alignment for one initiative (detail page / capability). */
export async function computeInitiativeAlignment(
  initiativeId: string,
): Promise<InitiativeAlignment> {
  const initiative = await db.query.initiativeTable.findFirst({
    where: and(
      eq(initiativeTable.id, initiativeId),
      isNull(initiativeTable.deletedAt),
    ),
  });
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);

  const [linked, unlinked] = await Promise.all([
    db.query.campaignTable.findMany({
      where: eq(campaignTable.initiativeId, initiativeId),
    }),
    db.query.campaignTable.findMany({
      where: and(
        eq(campaignTable.brandId, initiative.brandId),
        isNull(campaignTable.initiativeId),
      ),
    }),
  ]);

  return diffInitiative(initiative, linked, unlinked);
}

export type AlignmentOverviewRow = {
  initiativeId: string;
  name: string;
  status: Initiative["status"];
  missingChannels: string[];
  inactiveChannels: string[];
  unplannedCount: number;
  budgetUtilization: number | undefined;
  overIntended: boolean;
  suggestionCount: number;
};

/** Compact per-initiative rollup for the /app/campaigns index. */
export async function computeAlignmentOverview(
  brandIds: string[],
): Promise<AlignmentOverviewRow[]> {
  if (brandIds.length === 0) return [];

  const initiatives = await db.query.initiativeTable.findMany({
    where: and(
      inArray(initiativeTable.brandId, brandIds),
      isNull(initiativeTable.deletedAt),
      inArray(initiativeTable.status, ["planned", "active", "paused"]),
    ),
  });
  if (initiatives.length === 0) return [];

  const campaigns = await db.query.campaignTable.findMany({
    where: inArray(campaignTable.brandId, brandIds),
  });
  const linkedByInitiative = new Map<string, Campaign[]>();
  const unlinkedByBrand = new Map<string, Campaign[]>();
  for (const c of campaigns) {
    if (c.initiativeId) {
      const arr = linkedByInitiative.get(c.initiativeId) ?? [];
      arr.push(c);
      linkedByInitiative.set(c.initiativeId, arr);
    } else {
      const arr = unlinkedByBrand.get(c.brandId) ?? [];
      arr.push(c);
      unlinkedByBrand.set(c.brandId, arr);
    }
  }

  return initiatives.map((i) => {
    const alignment = diffInitiative(
      i,
      linkedByInitiative.get(i.id) ?? [],
      unlinkedByBrand.get(i.brandId) ?? [],
    );
    return {
      initiativeId: i.id,
      name: i.name,
      status: i.status,
      missingChannels: alignment.channels
        .filter((c) => c.verdict === "missing")
        .map((c) => c.platform),
      inactiveChannels: alignment.channels
        .filter((c) => c.verdict === "inactive")
        .map((c) => c.platform),
      unplannedCount: alignment.unplanned.length,
      budgetUtilization: alignment.budget.utilization,
      overIntended: alignment.budget.overIntended,
      suggestionCount: alignment.suggestions.length,
    };
  });
}
