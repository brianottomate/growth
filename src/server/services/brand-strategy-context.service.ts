import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  audienceTable,
  contentPillarTable,
  personaTable,
} from "@/server/db/schema";
/** Brand-owned planning context only; no customer identifiers. */
export async function brandStrategyContext(
  brandId: string,
  campaignId?: string,
) {
  const [personas, pillars, audiences] = await Promise.all([
    db.query.personaTable.findMany({
      where: and(
        eq(personaTable.brandId, brandId),
        isNull(personaTable.deletedAt),
      ),
    }),
    db.query.contentPillarTable.findMany({
      where: eq(contentPillarTable.brandId, brandId),
    }),
    campaignId
      ? db.query.audienceTable.findMany({
          where: and(
            eq(audienceTable.brandId, brandId),
            eq(audienceTable.campaignId, campaignId),
          ),
        })
      : [],
  ]);
  const selected = new Set(
    audiences.flatMap((a) => (a.personaId ? [a.personaId] : [])),
  );
  return JSON.stringify({
    personas: personas
      .filter((p) => !selected.size || selected.has(p.id))
      .map(
        ({ id, name, description, demandGeography, destinationGeography }) => ({
          id,
          name,
          description,
          demandGeography,
          destinationGeography,
        }),
      ),
    pillars: pillars.map(({ name, description }) => ({ name, description })),
    campaignAudiences: audiences.map(
      ({ name, description, personaId, homeIds }) => ({
        name,
        description,
        personaId,
        homeIds,
      }),
    ),
    guidance:
      "Personas explain motivations, pillars explain themes. Treat inferred preferences as hypotheses. Customer origins and destinations of interest are distinct. Never invent measured affinities or targeting from a creative description.",
  });
}
