import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { workspaceActor } from "@/server/workspace-actor";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import {
  financeAccounts,
  financeSeries,
  financeTotals,
  monthLabel,
} from "@/lib/performance-finance";
import { lineLabel } from "@/lib/performance-billing";
import { cn } from "@/components/ui/lib/utils";

import { BrandLogo } from "../_components";
import { PerformancePageHeader } from "../PageHeader";
import { BusinessChip } from "../StageChip";
import { FinanceChart } from "./FinanceChart";

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
  const totals = financeTotals(accounts);
  const months = financeSeries(accounts);
  const tiles: { label: string; value: string; note?: string }[] = [
    {
      label: "Paying ARR",
      value: dollars.format(totals.actualMrr * 12),
      note: `${dollars.format(totals.actualMrr)}/mo · ${totals.paying} paying`,
    },
    {
      label: "Signed ARR",
      value: dollars.format(totals.committedMrr * 12),
      note: `${dollars.format(totals.committedMrr)}/mo · ${accounts.length - totals.paused} signed`,
    },
    {
      label: "Media under management",
      value: `${dollars.format(totals.committedMedia)}/mo`,
      note: `${dollars.format(totals.committedMedia * 12)} a year`,
    },
    {
      label: "Open this month",
      value: dollars.format(totals.openFee.dollars + totals.openMedia.dollars),
      note: `${totals.openFee.count} fee · ${totals.openMedia.count} media`,
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PerformancePageHeader
        title="Finance"
        description="Fees and media across signed clients, paying against signed, carried forward from recorded dates."
      />
      <div className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="text-[11px] text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
              {tile.value}
            </p>
            {tile.note ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {tile.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <FinanceChart months={months} />
      {totals.unrecordedFees > 0 || totals.paused > 0 ? (
        <p className="text-xs text-muted-foreground">
          {[
            totals.unrecordedFees > 0
              ? `${totals.unrecordedFees} signed ${totals.unrecordedFees === 1 ? "client has" : "clients have"} no fee recorded and count as zero`
              : null,
            totals.paused > 0
              ? `${totals.paused} paused ${totals.paused === 1 ? "client is" : "clients are"} left out`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      ) : null}
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
