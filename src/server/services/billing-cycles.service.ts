import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { billingPeriods, shiftBillingPeriod } from "@/lib/billing-cycles";
import { db } from "@/server/db";
import {
  performanceAccountTable,
  performanceCycleTable,
} from "@/server/db/schema";

/** Insert missing snapshots only. Existing months belong to their editor. */
export async function generateBillingCycles(
  input: { orgId?: string; accountId?: string } = {},
) {
  const accounts = await db.query.performanceAccountTable.findMany({
    where: and(
      isNull(performanceAccountTable.deletedAt),
      input.orgId
        ? eq(performanceAccountTable.organizationId, input.orgId)
        : undefined,
      input.accountId
        ? eq(performanceAccountTable.id, input.accountId)
        : undefined,
    ),
    with: { brand: { columns: { businessStage: true, deletedAt: true } } },
  });
  let created = 0;
  for (const account of accounts) {
    if (
      account.brand &&
      (account.brand.deletedAt ||
        ["paused", "churned", "lost"].includes(
          account.brand.businessStage ?? "",
        ))
    )
      continue;
    const periods = billingPeriods(account);
    if (!periods.length) continue;
    const rows = await db
      .insert(performanceCycleTable)
      .values(
        periods.map((period) => ({
          accountId: account.id,
          period,
          billedAmount: account.monthlyFee,
          mediaBudget: account.agreedAdSpend,
          clientMediaContribution: account.clientMediaContribution,
          status: "planned" as const,
          notes:
            account.effectiveDate! > `${period}-01` ||
            (account.endDate &&
              account.endDate < `${shiftBillingPeriod(period, 1)}-01`)
              ? "Partial agreement month. Review amounts; automatic proration is not applied."
              : null,
        })),
      )
      .onConflictDoNothing({
        target: [performanceCycleTable.accountId, performanceCycleTable.period],
      })
      .returning({ id: performanceCycleTable.id });
    created += rows.length;
  }
  return { created };
}
