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
  dense = false,
}: {
  card: PerformancePipelineCard;
  className?: string;
  dense?: boolean;
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
      {card.stage !== "prospects" &&
        (dense ? (
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-2 gap-y-1 text-[10px]">
            <span className="text-muted-foreground">Billing month</span>
            <span className="text-muted-foreground">Fee</span>
            <span className="text-muted-foreground">Ads</span>
            <DenseCycle
              label={`Current · ${periodLabel(card.billing.period)}`}
              cycle={card.billing.current}
              card={card}
            />
            <DenseCycle
              label={
                card.billing.upcoming
                  ? `Next · ${periodLabel(card.billing.upcoming.period)}`
                  : "Next month"
              }
              cycle={card.billing.upcoming}
              card={card}
            />
          </div>
        ) : (
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
        ))}
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
  dense = false,
  recurring,
}: {
  label: string;
  amount: number | null;
  paidAt: Date | null;
  invoiceState?: "Not invoiced" | "Open" | null;
  dense?: boolean;
  recurring?: number | null;
}) {
  const status = paidAt ? "Paid" : (invoiceState ?? "Not recorded");
  return (
    <span
      className={
        dense
          ? "flex flex-wrap items-center gap-x-1 tabular-nums"
          : "inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
      }
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
      {(!dense || (amount != null && amount !== recurring)) && (
        <span className="text-muted-foreground">
          {!dense && label}
          {amount != null ? ` ${money(amount)}` : ""}
        </span>
      )}
      <span className="font-medium">{status}</span>
    </span>
  );
}

function DenseCycle({
  label,
  cycle,
  card,
}: {
  label: string;
  cycle: PipelineBillingCycle | null;
  card: PerformancePipelineCard;
}) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      {cycle ? (
        <>
          <Receipt
            label="Fee"
            amount={cycle.billedAmount}
            paidAt={cycle.feePaidAt}
            invoiceState={cycle.feeInvoiceState}
            dense
            recurring={card.management}
          />
          <Receipt
            label="Ads"
            amount={cycle.clientMediaContribution}
            paidAt={cycle.mediaPaidAt}
            invoiceState={cycle.mediaInvoiceState}
            dense
            recurring={card.spend}
          />
        </>
      ) : (
        <span className="col-span-2 text-muted-foreground">
          No cycle recorded
        </span>
      )}
    </>
  );
}
