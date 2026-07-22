import "server-only";

import { inArray } from "drizzle-orm";

import { findConversionRealityIssues } from "@/lib/conversion-reality";
import { db } from "@/server/db";
import {
  conversionEventTable,
  conversionMappingTable,
} from "@/server/db/schema";

export type { ConversionRealityFinding } from "@/lib/conversion-reality";

/**
 * Read-only conversion-action reconciliation. This deliberately stops at
 * findings: provider deletes, archives, primary-action changes, and bidding
 * changes require a separate operator-reviewed path.
 */
export async function computeConversionReality(brandIds: string[]) {
  if (brandIds.length === 0) {
    return { events: [], mappings: [], findings: [] };
  }

  const [events, mappings] = await Promise.all([
    db.query.conversionEventTable.findMany({
      where: inArray(conversionEventTable.brandId, brandIds),
      with: { sources: true },
    }),
    db.query.conversionMappingTable.findMany({
      where: inArray(conversionMappingTable.brandId, brandIds),
      with: {
        sources: true,
        channel: {
          columns: {
            platform: true,
            externalId: true,
            name: true,
            manageUrl: true,
          },
        },
      },
    }),
  ]);

  return {
    events,
    mappings,
    findings: findConversionRealityIssues(events, mappings),
  };
}
