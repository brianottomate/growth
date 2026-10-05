import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  PERFORMANCE_FEE_DOLLARS,
  currentPeriod,
} from "@/lib/performance-billing";
import { db } from "@/server/db";
import {
  brandTable,
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

  const { accountId } = await promoteBrandToClient(actor, {
    brandId,
    signedAt: brand.businessStageAt,
  });
  const period = currentPeriod();

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
      billedAmount: PERFORMANCE_FEE_DOLLARS,
      mediaBudget: intake?.mediaBudgetDollars ?? null,
      status: "live",
    })
    .returning();
  return cycle!;
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
  const cycle = await ensureCurrentCycle(actor, input.brandId);
  const at = input.paid ? new Date() : null;
  const [updated] = await db
    .update(performanceCycleTable)
    .set(input.line === "fee" ? { feePaidAt: at } : { mediaPaidAt: at })
    .where(eq(performanceCycleTable.id, cycle.id))
    .returning();
  // The Overview card shows the same fact; keep it in step without going
  // through setPerformanceSettings, which calls back into here.
  const key = input.line === "fee" ? "managementPayment" : "spendPayment";
  const state = JSON.stringify({ [key]: input.paid ? "Paid" : "Open" });
  await db
    .update(brandTable)
    .set({
      performanceSettings: sql`coalesce(${brandTable.performanceSettings}, '{}'::jsonb) || jsonb_build_object('cardState', coalesce(${brandTable.performanceSettings}->'cardState', '{}'::jsonb) || ${state}::jsonb)`,
    })
    .where(
      and(
        eq(brandTable.id, input.brandId),
        // Undoing only clears a Paid; a card already set to another state
        // (Not invoiced) is the person's answer and stays.
        input.paid
          ? undefined
          : sql`${brandTable.performanceSettings}->'cardState'->>${key} = 'Paid'`,
      ),
    );
  if (input.line === "fee" && input.paid) {
    await advanceBusinessStage(input.brandId, "paid");
  }
  return updated!;
}
