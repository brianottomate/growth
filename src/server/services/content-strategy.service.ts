import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { PILLARS } from "@/lib/pillars";
import { db } from "@/server/db";
import {
  contentPillarTable,
  contentPostTable,
  seriesTable,
} from "@/server/db/schema";

export async function listBrandPillars(input: {
  brandId: string;
  brandSlug: string | null;
}) {
  const rows = await db.query.contentPillarTable.findMany({
    where: and(
      eq(contentPillarTable.brandId, input.brandId),
      eq(contentPillarTable.isActive, true),
    ),
  });
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const defaults = PILLARS.filter(
    (pillar) => pillar.brandSlug === input.brandSlug,
  ).map((pillar) => {
    const override = bySlug.get(pillar.slug);
    bySlug.delete(pillar.slug);
    return override
      ? { ...override, source: "custom" as const }
      : {
          id: null,
          brandId: input.brandId,
          ...pillar,
          isActive: true,
          source: "default" as const,
        };
  });
  return [
    ...defaults,
    ...[...bySlug.values()].map((row) => ({
      ...row,
      source: "custom" as const,
    })),
  ];
}

export async function saveBrandPillar(input: {
  brandId: string;
  brandSlug: string | null;
  slug: string;
  name?: string;
  description?: string;
  color?: string;
}) {
  const existing = (
    await listBrandPillars({
      brandId: input.brandId,
      brandSlug: input.brandSlug,
    })
  ).find((pillar) => pillar.slug === input.slug);
  if (!existing && (!input.name || !input.description)) {
    throw new Error("A new pillar needs a name and description");
  }
  const name = input.name ?? existing?.name;
  const description = input.description ?? existing?.description;
  if (!name || !description) throw new Error("Pillar details are incomplete");
  const [saved] = await db
    .insert(contentPillarTable)
    .values({
      brandId: input.brandId,
      slug: input.slug,
      name,
      description,
      color: input.color ?? existing?.color ?? "oklch(0.7 0.08 250)",
    })
    .onConflictDoUpdate({
      target: [contentPillarTable.brandId, contentPillarTable.slug],
      set: {
        name,
        description,
        color: input.color ?? existing?.color ?? "oklch(0.7 0.08 250)",
        isActive: true,
      },
    })
    .returning();
  if (!saved) throw new Error("Could not save pillar");
  return saved;
}

/** Resolve a pillar slug against the complete brand vocabulary (code-backed
 * defaults plus durable overrides). Mutations use this before persisting a
 * classification so chat can never invent an orphan pillar slug. */
export async function requireBrandPillar(input: {
  brandId: string;
  brandSlug: string | null;
  pillarSlug: string;
}) {
  const pillar = (
    await listBrandPillars({
      brandId: input.brandId,
      brandSlug: input.brandSlug,
    })
  ).find((candidate) => candidate.slug === input.pillarSlug);
  if (!pillar) {
    throw new Error(
      `Pillar "${input.pillarSlug}" does not exist for this brand. Create it first.`,
    );
  }
  return pillar;
}

/**
 * Hard-delete one series. Its ideas survive and detach
 * (`content_post.series_id` is SET NULL); its cadence targets go with it
 * (CASCADE). Auth is the caller's job, as everywhere else in this file.
 */
export async function purgeSeries(input: { seriesId: string }) {
  const row = await db.query.seriesTable.findFirst({
    where: eq(seriesTable.id, input.seriesId),
    columns: { id: true, name: true },
  });
  if (!row) throw new Error("That series no longer exists.");

  const ideas = await db.query.contentPostTable.findMany({
    where: eq(contentPostTable.seriesId, row.id),
    columns: { id: true },
  });
  await db.delete(seriesTable).where(eq(seriesTable.id, row.id));

  return { id: row.id, name: row.name, detachedIdeas: ideas.length };
}

/** Clear one brand's series shelf. The ideas detach, they are not deleted. */
export async function clearBrandSeries(input: { brandId: string }) {
  const rows = await db.query.seriesTable.findMany({
    where: eq(seriesTable.brandId, input.brandId),
    columns: { id: true, name: true },
  });
  if (!rows.length)
    return { deleted: 0, detachedIdeas: 0, names: [] as string[] };

  const ideas = await db.query.contentPostTable.findMany({
    where: inArray(
      contentPostTable.seriesId,
      rows.map((row) => row.id),
    ),
    columns: { id: true },
  });
  await db.delete(seriesTable).where(eq(seriesTable.brandId, input.brandId));

  return {
    deleted: rows.length,
    detachedIdeas: ideas.length,
    names: rows.map((row) => row.name),
  };
}
