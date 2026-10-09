import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { currentPeriod } from "@/lib/performance-billing";
import { db } from "@/server/db";
import {
  brandTable,
  performanceAccountTable,
  performanceCycleTable,
  performanceIntakeTable,
  type PerformanceCycle,
} from "@/server/db/schema";
import {
  advanceBusinessStage,
  promoteBrandToClient,
} from "./brand-relationship.service";
import { PerformanceError, type PerformanceActor } from "./performance.service";

export type BillingLineKind = "fee" | "media";

/**
 * The cycle a payment lands on: this month's, or a brand-new one for this
 * month with the fee and the intake's media budget filled in. Opening the
 * first cycle also opens the account, since a payment is proof of a contract
 * whether or not anyone pressed the promote button.
 */
export async function ensureCurrentCycle(
  actor: PerformanceActor,
  brandId: string,
  period = currentPeriod(),
  recordPayment = true,
): Promise<PerformanceCycle> {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, actor.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, businessStageAt: true },
  });
  if (!brand) throw new PerformanceError("NOT_FOUND", "Brand not found");

  const existingAccount = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brandId),
      eq(performanceAccountTable.organizationId, actor.orgId),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!recordPayment && !existingAccount)
    throw new PerformanceError(
      "BAD_REQUEST",
      "Create the commercial account before recording invoice state",
    );
  const accountId = recordPayment
    ? (
        await promoteBrandToClient(actor, {
          brandId,
          signedAt: brand.businessStageAt,
        })
      ).accountId
    : existingAccount!.id;
  const account = await db.query.performanceAccountTable.findFirst({
    where: eq(performanceAccountTable.id, accountId),
  });

  const existing = await db.query.performanceCycleTable.findFirst({
    where: and(
      eq(performanceCycleTable.accountId, accountId),
      eq(performanceCycleTable.period, period),
    ),
  });
  if (existing) return existing;

  const intake = await db.query.performanceIntakeTable.findFirst({
    where: eq(performanceIntakeTable.accountId, accountId),
    orderBy: desc(performanceIntakeTable.submittedAt),
    columns: { mediaBudgetDollars: true },
  });
  const [cycle] = await db
    .insert(performanceCycleTable)
    .values({
      accountId,
      period,
      billedAmount: account?.monthlyFee ?? null,
      mediaBudget: account?.agreedAdSpend ?? intake?.mediaBudgetDollars ?? null,
      clientMediaContribution: account?.clientMediaContribution ?? null,
      status: "live",
    })
    .onConflictDoNothing({
      target: [performanceCycleTable.accountId, performanceCycleTable.period],
    })
    .returning();
  if (cycle) return cycle;
  return (await db.query.performanceCycleTable.findFirst({
    where: and(
      eq(performanceCycleTable.accountId, accountId),
      eq(performanceCycleTable.period, period),
    ),
  }))!;
}

/**
 * Mark one line of this month's cycle paid, or undo it. A paid fee is what
 * "paid" means on the brand, so it moves the business stage there too; the
 * stage never walks back when a payment is undone, that is a person's call.
 */
export async function markCycleLinePaid(
  actor: PerformanceActor,
  input: { brandId: string; line: BillingLineKind; paid: boolean },
): Promise<PerformanceCycle> {
  const cycle = await ensureCurrentCycle(
    actor,
    input.brandId,
    currentPeriod(),
    input.paid,
  );
  const at = input.paid ? new Date() : null;
  const [updated] = await db
    .update(performanceCycleTable)
    .set(
      input.line === "fee"
        ? { feePaidAt: at, feeInvoiceState: input.paid ? null : "Open" }
        : { mediaPaidAt: at, mediaInvoiceState: input.paid ? null : "Open" },
    )
    .where(eq(performanceCycleTable.id, cycle.id))
    .returning();
  if (input.line === "fee" && input.paid) {
    await advanceBusinessStage(input.brandId, "paid");
  }
  return updated!;
}
