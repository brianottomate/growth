import { expect, test } from "bun:test";
import { currentPeriod } from "./performance-billing";
import {
  performanceCardFromBrand,
  type PipelineBillingCycle,
} from "./performance-card";

test("dashboard receipts use the current and earliest future cycle, not an old paid flag", () => {
  const now = new Date();
  const period = currentPeriod(now);
  const future = currentPeriod(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  );
  const later = currentPeriod(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)),
  );
  const past = currentPeriod(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  );
  const cycle = (period: string, paid: boolean): PipelineBillingCycle => ({
    period,
    billedAmount: 2500,
    mediaBudget: 1500,
    clientMediaContribution: 1000,
    feePaidAt: paid ? now : null,
    mediaPaidAt: null,
  });
  const brand = {
    id: "client",
    name: "Client",
    slug: null,
    logo: null,
    website: null,
    relationship: "client",
    settings: { cardState: { managementPayment: "Paid" as const } },
    campaigns: [],
    billingCycles: [
      cycle(later, false),
      cycle(past, true),
      cycle(future, true),
      cycle(period, false),
    ],
  };
  const card = performanceCardFromBrand(brand);
  expect(card.billing?.current?.period).toBe(period);
  expect(card.billing?.current?.feePaidAt).toBeNull();
  expect(card.billing?.upcoming?.period).toBe(future);
  expect(card.billing?.upcoming?.feePaidAt).toEqual(now);
  expect(card.billing?.upcoming?.mediaPaidAt).toBeNull();
  expect(card.billing?.upcoming?.clientMediaContribution).toBe(1000);
  expect(
    performanceCardFromBrand({ ...brand, billingCycles: [cycle(past, true)] })
      .billing,
  ).toEqual({ period, current: null, upcoming: null });
});
