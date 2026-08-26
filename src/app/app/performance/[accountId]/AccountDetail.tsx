"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";

import { useTRPC } from "@/trpc/react";

const usd = (value: number | null | undefined) =>
  typeof value === "number"
    ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "—";

const DAYS_IN_MONTH = 30;

export function AccountDetail({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.performance.get.queryOptions({ accountId }),
  );

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading account…</p>;
  }
  if (!data) {
    return <p className="text-muted-foreground text-sm">Account not found.</p>;
  }

  const { account, delivery } = data;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link
          href="/app/performance"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3" />
          Performance+
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold">{account.name}</h1>
          <span className="text-muted-foreground text-sm">
            {account.contactName}
            {account.contactEmail ? ` · ${account.contactEmail}` : ""}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {account.plan ?? "no plan set"} · {account.status}
          {account.brand ? ` · brand: ${account.brand.name}` : ""}
        </p>
        {account.notes && (
          <p className="text-muted-foreground max-w-3xl text-sm">
            {account.notes}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Sponsored homes ({account.properties.length})
        </h2>
        <div className="border-border divide-border divide-y rounded-lg border">
          {account.properties.map((property) => (
            <div
              key={property.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
            >
              <div>
                <div className="font-medium">
                  {property.title ?? property.wanderUrl}
                </div>
                <a
                  href={property.wanderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
                >
                  {property.wanderUrl.replace("https://www.wander.com", "")}
                  <ExternalLink className="size-3" />
                </a>
              </div>
              <div className="text-muted-foreground font-mono text-xs">
                {property.propertyId ? (
                  property.propertyId
                ) : (
                  <span className="text-amber-300">no property id</span>
                )}
              </div>
            </div>
          ))}
          {account.properties.length === 0 && (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              No homes added yet.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Cycles</h2>
        {account.cycles.map((cycle) => {
          // The take rate is invisible in a monthly total; a daily figure is
          // what an ad set is actually set to, so overspend shows up here.
          const impliedDaily = cycle.mediaBudget
            ? cycle.mediaBudget / DAYS_IN_MONTH
            : null;
          const reports = account.reports.filter(
            (report) => report.cycleId === cycle.id,
          );
          const forCycle = {
            ads: delivery.initiatives.filter(
              (row) => row.performanceCycleId === cycle.id,
            ),
            emails: delivery.lifecycleCampaigns.filter(
              (row) => row.performanceCycleId === cycle.id,
            ),
            creators: delivery.amplificationTargets.filter(
              (row) => row.performanceCycleId === cycle.id,
            ),
          };
          return (
            <div
              key={cycle.id}
              className="border-border space-y-3 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm font-semibold">
                    {cycle.period}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {cycle.status}
                  </span>
                </div>
                <div className="text-sm tabular-nums">
                  <span className="text-muted-foreground text-xs">billed </span>
                  {usd(cycle.billedAmount)}
                  <span className="text-muted-foreground text-xs"> · media </span>
                  {usd(cycle.mediaBudget)}
                  {impliedDaily && (
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      (≈${impliedDaily.toFixed(2)}/day)
                    </span>
                  )}
                </div>
              </div>

              {cycle.notes && (
                <p className="text-muted-foreground text-xs">{cycle.notes}</p>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <DeliveryList
                  label="Ads"
                  rows={forCycle.ads.map((row) => ({
                    id: row.id,
                    label: row.name,
                    meta: `${row.status}${row.budget ? ` · ${usd(row.budget)}` : ""}`,
                    href: `/app/campaigns/${row.id}`,
                  }))}
                />
                <DeliveryList
                  label="Emails"
                  rows={forCycle.emails.map((row) => ({
                    id: row.id,
                    label: row.name,
                    meta: row.runState,
                  }))}
                />
                <DeliveryList
                  label="Creators"
                  rows={forCycle.creators.map((row) => ({
                    id: row.id,
                    label: row.actionKind,
                    meta: row.ask,
                  }))}
                />
              </div>

              <div className="text-muted-foreground text-xs">
                {reports.length > 0
                  ? `Report: ${reports.map((r) => `${r.periodLabel} (${r.status})`).join(", ")}`
                  : "No report generated yet."}
              </div>
            </div>
          );
        })}
        {account.cycles.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No cycles opened yet.
          </p>
        )}
      </section>

      <div className="border-border text-muted-foreground flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
        <span>
          Launching ads is not wired into this page. Ads are created through the
          assistant, which routes provider writes through the operator approval
          card.
        </span>
      </div>
    </div>
  );
}

function DeliveryList({
  label,
  rows,
}: {
  label: string;
  rows: { id: string; label: string; meta?: string; href?: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium">
        {label} ({rows.length})
      </div>
      {rows.length === 0 && (
        <div className="text-muted-foreground/60 text-xs">none attached</div>
      )}
      {rows.map((row) => (
        <div key={row.id} className="text-xs">
          {row.href ? (
            <Link href={row.href} className="hover:underline">
              {row.label}
            </Link>
          ) : (
            row.label
          )}
          {row.meta && (
            <span className="text-muted-foreground"> · {row.meta}</span>
          )}
        </div>
      ))}
    </div>
  );
}
