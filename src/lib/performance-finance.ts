import type { DeskBrand } from "@/server/services/performance-desk.service";
import { isClientStage, isClosedStage } from "./performance-stage";

/** "2026-09" */
export type MonthKey = string;

export type FinanceAccount = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  business: DeskBrand["business"];
  /** Dollars a month Wander charges; null until someone records it. */
  fee: number | null;
  /** Dollars a month agreed for media; null until recorded. */
  adBudget: number | null;
  /** The month the contract starts, from the effective date or the stage change. */
  start: MonthKey | null;
  /** The month it ends, when an end date is recorded. */
  end: MonthKey | null;
  paying: boolean;
  billing: DeskBrand["billing"];
};

export type FinanceMonth = {
  month: MonthKey;
  /** Fees from clients recorded as paying whose contract covers the month. */
  actualFees: number;
  /** Fees from every signed client whose contract covers the month. */
  committedFees: number;
  /** Agreed media from every signed client whose contract covers the month. */
  committedMedia: number;
  future: boolean;
};

export function monthKey(date: Date): MonthKey {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: MonthKey) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, m! - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [year, m] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(year!, m! - 1 + by, 1)));
}

function keyFromDate(value: string | Date | null | undefined): MonthKey | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : monthKey(date);
}

/**
 * The commercial facts on each signed client, read off the brand. Prospects
 * and closed brands are left out: a prospect has no fee to count, and a lost
 * or churned brand's money has stopped.
 */
export function financeAccounts(brands: DeskBrand[]): FinanceAccount[] {
  return brands
    .filter(
      (brand) =>
        isClientStage(brand.business) && !isClosedStage(brand.business),
    )
    .map((brand) => ({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logo: brand.logo,
      business: brand.business,
      fee: brand.settings?.monthlyFee ?? null,
      adBudget: brand.settings?.agreedAdSpend ?? null,
      start:
        keyFromDate(brand.settings?.effectiveDate) ??
        keyFromDate(brand.businessAt),
      end: keyFromDate(brand.settings?.endDate),
      // Paid as a stage, or this month's fee settled: either is money in.
      paying: brand.business === "paid" || Boolean(brand.billing?.fee.paidAt),
      billing: brand.billing,
    }))
    .sort(
      (a, b) => (b.fee ?? 0) - (a.fee ?? 0) || a.name.localeCompare(b.name),
    );
}

function covers(account: FinanceAccount, month: MonthKey) {
  if (account.business === "paused") return false;
  if (account.start && account.start > month) return false;
  if (account.end && account.end < month) return false;
  return true;
}

/** Fee and media totals by month: `back` months of history, this month, `ahead` months of projection. */
export function financeSeries(
  accounts: FinanceAccount[],
  now = new Date(),
  back = 3,
  ahead = 3,
): FinanceMonth[] {
  const current = monthKey(now);
  const months: FinanceMonth[] = [];
  for (let offset = -back; offset <= ahead; offset += 1) {
    const month = shiftMonth(current, offset);
    const active = accounts.filter((account) => covers(account, month));
    months.push({
      month,
      actualFees: active
        .filter((account) => account.paying)
        .reduce((sum, account) => sum + (account.fee ?? 0), 0),
      committedFees: active.reduce(
        (sum, account) => sum + (account.fee ?? 0),
        0,
      ),
      committedMedia: active.reduce(
        (sum, account) => sum + (account.adBudget ?? 0),
        0,
      ),
      future: month > current,
    });
  }
  return months;
}

export type FinanceTotals = {
  actualMrr: number;
  committedMrr: number;
  committedMedia: number;
  paying: number;
  signed: number;
  paused: number;
  unrecordedFees: number;
  openFee: { count: number; dollars: number };
  openMedia: { count: number; dollars: number };
};

/** Today's numbers: what is paying now, what is signed, and what is still open this month. */
export function financeTotals(accounts: FinanceAccount[]): FinanceTotals {
  const month = monthKey(new Date());
  const active = accounts.filter((account) => covers(account, month));
  const open = (line: "fee" | "media") =>
    accounts
      .filter((account) => account.billing && !account.billing[line].paidAt)
      .reduce(
        (sum, account) => ({
          count: sum.count + 1,
          dollars: sum.dollars + (account.billing![line].amount ?? 0),
        }),
        { count: 0, dollars: 0 },
      );
  return {
    actualMrr: active
      .filter((account) => account.paying)
      .reduce((sum, account) => sum + (account.fee ?? 0), 0),
    committedMrr: active.reduce((sum, account) => sum + (account.fee ?? 0), 0),
    committedMedia: active.reduce(
      (sum, account) => sum + (account.adBudget ?? 0),
      0,
    ),
    paying: accounts.filter((account) => account.paying).length,
    signed: accounts.filter((account) => account.business === "signed").length,
    paused: accounts.filter((account) => account.business === "paused").length,
    unrecordedFees: accounts.filter(
      (account) => account.business !== "paused" && account.fee == null,
    ).length,
    openFee: open("fee"),
    openMedia: open("media"),
  };
}
