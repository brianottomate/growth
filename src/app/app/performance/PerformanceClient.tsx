"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";

import type { PerformanceAccountStatus } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";
import { NewAccountDialog } from "./NewAccountDialog";

const STATUS_META: Record<
  PerformanceAccountStatus,
  { label: string; dot: string; cls: string }
> = {
  active: { label: "Active", dot: "bg-emerald-400", cls: "text-emerald-300" },
  onboarding: { label: "Onboarding", dot: "bg-sky-400", cls: "text-sky-300" },
  prospect: {
    label: "Prospect",
    dot: "bg-muted-foreground",
    cls: "text-muted-foreground",
  },
  paused: { label: "Paused", dot: "bg-amber-400", cls: "text-amber-300" },
  churned: { label: "Churned", dot: "bg-red-400", cls: "text-red-300" },
};

const usd = (value: number | null | undefined) =>
  typeof value === "number"
    ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "—";

/** A count of 0 reads as a gap, not as data — keep it visually quiet. */
function Count({ value }: { value: number }) {
  if (value === 0)
    return <Minus className="text-muted-foreground/40 mx-auto size-3" />;
  return <span>{value}</span>;
}

function Yes({ value }: { value: boolean }) {
  return value ? (
    <Check className="mx-auto size-3.5 text-emerald-400" />
  ) : (
    <Minus className="text-muted-foreground/40 mx-auto size-3" />
  );
}

export function PerformanceClient() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.performance.list.queryOptions());
  const accounts = data?.accounts ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
        <h1 className="text-xl font-semibold">Performance+</h1>
        <p className="text-muted-foreground text-sm">
          Property managers paying for placement on Wander&apos;s marketing
          surfaces. Sold through{" "}
          <span className="font-mono text-xs">wander.com/list-plus</span>;
          payment is handled offline.
        </p>
        </div>
        <NewAccountDialog />
      </header>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Loading accounts…</p>
      )}

      {!isLoading && accounts.length === 0 && (
        <div className="border-border rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No Performance+ customers yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Use the button above, or ask the assistant to onboard one.
          </p>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary/40 text-muted-foreground text-xs">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>Customer</th>
                <th>Status</th>
                <th>Plan</th>
                <th className="text-center!">Homes</th>
                <th>Cycle</th>
                <th className="text-right!">Billed</th>
                <th className="text-right!">Media</th>
                <th className="text-right!">Spent</th>
                <th className="text-center!">Ads</th>
                <th className="text-center!">Emails</th>
                <th className="text-center!">Creators</th>
                <th className="text-center!">Report</th>
                <th className="text-right!">Lifetime</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const status = STATUS_META[account.status];
                const cycle = account.currentCycle;
                return (
                  <tr
                    key={account.id}
                    className="border-border hover:bg-surface-secondary/30 border-t [&>td]:px-3 [&>td]:py-2.5"
                  >
                    <td>
                      <Link
                        href={`/app/performance/${account.id}`}
                        className="font-medium hover:underline"
                      >
                        {account.name}
                      </Link>
                      {account.contactName && (
                        <div className="text-muted-foreground text-xs">
                          {account.contactName}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${status.cls}`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${status.dot}`}
                        />
                        {status.label}
                      </span>
                    </td>
                    <td className="text-muted-foreground text-xs">
                      {account.plan ?? "—"}
                    </td>
                    <td className="text-center">
                      <Count value={account.properties.length} />
                    </td>
                    <td className="font-mono text-xs">
                      {cycle ? cycle.period : "—"}
                      {cycle && (
                        <div className="text-muted-foreground">
                          {cycle.status}
                        </div>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {usd(cycle?.billedAmount)}
                    </td>
                    <td className="text-right tabular-nums">
                      {usd(cycle?.mediaBudget)}
                    </td>
                    <td className="text-right tabular-nums">
                      {typeof cycle?.actualSpendCents === "number" ? (
                        <span
                          className={
                            cycle.mediaBudget &&
                            cycle.actualSpendCents / 100 > cycle.mediaBudget
                              ? "text-red-300"
                              : undefined
                          }
                        >
                          ${(cycle.actualSpendCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      <Count value={cycle?.delivery.ads ?? 0} />
                    </td>
                    <td className="text-center">
                      <Count value={cycle?.delivery.emails ?? 0} />
                    </td>
                    <td className="text-center">
                      <Count value={cycle?.delivery.influencers ?? 0} />
                    </td>
                    <td className="text-center">
                      <Yes value={cycle?.hasReport ?? false} />
                    </td>
                    <td className="text-right tabular-nums">
                      {usd(account.lifetimeBilled)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Spent is the sum of every campaign attached to the cycle, refreshed by
        the Zernio ads sync, and turns red past the media budget. Bookings and
        recommendations are not tracked yet — attribution needs the Order
        Completed webhook.
      </p>
    </div>
  );
}
