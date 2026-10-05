import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/lib/utils";
import type { PerformancePipelineCard } from "@/lib/performance-card";
import { BrandLogo } from "./_components";
import { StatusChips } from "./AccountStatus";
import { PipelineStageChip } from "./StageChip";
import type { CardView } from "./PerformanceClientCard";

const money = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);

/**
 * The pipeline as one alphabetical list: each client as its full card, each
 * prospect as one line, with the stage worn as a chip rather than a heading.
 */
export function AccountList({
  cards,
  view = "All",
  menus,
  details,
  className,
}: {
  cards: PerformancePipelineCard[];
  view?: CardView;
  /** A quiet per-row menu, keyed by card id; rendered at the row's end. */
  menus?: Record<string, ReactNode>;
  /** The full card for a client, keyed by card id; accounts without one render as a row. */
  details?: Record<string, ReactNode>;
  className?: string;
}) {
  const rows = [...cards].sort((a, b) => a.name.localeCompare(b.name));
  if (rows.length === 0)
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No accounts match.
      </p>
    );
  return (
    <ul className={cn("space-y-2", className)}>
      {rows.map((card) =>
        details?.[card.id] ? (
          <li key={card.id}>{details[card.id]}</li>
        ) : (
          <AccountRow
            key={card.id}
            card={card}
            view={view}
            menu={menus?.[card.id]}
          />
        ),
      )}
    </ul>
  );
}

function AccountRow({
  card,
  view,
  menu,
}: {
  card: PerformancePipelineCard;
  view: CardView;
  menu?: ReactNode;
}) {
  const prospect = card.stage === "prospects";
  const meta = prospect
    ? [
        card.website?.replace(/^https?:\/\//, ""),
        card.campaignCount
          ? `${card.campaignCount} draft campaign${card.campaignCount === 1 ? "" : "s"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Nothing started"
    : `Mgmt ${money(card.management)} · Ad budget ${money(card.spend)}`;
  const checklist = card.readiness?.checklist;
  return (
    <li className="relative grid grid-cols-1 items-center gap-x-5 gap-y-2.5 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,2.4fr)_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <BrandLogo brand={card} className="size-8 text-[11px]" />
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <Link
              href={card.href}
              className="truncate text-[13px] font-semibold after:absolute after:inset-0 hover:underline"
            >
              {card.name}
            </Link>
            <PipelineStageChip stage={card.stage} />
          </span>
          <p className="truncate text-[11.5px] text-muted-foreground">{meta}</p>
        </div>
      </div>
      <StatusChips state={card.state} view={view} />
      <div className="min-w-0 space-y-1.5">
        {checklist ? (
          <>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {checklist.done} of {checklist.total} done
            </p>
            <div
              role="progressbar"
              aria-label="Launch checklist"
              aria-valuemin={0}
              aria-valuemax={checklist.total}
              aria-valuenow={checklist.done}
              className="h-[3px] overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-foreground"
                style={{
                  width: `${checklist.total ? (checklist.done / checklist.total) * 100 : 0}%`,
                }}
              />
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {prospect ? "Not started" : "No checklist"}
          </p>
        )}
      </div>
      {menu ? (
        <div className="relative z-10 justify-self-end">{menu}</div>
      ) : null}
    </li>
  );
}
