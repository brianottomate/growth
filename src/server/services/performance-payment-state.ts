import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { currentPeriod } from "@/lib/performance-billing";
import type { PerformanceSettings } from "@/server/db/brand-schema";
import { db, type Database, type TransactionClient } from "@/server/db";
import {
  performanceAccountTable,
  performanceCycleTable,
  type PerformanceCycle,
} from "@/server/db/schema";

type PaymentCycle = Pick<
  PerformanceCycle,
  | "period"
  | "feePaidAt"
  | "mediaPaidAt"
  | "feeInvoiceState"
  | "mediaInvoiceState"
>;
export function projectPaymentSettings(
  settings: PerformanceSettings | null,
  cycle?: PaymentCycle | null,
): PerformanceSettings {
  const {
    managementPayment: _fee,
    spendPayment: _media,
    ...state
  } = settings?.cardState ?? {};
  return {
    ...settings,
    cardState: {
      ...state,
      managementPayment: cycle?.feePaidAt
        ? "Paid"
        : (cycle?.feeInvoiceState ?? null),
      spendPayment: cycle?.mediaPaidAt
        ? "Paid"
        : (cycle?.mediaInvoiceState ?? null),
    },
  };
}
export async function readPaymentSettings(
  brandId: string,
  settings: PerformanceSettings | null,
  client: Database | TransactionClient = db,
) {
  const account = await client.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brandId),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true },
  });
  const cycle = account
    ? await client.query.performanceCycleTable.findFirst({
        where: and(
          eq(performanceCycleTable.accountId, account.id),
          eq(
            performanceCycleTable.period,
            settings?.cardState?.billingPeriod ?? currentPeriod(),
          ),
        ),
      })
    : null;
  return projectPaymentSettings(settings, cycle);
}
