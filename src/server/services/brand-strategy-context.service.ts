import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  audienceTable,
  contentPillarTable,
  personaTable,
} from "@/server/db/schema";
/** Brand-owned planning context only; no customer identifiers. */
export async function brandStrategyContext(
  brandId: string,
  campaignId?: string,
) {
  const [brand, personas, pillars, audiences] = await Promise.all([
    db.query.brandTable.findFirst({
      where: eq(brandTable.id, brandId),
      columns: { creativeDirection: true },
    }),
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
    creativeDirection: brand?.creativeDirection ?? null,
    personas: personas
      .filter((p) => !selected.size || selected.has(p.id))
      .map(
        ({
          id,
          name,
          description,

          profile,
        }) => ({
          id,
          name,
          description,

          profile,
        }),
      ),
    pillars: pillars.map(({ name, description }) => ({ name, description })),
    campaignAudiences: audiences.map(({ name, description, personaId }) => ({
      name,
      description,
      personaId,
    })),
    guidance:
      "Personas explain motivations, pillars explain themes. Treat inferred preferences as hypotheses. Customer origins and destinations of interest are distinct. Never invent measured affinities or targeting from a creative description.",
  });
}
