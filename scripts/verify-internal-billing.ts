import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  performanceAccountTable,
  performanceCycleTable,
} from "@/server/db/schema";
import {
  createPerformanceAccount,
  getPerformanceAccount,
  listPerformanceAccounts,
  openPerformanceCycle,
  updatePerformanceAccount,
  updatePerformanceCycle,
} from "@/server/services/performance.service";
import { generateBillingCycles } from "@/server/services/billing-cycles.service";
import { currentPeriod } from "@/lib/performance-billing";
import { billingPeriods, shiftBillingPeriod } from "@/lib/billing-cycles";
import {
  getPerformanceAccountActionNativeResultSchema,
  listPerformanceAccountsActionNativeResultSchema,
} from "@/server/ai/capabilities/outputs/performance";

if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Run only on a disposable experiment branch");
const existing = await db.query.performanceAccountTable.findFirst();
assert(existing);
const actor = { orgId: existing.organizationId };
const created: string[] = [];
const now = currentPeriod();
try {
  const { account } = await createPerformanceAccount(actor, {
    name: `Billing QA ${crypto.randomUUID()}`,
    status: "active",
    monthlyFee: 1500,
    agreedAdSpend: 1500,
    clientMediaContribution: 500,
    effectiveDate: `${now}-01`,
    endDate: null,
    brandId: null,
    contactName: null,
    contactEmail: null,
    website: null,
    plan: null,
    notes: null,
  });
  created.push(account.id);
  const first = await getPerformanceAccount(actor, account.id);
  assert.equal(first.account.cycles.length, 3);
  const next = first.account.cycles.find(
    (cycle) => cycle.period === shiftBillingPeriod(now, 1),
  )!;
  await updatePerformanceCycle(actor, {
    cycleId: next.id,
    clientMediaContribution: 750,
    feePaid: true,
  });
  const paid = (
    await getPerformanceAccount(actor, account.id)
  ).account.cycles.find((cycle) => cycle.id === next.id)!;
  await updatePerformanceCycle(actor, {
    cycleId: next.id,
    notes: "Prearranged November adjustment",
    feePaid: true,
  });
  const result = await generateBillingCycles({
    ...actor,
    accountId: account.id,
  });
  assert.equal(result.created, 0);
  const after = await getPerformanceAccount(actor, account.id);
  const retained = after.account.cycles.find((cycle) => cycle.id === next.id)!;
  assert.equal(retained.clientMediaContribution, 750);
  const latestCycle = await updatePerformanceCycle(actor, {
    cycleId: next.id,
    clientMediaContribution: 900,
  });
  assert.equal(latestCycle.cycle.clientMediaContribution, 900);
  assert.equal(retained.feePaidAt?.getTime(), paid.feePaidAt?.getTime());
  await updatePerformanceAccount(actor, {
    accountId: account.id,
    monthlyFee: 2000,
  });
  assert.equal(
    (await getPerformanceAccount(actor, account.id)).account.cycles.find(
      (cycle) => cycle.id === next.id,
    )!.billedAmount,
    1500,
  );
  const listing = await listPerformanceAccounts(actor);
  assert.equal(
    listing.accounts.find((row) => row.id === account.id)!.currentCycle?.period,
    now,
  );
  assert.equal(
    listing.accounts.find((row) => row.id === account.id)!.lifetimeBilled,
    2000,
  );
  getPerformanceAccountActionNativeResultSchema.parse(after);
  listPerformanceAccountsActionNativeResultSchema.parse(listing);
  await assert.rejects(
    updatePerformanceAccount(
      { orgId: "foreign-workspace" },
      { accountId: account.id, monthlyFee: 1 },
    ),
  );
  await assert.rejects(
    updatePerformanceCycle(
      { orgId: "foreign-workspace" },
      { cycleId: next.id, billedAmount: 1 },
    ),
  );
  assert.equal(
    (
      await generateBillingCycles({
        orgId: "foreign-workspace",
        accountId: account.id,
      })
    ).created,
    0,
  );
  await assert.rejects(
    updatePerformanceCycle(actor, {
      cycleId: next.id,
      clientMediaContribution: 2000,
    }),
  );
  await openPerformanceCycle(actor, {
    accountId: account.id,
    period: shiftBillingPeriod(now, 3),
    billedAmount: 0,
    mediaBudget: 0,
    clientMediaContribution: 0,
    notes: null,
    startAt: null,
    endAt: null,
  });
  const explicit = (
    await getPerformanceAccount(actor, account.id)
  ).account.cycles.find(
    (cycle) => cycle.period === shiftBillingPeriod(now, 3),
  )!;
  assert.equal(explicit.billedAmount, 0);
  assert.equal(explicit.mediaBudget, 0);
  assert.deepEqual(
    billingPeriods({
      status: "paused",
      effectiveDate: "2026-01-01",
      endDate: null,
    }),
    [],
  );
  assert.deepEqual(
    billingPeriods(
      { status: "active", effectiveDate: "2026-10-23", endDate: "2026-11-01" },
      new Date("2026-10-07"),
    ),
    ["2026-10"],
  );
  console.log(
    "PASS: cycle snapshots, repeated generation, future edits, paid dates, account defaults, current selection, workspace isolation, zero budgets, contract boundaries, and AI output contracts",
  );
} finally {
  if (created.length)
    await db
      .delete(performanceAccountTable)
      .where(
        and(
          eq(performanceAccountTable.organizationId, actor.orgId),
          inArray(performanceAccountTable.id, created),
        ),
      );
}
