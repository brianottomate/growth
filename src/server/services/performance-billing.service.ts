import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { currentPeriod } from "@/lib/performance-billing";
import type { ManualBillingPatch } from "@/lib/manual-billing";
import {
  db,
  withTransaction,
  type Database,
  type TransactionClient,
} from "@/server/db";
import {
  brandTable,
  performanceAccountTable,
  performanceCycleTable,
  type PerformanceCycle,
} from "@/server/db/schema";
import { PerformanceError, type PerformanceActor } from "./performance.service";
export type BillingLineKind = "fee" | "media";

// These are manually maintained monthly rows. No stage promotion, provider
// verification, campaign rollup, or intake inference occurs when saving billing.
export async function ensureCurrentCycle(
  actor: PerformanceActor,
  brandId: string,
  period = currentPeriod(),
  client: Database | TransactionClient = db,
): Promise<PerformanceCycle> {
  const brand = await client.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, actor.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
  if (!brand) throw new PerformanceError("NOT_FOUND", "Client not found");
  const [account] = await client
    .insert(performanceAccountTable)
    .values({ brandId, organizationId: actor.orgId, name: brand.name })
    .onConflictDoUpdate({
      target: performanceAccountTable.brandId,
      targetWhere: sql`${performanceAccountTable.deletedAt} is null`,
      set: { brandId },
    })
    .returning();
  const [cycle] = await client
    .insert(performanceCycleTable)
    .values({ accountId: account!.id, period })
    .onConflictDoUpdate({
      target: [performanceCycleTable.accountId, performanceCycleTable.period],
      set: { period },
    })
    .returning();
  return cycle!;
}
export function manualBillingResult(cycle: PerformanceCycle) {
  return {
    period: cycle.period,
    managementFee: cycle.billedAmount,
    adSpend: cycle.clientMediaContribution,
    managementPayment: cycle.feePaidAt
      ? ("Paid" as const)
      : cycle.feeInvoiceState,
    spendPayment: cycle.mediaPaidAt
      ? ("Paid" as const)
      : cycle.mediaInvoiceState,
  };
}
export async function writeManualBilling(
  actor: PerformanceActor,
  brandId: string,
  patch: ManualBillingPatch,
  client: Database | TransactionClient,
) {
  const cycle = await ensureCurrentCycle(actor, brandId, patch.period, client);
  const changes: Partial<typeof performanceCycleTable.$inferInsert> = {};
  if (patch.managementFee !== undefined)
    changes.billedAmount = patch.managementFee;
  if (patch.adSpend !== undefined) {
    changes.mediaBudget = patch.adSpend;
    changes.clientMediaContribution = patch.adSpend;
  }
  for (const [key, dateKey, stateKey] of [
    ["managementPayment", "feePaidAt", "feeInvoiceState"],
    ["spendPayment", "mediaPaidAt", "mediaInvoiceState"],
  ] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    changes[dateKey] = value === "Paid" ? new Date() : null;
    changes[stateKey] = value === "Paid" ? null : value;
  }
  const [saved] = await client
    .update(performanceCycleTable)
    .set(Object.keys(changes).length ? changes : { period: patch.period })
    .where(eq(performanceCycleTable.id, cycle.id))
    .returning();
  return saved!;
}
export async function markCycleLinePaid(
  actor: PerformanceActor,
  input: { brandId: string; line: BillingLineKind; paid: boolean },
) {
  return withTransaction((client) =>
    writeManualBilling(
      actor,
      input.brandId,
      {
        period: currentPeriod(),
        [input.line === "fee" ? "managementPayment" : "spendPayment"]:
          input.paid ? "Paid" : "Open",
      },
      client,
    ),
  );
}
