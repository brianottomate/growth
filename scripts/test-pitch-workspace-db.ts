/** Explicit integration check. All fixture writes are uncommitted and rolled back. */
import { eq } from "drizzle-orm";
import { strict as assert } from "node:assert";
import { db, withTransaction } from "@/server/db";
import { brandTable, brandPitchTable } from "@/server/db/schema";
import { EMPTY_PITCH } from "@/lib/pitch-settings";
import {
  getPitchWorkspace,
  savePitchWorkspace,
} from "@/server/services/pitch-workspace.service";

const membership = await db.query.memberTable.findFirst({
  columns: { organizationId: true, userId: true },
});
assert(membership, "A workspace member is required for the rollback fixture");
const rollback = new Error("Intentional pitch QA rollback");
try {
  await withTransaction(async (tx) => {
    const [brand] = await tx
      .insert(brandTable)
      .values({
        name: "Pitch transaction fixture",
        organizationId: membership.organizationId,
        ownerId: membership.userId,
        relationship: "prospect",
      })
      .returning({ id: brandTable.id });
    assert(brand);
    const saved = await savePitchWorkspace(
      membership.organizationId,
      membership.userId,
      {
        brandId: brand.id,
        fields: {
          ...EMPTY_PITCH,
          headline: "Saved copy",
          managementFeeDollars: 0,
        },
      },
      tx,
    );
    const stored = await tx.query.brandPitchTable.findFirst({
      where: eq(brandPitchTable.brandId, brand.id),
    });
    assert.deepEqual(stored?.overrides, {
      headline: "Saved copy",
      managementFeeDollars: 0,
    });
    assert.equal(saved.revision, 1);
    assert.equal(saved.managementFeeDollars, 0);
    await assert.rejects(
      getPitchWorkspace("other-organization", brand.id, tx),
      /Brand not found/,
    );
    const read = await getPitchWorkspace(
      membership.organizationId,
      brand.id,
      tx,
    );
    assert.equal(read.pitchSettings?.headline, "Saved copy");
    const reset = await savePitchWorkspace(
      membership.organizationId,
      membership.userId,
      { brandId: brand.id, fields: EMPTY_PITCH },
      tx,
    );
    assert.equal(reset.revision, 2);
    const resetRow = await tx.query.brandPitchTable.findFirst({
      where: eq(brandPitchTable.brandId, brand.id),
    });
    assert.deepEqual(resetRow?.overrides, {});
    assert.equal(read.resolved.brandName, "Pitch transaction fixture");
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
}
console.log(
  "Pitch persistence, last-write-wins and organization isolation passed; fixture rolled back.",
);
