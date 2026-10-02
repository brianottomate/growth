"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/lib/utils";
import {
  journeyColumn,
  JOURNEY_COLUMNS,
  matchesPortfolio,
  type JourneyColumn,
} from "@/lib/performance-journey";
import {
  DELIVERY_LABEL,
  type BusinessStage,
  type DeliveryStage,
} from "@/lib/performance-stage";
import { StageDialog } from "./StageDialog";
import { StageChips } from "./StageChip";

export type JourneyBrand = {
  id: string;
  name: string;
  slug: string | null;
  website: string | null;
  logo: string | null;
  business: BusinessStage;
  delivery: DeliveryStage;
  budget: number;
  spend: number;
  adCount: number;
  campaignCount: number;
  photo: string | null;
  readiness: {
    done: number;
    total: number;
    next: string | null;
    href: string | null;
    action: string | null;
  } | null;
};
const TONE: Record<JourneyColumn, string> = {
  Prospecting: "bg-zinc-500",
  Onboarding: "bg-sky-500",
  Building: "bg-violet-500",
  "Ready for review": "bg-amber-500",
  Live: "bg-emerald-500",
  Paused: "bg-zinc-500",
  Closed: "bg-zinc-500",
};
const DETAIL: Record<JourneyColumn, string> = {
  Prospecting: "Pitch and qualify",
  Onboarding: "Intake and account access",
  Building: "Properties, audience and ads",
  "Ready for review": "Review creative and launch",
  Live: "Monitor delivery",
  Paused: "Delivery or relationship on hold",
  Closed: "Lost or churned",
};

export function JourneyBoard({
  brands,
  clientsOnly = false,
}: {
  brands: JourneyBrand[];
  clientsOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<JourneyColumn | "all">("all");
  const [staging, setStaging] = useState<JourneyBrand | null>(null);
  const columns = JOURNEY_COLUMNS.filter(
    (column) =>
      (!clientsOnly || (column !== "Prospecting" && column !== "Closed")) &&
      (filter === "all" || filter === column),
  );
  const visible = brands.filter(
    (brand) =>
      (filter === "all" || journeyColumn(brand) === filter) &&
      matchesPortfolio(
        `${brand.name} ${brand.website ?? ""} ${brand.business} ${DELIVERY_LABEL[brand.delivery]}`,
        query,
      ),
  );
  return (
    <section aria-label="Client journey" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Search journey</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search accounts or sites"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Delivery view
          <select
            aria-label="Filter journey stage"
            className="rounded-lg border bg-background px-3 py-2 text-foreground"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as JourneyColumn | "all")
            }
          >
            <option value="all">All stages</option>
            {JOURNEY_COLUMNS.filter(
              (column) =>
                !clientsOnly ||
                (column !== "Prospecting" && column !== "Closed"),
            ).map((column) => (
              <option key={column}>{column}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {visible.length} accounts · Delivery stages include recorded team
        updates and campaign activity. Billing stays separate.
      </p>
      <div
        className={cn(
          "grid min-w-0 grid-cols-1 gap-3",
          filter === "all" &&
            "@lg:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-5",
        )}
      >
        {columns.map((column) => {
          const accounts = visible.filter(
            (brand) => journeyColumn(brand) === column,
          );
          return (
            <section
              key={column}
              aria-label={`${column} accounts`}
              className="min-w-0 rounded-xl border bg-muted/25 p-3"
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2 rounded-full", TONE[column])} />
                    {column}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {DETAIL[column]}
                  </p>
                </div>
                <span className="rounded-md bg-background px-2 py-0.5 text-xs tabular-nums">
                  {accounts.length}
                </span>
              </div>
              <div
                className={cn(
                  "space-y-3",
                  filter !== "all" &&
                    "grid grid-cols-1 gap-3 space-y-0 @2xl:grid-cols-2 @5xl:grid-cols-3",
                )}
              >
                {accounts.map((brand) => {
                  const href = `/app/performance/brands/${brand.slug ?? brand.id}`;
                  return (
                    <article
                      key={brand.id}
                      className="overflow-hidden rounded-xl border bg-card shadow-xs"
                    >
                      {brand.photo ? (
                        <Link
                          href={href}
                          tabIndex={-1}
                          aria-hidden
                          className="block aspect-[3/1] overflow-hidden bg-muted"
                        >
                          {/* oxlint-disable-next-line nextjs/no-img-element */}
                          <img
                            src={brand.photo}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        </Link>
                      ) : null}
                      <div className="space-y-3 p-3">
                        <div className="flex items-start gap-2">
                          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background text-[10px] font-semibold">
                            {brand.logo ? (
                              <>
                                {/* oxlint-disable-next-line nextjs/no-img-element */}
                                <img
                                  src={brand.logo}
                                  alt=""
                                  className="size-full object-contain p-1"
                                />
                              </>
                            ) : (
                              brand.name.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={href}
                              className="block text-sm font-semibold hover:underline"
                            >
                              {brand.name}
                            </Link>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {brand.website
                                ?.replace(/^https?:\/\//, "")
                                .replace(/\/.*$/, "") ?? "No website on file"}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={`Set ${brand.name}'s stage`}
                            onClick={() => setStaging(brand)}
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </div>
                        <StageChips
                          business={brand.business}
                          delivery={brand.delivery}
                        />
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <p className="text-muted-foreground">
                              Campaign budget
                            </p>
                            <p className="font-medium">
                              {brand.budget
                                ? `$${brand.budget.toLocaleString()}`
                                : "Not set"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Spend to date
                            </p>
                            <p className="font-medium">
                              ${brand.spend.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {brand.campaignCount} campaigns · {brand.adCount} ads
                        </p>
                        {brand.readiness ? (
                          <div className="space-y-2 border-t pt-3">
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                              <span>Setup checklist</span>
                              <span>
                                {brand.readiness.done}/{brand.readiness.total}
                              </span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={`${brand.name} setup checklist`}
                              aria-valuenow={brand.readiness.done}
                              aria-valuemin={0}
                              aria-valuemax={brand.readiness.total}
                              className="h-1 overflow-hidden rounded-full bg-muted"
                            >
                              <div
                                className="h-full rounded-full bg-sky-400"
                                style={{
                                  width: `${brand.readiness.total ? (brand.readiness.done / brand.readiness.total) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <p className="text-xs">
                              {brand.readiness.next
                                ? `Next checklist item: ${brand.readiness.next}`
                                : "Checklist complete"}
                            </p>
                            {brand.readiness.href ? (
                              <Link
                                href={brand.readiness.href}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                {brand.readiness.action} →
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                        <Link
                          href={href}
                          className="flex items-center justify-between border-t pt-3 text-xs font-medium"
                        >
                          Open launch brief
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
                {!accounts.length ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No accounts{query ? " match here" : " at this stage"}.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {staging ? (
        <StageDialog
          brandId={staging.id}
          brandName={staging.name}
          business={staging.business}
          delivery={staging.delivery}
          open
          onOpenChange={(open) => {
            if (!open) setStaging(null);
          }}
        />
      ) : null}
    </section>
  );
}
