import "server-only";

import { and, eq } from "drizzle-orm";

import { PILLARS } from "@/lib/pillars";
import { db } from "@/server/db";
import { contentPillarTable } from "@/server/db/schema";

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
