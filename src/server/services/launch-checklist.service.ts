import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import {
  applyLaunchPatch,
  emptyLaunchRecord,
  launchPatchSchema,
  type LaunchItem,
  type LaunchEvent,
} from "@/lib/launch-checklist";
import type { z } from "zod";

export async function readLaunchRecord(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { performanceChecklist: true },
  });
  if (!brand) throw new Error("Brand not found");
  return brand.performanceChecklist?.launch ?? emptyLaunchRecord();
}

/** A single atomic, scoped write; stale clients must refresh instead of overwriting. */
export async function recordLaunchChecklist(input: {
  brandId: string;
  orgId: string;
  patch: z.infer<typeof launchPatchSchema>;
  source: LaunchEvent["source"];
  by: string | null;
  evidence?: string;
  receipt?: string;
  expectedRevision?: number;
  client?: Database;
}) {
  const client = input.client ?? db;
  const patch = launchPatchSchema.parse(input.patch);
  const where = and(
    eq(brandTable.id, input.brandId),
    eq(brandTable.organizationId, input.orgId),
    isNull(brandTable.deletedAt),
  );
  const brand = await client.query.brandTable.findFirst({
    where,
    columns: { performanceChecklist: true },
  });
  if (!brand) throw new Error("Brand not found");
  const current = brand.performanceChecklist?.launch ?? emptyLaunchRecord();
  if (input.receipt && current.receipts.includes(input.receipt)) return current;
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== current.revision
  )
    throw new Error("Checklist changed. Refresh and try again.");
  const actor = input.by
    ? await client.query.userTable.findFirst({
        where: eq(userTable.id, input.by),
        columns: { name: true },
      })
    : null;
  const next = applyLaunchPatch(
    current,
    patch,
    {
      by: input.by,
      byName: actor?.name ?? null,
      source: input.source,
      at: new Date().toISOString(),
      evidence: input.evidence ?? null,
    },
    input.receipt,
  );
  const saved = await client
    .update(brandTable)
    .set({
      performanceChecklist: { ...brand.performanceChecklist, launch: next },
    })
    .where(
      and(
        where,
        sql`${brandTable.performanceChecklist} is not distinct from ${brand.performanceChecklist == null ? null : JSON.stringify(brand.performanceChecklist)}::jsonb`,
      ),
    )
    .returning({ id: brandTable.id });
  if (!saved.length)
    throw new Error("Checklist changed. Refresh and try again.");
  return next;
}

/** Called only by successful writes, never by page reads or reconciliation. */
export async function completeLaunchMilestones(
  brandId: string,
  items: LaunchItem[],
  evidence: string,
  receipt: string,
  by: string | null = null,
) {
  if (!items.length) return;
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
    columns: { organizationId: true },
  });
  if (!brand)
    throw new Error("Brand not found while recording workflow completion");
  if (!brand.organizationId) return;
  // Concurrent completions may touch different milestones. Re-read on CAS
  // conflicts; receipt deduplication prevents retrying the same event.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await recordLaunchChecklist({
        brandId,
        orgId: brand.organizationId,
        patch: items.map((item) => ({ item, checked: true })),
        source: "workflow",
        by,
        evidence,
        receipt,
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "Checklist changed. Refresh and try again." ||
        attempt === 4
      )
        throw error;
    }
  }
}
