import type {
  PerformancePipelineCard,
  PipelineBillingCycle,
} from "@/lib/performance-card";
import { periodLabel } from "@/lib/performance-billing";
import { cn } from "@/components/ui/lib/utils";

const money = (value: number | null) =>
  value == null
    ? "Not recorded"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }).format(value);

/** Contract amounts and month-specific receipts are separate facts. */
export function CardBilling({
  card,
  className,
}: {
  card: PerformancePipelineCard;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1 text-[11px]", className)}>
      <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
        <span>
          <span className="text-muted-foreground">Management </span>
          <span className="font-medium">{money(card.management)}</span>
          {card.management != null && (
            <span className="text-muted-foreground">/mo</span>
          )}
        </span>
        <span>
          <span className="text-muted-foreground">Ad spend </span>
          <span className="font-medium">{money(card.spend)}</span>
          {card.spend != null && (
            <span className="text-muted-foreground">/mo</span>
          )}
        </span>
      </div>
      {card.stage !== "prospects" && (
        <div className="space-y-1">
          <CycleReceipt
            label={`Current · ${periodLabel(card.billing.period)}`}
            cycle={card.billing.current}
          />
          <CycleReceipt
            label={
              card.billing.upcoming
                ? `Upcoming · ${periodLabel(card.billing.upcoming.period)}`
                : "Upcoming"
            }
            cycle={card.billing.upcoming}
          />
        </div>
      )}
    </div>
  );
}

function CycleReceipt({
  label,
  cycle,
}: {
  label: string;
  cycle: PipelineBillingCycle | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground">{label}</span>
      {cycle ? (
        <>
          <Receipt
            label="Fee"
            amount={cycle.billedAmount}
            paidAt={cycle.feePaidAt}
            invoiceState={cycle.feeInvoiceState}
          />
          <Receipt
            label="Ads"
            amount={cycle.clientMediaContribution}
            paidAt={cycle.mediaPaidAt}
            invoiceState={cycle.mediaInvoiceState}
          />
        </>
      ) : (
        <span className="text-muted-foreground">No cycle recorded</span>
      )}
    </div>
  );
}

function Receipt({
  label,
  amount,
  paidAt,
  invoiceState,
}: {
  label: string;
  amount: number | null;
  paidAt: Date | null;
  invoiceState?: "Not invoiced" | "Open" | null;
}) {
  const status = paidAt ? "Paid" : (invoiceState ?? "Not recorded");
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
      style={{
        color: paidAt
          ? "var(--color-success)"
          : status === "Open"
            ? "var(--color-warning)"
            : undefined,
      }}
      title={`${label}: ${money(amount)}${paidAt ? ` · Marked Paid ${new Date(paidAt).toLocaleDateString("en-US", { timeZone: "UTC" })}` : ""}`}
      aria-label={`${label}: ${money(amount)}, ${status}`}
    >
      <span className="text-muted-foreground">
        {label}
        {amount != null ? ` ${money(amount)}` : ""}
      </span>
      <span className="font-medium">{status}</span>
    </span>
  );
}
