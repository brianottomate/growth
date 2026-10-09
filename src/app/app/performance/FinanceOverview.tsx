import {
  financeSeries,
  financeTotals,
  type FinanceAccount,
} from "@/lib/performance-finance";
import { FinanceChart } from "./finance/FinanceChart";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Shared portfolio summary for the dashboard and detailed Finance view. */
export function FinanceOverview({ accounts }: { accounts: FinanceAccount[] }) {
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
    <div className="space-y-6">
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
    </div>
  );
}
