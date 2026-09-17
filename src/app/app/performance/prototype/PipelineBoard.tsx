"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MoreHorizontal } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/lib/utils";
import type { BusinessStage, DeliveryStage } from "@/lib/performance-stage";

import { StageDialog } from "../StageDialog";

export type PipelineBrand = {
  id: string;
  name: string;
  slug: string | null;
  website: string | null;
  relationship: "internal" | "client" | "prospect" | "reference";
  business: BusinessStage;
  delivery: DeliveryStage;
  deliveryLabel: string;
  best: "draft" | "pushed" | "live" | "ended" | null;
  budget: number | null;
  spend: number | null;
  adCount: number;
  hasMark: boolean;
};

type Column = "Lead" | "Onboarding" | "Ready to launch" | "Live";
const COLUMNS: Column[] = ["Lead", "Onboarding", "Ready to launch", "Live"];

/** The real delivery lifecycle, bucketed into the four the board shows. */
const COLUMN_OF: Record<DeliveryStage, Column> = {
  not_started: "Lead",
  intake_sent: "Lead",
  intake_submitted: "Onboarding",
  access_verified: "Onboarding",
  ads_review: "Ready to launch",
  live: "Live",
  paused: "Live",
};

const TONES: Record<Column, string> = {
  Lead: "border-t-zinc-500 bg-zinc-500/[0.03]",
  Onboarding: "border-t-sky-500 bg-sky-500/[0.04]",
  "Ready to launch": "border-t-amber-500 bg-amber-500/[0.04]",
  Live: "border-t-emerald-500 bg-emerald-500/[0.04]",
};
const DOTS: Record<Column, string> = {
  Lead: "bg-zinc-500",
  Onboarding: "bg-sky-500",
  "Ready to launch": "bg-amber-500",
  Live: "bg-emerald-500",
};
const SUBTITLE: Record<Column, string> = {
  Lead: "Not started / intake sent",
  Onboarding: "Intake in, access verified",
  "Ready to launch": "Ads ready for review",
  Live: "Delivering or paused in Meta",
};

function host(website: string | null) {
  if (!website) return null;
  return website.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function PipelineBoard({ brands }: { brands: PipelineBrand[] }) {
  const [query, setQuery] = useState("");
  const [staging, setStaging] = useState<PipelineBrand | null>(null);
  const visible = useMemo(
    () =>
      brands.filter((brand) =>
        `${brand.name} ${brand.website ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, brands],
  );

  return (
    <section aria-label="Performance pipeline" className="min-w-0 space-y-5">
      <header>
        <p className="text-xs font-semibold text-muted-foreground">
          Client journey · Real desk data
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">Clients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {brands.length} brands on the desk · grouped by delivery stage
        </p>
      </header>
      <label className="block max-w-md">
        <span className="sr-only">Search brands</span>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search brands or sites"
        />
      </label>
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const clients = visible.filter(
            (brand) => COLUMN_OF[brand.delivery] === column,
          );
          const stageId = `stage-${column.toLowerCase().replaceAll(" ", "-")}`;
          return (
            <section
              key={column}
              className={cn(
                "min-w-0 rounded-xl border border-t-[3px] p-3",
                TONES[column],
              )}
              aria-labelledby={stageId}
            >
              <div className="mb-3 flex items-start justify-between gap-2 px-1">
                <div>
                  <h3
                    id={stageId}
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <span className={cn("size-2 rounded-full", DOTS[column])} />
                    {column}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {SUBTITLE[column]}
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {clients.length}
                </span>
              </div>
              <div className="space-y-3">
                {clients.map((brand) => {
                  const initials = brand.name
                    .split(/\s+/)
                    .map((word) => word[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  const inner = (
                    <>
                      <div className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                          {initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-semibold">
                            {brand.name}
                          </h4>
                          <p className="truncate text-xs text-muted-foreground">
                            {host(brand.website) ?? brand.relationship}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {brand.adCount > 0
                            ? `${brand.adCount} ads`
                            : "No ads yet"}
                        </span>
                        <span className="text-right">
                          {brand.budget ? `$${brand.budget} / mo` : ""}
                        </span>
                      </div>
                      <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium">
                        {brand.deliveryLabel}
                      </p>
                      {brand.slug ? (
                        <span className="mt-3 flex w-full items-center justify-center gap-1 rounded-full border py-1.5 text-xs font-medium transition-colors group-hover:border-foreground">
                          Open workspace
                          <ArrowRight className="size-3.5" aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="mt-3 block text-center text-[11px] text-muted-foreground">
                          No slug — open on the brand page
                        </span>
                      )}
                    </>
                  );
                  return (
                    <div key={brand.id} className="group relative">
                      {brand.slug ? (
                        <Link
                          href={`/app/performance/prototype?brand=${encodeURIComponent(brand.slug)}`}
                          className="block rounded-xl border bg-card p-4 pr-9 shadow-xs hover:border-foreground/30"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="rounded-xl border bg-card p-4 pr-9 shadow-xs">
                          {inner}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setStaging(brand)}
                        aria-label={`Set ${brand.name}'s stage`}
                        title="Set stage"
                        className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
                {clients.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    None here
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
