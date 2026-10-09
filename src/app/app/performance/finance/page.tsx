import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { workspaceActor } from "@/server/workspace-actor";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { financeAccounts, monthLabel } from "@/lib/performance-finance";
import { lineLabel } from "@/lib/performance-billing";
import { cn } from "@/components/ui/lib/utils";

import { BrandLogo } from "../_components";
import { PerformancePageHeader } from "../PageHeader";
import { BusinessChip } from "../StageChip";
import { FinanceOverview } from "../FinanceOverview";

export const metadata: Metadata = { title: "Finance · Wander Performance" };
export const dynamic = "force-dynamic";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * The money side of Performance, read off the clients: what is paying now,
 * what is signed, the media we manage, and what this month still owes. The
 * projection is only recorded start and end dates carried forward.
 */
export default async function PerformanceFinancePage() {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const desk = await loadPerformanceDesk(actor.orgId);
  const accounts = financeAccounts(desk.brands);
  return (
    <div className="flex flex-col gap-6">
      <PerformancePageHeader
        title="Finance"
        description="Fees and media across signed clients, paying against signed, carried forward from recorded dates."
      />
      <FinanceOverview accounts={accounts} />
      <section className="space-y-2">
        <div className="flex items-baseline gap-2 px-1">
          <h2 className="text-[13px] font-semibold">Clients</h2>
          <span className="text-xs text-muted-foreground">
            {accounts.length}
          </span>
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          <li className="hidden grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.6fr)] gap-x-4 px-4 py-2 text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase @3xl:grid">
            <span>Client</span>
            <span className="text-right">Fee / mo</span>
            <span className="text-right">Media / mo</span>
            <span>Starts</span>
            <span>Ends</span>
            <span>This month</span>
          </li>
          {accounts.map((account) => (
            <li
              key={account.id}
              className="grid grid-cols-2 items-center gap-x-4 gap-y-1 px-4 py-3 text-[12.5px] @3xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]"
            >
              <div className="col-span-2 flex min-w-0 items-center gap-3 @3xl:col-span-1">
                <BrandLogo brand={account} className="size-8 text-[11px]" />
                <div className="min-w-0">
                  <Link
                    href={`/app/performance/clients/${account.slug ?? account.id}`}
                    className="block truncate text-[13px] font-semibold hover:underline"
                  >
                    {account.name}
                  </Link>
                  <BusinessChip stage={account.business} className="mt-0.5" />
                </div>
              </div>
              <span className="text-right tabular-nums @3xl:text-right">
                {account.fee == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  dollars.format(account.fee)
                )}
              </span>
              <span className="text-right tabular-nums">
                {account.adBudget == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  dollars.format(account.adBudget)
                )}
              </span>
              <span className="text-muted-foreground">
                {account.start ? monthLabel(account.start) : "—"}
              </span>
              <span className="text-muted-foreground">
                {account.end ? monthLabel(account.end) : "—"}
              </span>
              <span className="col-span-2 text-xs @3xl:col-span-1">
                {account.billing ? (
                  <span className="flex flex-wrap gap-x-3">
                    <Line
                      label="Fee"
                      paid={Boolean(account.billing.fee.paidAt)}
                    >
                      {lineLabel(account.billing.fee)}
                    </Line>
                    <Line
                      label="Ads"
                      paid={Boolean(account.billing.media.paidAt)}
                    >
                      {lineLabel(account.billing.media)}
                    </Line>
                  </span>
                ) : (
                  <span className="text-muted-foreground">No cycle yet</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Line({
  label,
  paid,
  children,
}: {
  label: string;
  paid: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn("tabular-nums", paid && "text-muted-foreground")}
      style={paid ? undefined : { color: "var(--color-warning)" }}
    >
      {label} {children}
    </span>
  );
}
