/** Explicit no-provider live smoke: temporary rows are always cleaned up. */
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/server/db";
import {
  brandTable,
  memberTable,
  workflowRunTable,
  catalogExportTable,
} from "../src/server/db/schema";
import {
  startWorkflowRun,
  claimWorkflowRun,
  updateWorkflowRun,
  expireWorkflowRuns,
} from "../src/server/services/workflow-run.service";
import { workflowActivity } from "../src/server/services/workflow-activity.service";
if (!process.argv.includes("--run"))
  throw new Error(
    "Pass --run to verify temporary workflow rows without provider calls",
  );
const [owner] = await db
  .select({
    brandId: brandTable.id,
    organizationId: brandTable.organizationId,
    userId: memberTable.userId,
  })
  .from(brandTable)
  .innerJoin(
    memberTable,
    eq(memberTable.organizationId, brandTable.organizationId),
  )
  .limit(1);
if (!owner?.organizationId) throw new Error("No workspace member");
const tag = `smoke:${crypto.randomUUID()}`;
const ids: string[] = [];
const input = {
  ...owner,
  organizationId: owner.organizationId,
  workflowType: "smoke",
  lockKey: tag,
  input: {},
  createdBy: owner.userId,
};
try {
  await assert.rejects(
    startWorkflowRun({ ...input, organizationId: "org_not_owner" }),
    /workspace/,
  );
  await assert.rejects(workflowActivity("usr_not_owner", owner.brandId));
  const starts = await Promise.all([
    startWorkflowRun(input),
    startWorkflowRun(input),
  ]);
  ids.push(...new Set(starts.map((r) => r.run.id)));
  assert.equal(ids.length, 1, "Concurrent starts reuse one operation");
  assert.equal(starts.filter((r) => r.started).length, 1);
  const claims = await Promise.all([
    claimWorkflowRun(ids[0]!),
    claimWorkflowRun(ids[0]!),
  ]);
  assert.equal(claims.filter(Boolean).length, 1, "Only one worker may spend");
  const claimed = claims.find(Boolean)!;
  await db
    .update(workflowRunTable)
    .set({ status: "cancelled" })
    .where(eq(workflowRunTable.id, claimed.id));
  await assert.rejects(
    updateWorkflowRun(claimed, { status: "succeeded" }),
    /no longer active/,
  );
  const next = await startWorkflowRun(input);
  ids.push(next.run.id);
  const active = (await claimWorkflowRun(next.run.id))!;
  await db
    .update(workflowRunTable)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(workflowRunTable.id, active.id));
  await expireWorkflowRuns(owner.brandId);
  assert.equal(
    await claimWorkflowRun(active.id),
    undefined,
    "An expired worker is never replayed",
  );
  await assert.rejects(
    updateWorkflowRun(active, { status: "succeeded" }),
    /no longer active/,
  );
  await db.insert(catalogExportTable).values({
    id: tag,
    organizationId: owner.organizationId,
    brandId: owner.brandId,
    sourceRunId: claimed.id,
    input: {},
    output: { rows: [] },
  });
  await db.delete(workflowRunTable).where(eq(workflowRunTable.id, claimed.id));
  const saved = await db.query.catalogExportTable.findFirst({
    where: eq(catalogExportTable.id, tag),
  });
  assert(saved, "Deleting history preserves the frozen export");
  assert.equal(saved.sourceRunId, null);
  console.log(
    "PASS: workspace isolation, concurrent start deduplication, single claim, cancellation fencing, timeout fencing, export independence.",
  );
} finally {
  await db.delete(catalogExportTable).where(eq(catalogExportTable.id, tag));
  if (ids.length)
    await db
      .delete(workflowRunTable)
      .where(
        and(
          inArray(workflowRunTable.id, ids),
          eq(workflowRunTable.lockKey, tag),
        ),
      );
  console.log("Temporary workflow rows removed.");
}
