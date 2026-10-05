import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import {
  workflowRunTable,
  brandTable,
  campaignTable,
  productionPacketTable,
} from "@/server/db/schema";

export type WorkflowRun = typeof workflowRunTable.$inferSelect;
type NewRun = typeof workflowRunTable.$inferInsert;
const ACTIVE = ["queued", "running"] as const;
const LEASE_MS = 20 * 60_000;

/** Never replay a worker whose side effects may already have happened. */
export async function expireWorkflowRuns(brandId?: string) {
  await db
    .update(workflowRunTable)
    .set({
      status: "failed",
      completedAt: new Date(),
      error:
        "The worker stopped before finishing. Saved results are kept. Review them before starting again.",
    })
    .where(
      and(
        inArray(workflowRunTable.status, [...ACTIVE]),
        lt(workflowRunTable.expiresAt, new Date()),
        brandId ? eq(workflowRunTable.brandId, brandId) : undefined,
      ),
    );
}

/** One active operation per resource. Repeated starts return the same run. */
export async function startWorkflowRun(input: NewRun) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.organizationId),
    ),
    columns: { id: true },
  });
  if (!brand) throw new Error("Workflow brand not found in this workspace");
  for (const relatedId of [input.parentRunId, input.retryOfId]) {
    if (!relatedId) continue;
    const related = await db.query.workflowRunTable.findFirst({
      where: and(
        eq(workflowRunTable.id, relatedId),
        eq(workflowRunTable.brandId, input.brandId),
        eq(workflowRunTable.organizationId, input.organizationId),
      ),
      columns: { id: true },
    });
    if (!related) throw new Error("Related workflow belongs to another brand");
  }
  if (
    input.campaignId &&
    !(await db.query.campaignTable.findFirst({
      where: and(
        eq(campaignTable.id, input.campaignId),
        eq(campaignTable.brandId, input.brandId),
      ),
      columns: { id: true },
    }))
  )
    throw new Error("Campaign belongs to another brand");
  if (
    input.packetId &&
    !(await db.query.productionPacketTable.findFirst({
      where: and(
        eq(productionPacketTable.id, input.packetId),
        eq(productionPacketTable.brandId, input.brandId),
      ),
      columns: { id: true },
    }))
  )
    throw new Error("Document belongs to another brand");
  await expireWorkflowRuns(input.brandId);
  const lockKey = input.lockKey ?? `${input.workflowType}:${input.brandId}`;
  return withTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${input.organizationId}:${lockKey}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(workflowRunTable)
      .where(
        and(
          eq(workflowRunTable.organizationId, input.organizationId),
          eq(workflowRunTable.lockKey, lockKey),
          inArray(workflowRunTable.status, [...ACTIVE]),
        ),
      )
      .limit(1);
    if (existing) return { run: existing, started: false };
    const [run] = await tx
      .insert(workflowRunTable)
      .values({
        ...input,
        lockKey,
        status: "queued",
        expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
      })
      .returning();
    return { run: run!, started: true };
  });
}

/** Claim once before any provider call. The token fences all later progress writes. */
export async function claimWorkflowRun(runId: string, workflowType?: string) {
  const [run] = await db
    .update(workflowRunTable)
    .set({
      status: "running",
      startedAt: new Date(),
      claimToken: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + LEASE_MS),
    })
    .where(
      and(
        eq(workflowRunTable.id, runId),
        eq(workflowRunTable.status, "queued"),
        sql`${workflowRunTable.expiresAt} > now()`,
        workflowType
          ? eq(workflowRunTable.workflowType, workflowType)
          : undefined,
      ),
    )
    .returning();
  return run;
}

export function ownedWorkflow(run: WorkflowRun) {
  if (!run.claimToken) throw new Error("Workflow has not been claimed");
  return and(
    eq(workflowRunTable.id, run.id),
    eq(workflowRunTable.claimToken, run.claimToken),
    eq(workflowRunTable.status, "running"),
    sql`${workflowRunTable.expiresAt} > now()`,
  );
}

export async function updateWorkflowRun(
  run: WorkflowRun,
  patch: Partial<NewRun>,
) {
  const terminal =
    patch.status && !ACTIVE.includes(patch.status as "queued" | "running");
  const [updated] = await db
    .update(workflowRunTable)
    .set({
      ...patch,
      ...(terminal ? { completedAt: new Date() } : {}),
    })
    .where(ownedWorkflow(run))
    .returning({ id: workflowRunTable.id });
  if (!updated) throw new Error("Workflow is no longer active");
}

export async function failWorkflowRun(run: WorkflowRun, error: unknown) {
  await db
    .update(workflowRunTable)
    .set({
      status: "failed",
      completedAt: new Date(),
      error: error instanceof Error ? error.message : "Workflow failed",
    })
    .where(ownedWorkflow(run));
}

export async function recentWorkflowRuns(brandId: string) {
  await expireWorkflowRuns(brandId);
  return db.query.workflowRunTable.findMany({
    where: eq(workflowRunTable.brandId, brandId),
    orderBy: [
      sql`case when ${workflowRunTable.status} in ('queued', 'running') then 0 else 1 end`,
      desc(workflowRunTable.createdAt),
    ],
    limit: 50,
  });
}
