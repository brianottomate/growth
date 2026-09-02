"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  RefreshCw,
  TriangleAlert,
  Unlink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

import { IntakePanel } from "./IntakePanel";
import {
  AddPropertyForm,
  CycleStatusPicker,
  OpenCycleForm,
  PropertyIdField,
} from "./CycleForms";

const usd = (value: number | null | undefined) =>
  typeof value === "number"
    ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "—";

const DAYS_IN_MONTH = 30;

export function AccountDetail({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const { data, isLoading } = useQuery(
    trpc.performance.get.queryOptions({ accountId }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["performance"]] });
  const attach = useMutation(
    trpc.performance.attach.mutationOptions({ onSuccess: invalidate }),
  );
  const refreshSpend = useMutation(
    trpc.performance.refreshSpend.mutationOptions({ onSuccess: invalidate }),
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Sponsored homes ({account.properties.length})
          </h2>
          <AddPropertyForm accountId={accountId} />
        </div>
        <div className="border-border divide-border divide-y rounded-lg border">
          {account.properties.map((property) => (
            <div
              key={property.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
            >
              <div>
                <div className="font-medium">
                  {property.title ?? propertyUrl(property) ?? "Untitled home"}
                </div>
                {propertyUrl(property) && (
                  <a
                    href={propertyUrl(property)!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    {shortPropertyUrl(propertyUrl(property)!)}
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              <div className="text-muted-foreground">
                <PropertyIdField
                  propertyRowId={property.id}
                  propertyId={property.propertyId}
                />
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

      <IntakePanel accountId={accountId} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Cycles</h2>
          <OpenCycleForm accountId={accountId} />
        </div>
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
            ads: delivery.campaigns.filter(
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
                  <CycleStatusPicker cycleId={cycle.id} status={cycle.status} />
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

              <SpendPace
                mediaBudget={cycle.mediaBudget}
                actualSpendCents={cycle.actualSpendCents}
                actualSpendAt={cycle.actualSpendAt}
                onRefresh={() => refreshSpend.mutate({ cycleId: cycle.id })}
                refreshing={refreshSpend.isPending}
              />

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

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-muted-foreground text-xs">
                  {reports.length > 0
                    ? `Report: ${reports.map((r) => `${r.periodLabel} (${r.status})`).join(", ")}`
                    : "No report generated yet."}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPickerFor(pickerFor === cycle.id ? null : cycle.id)
                  }
                >
                  <Link2 className="size-3.5" />
                  Attach a campaign
                </Button>
              </div>

              {pickerFor === cycle.id && (
                <CampaignPicker
                  onAttach={(platformCampaignId) =>
                    attach.mutate(
                      { cycleId: cycle.id, kind: "campaign", id: platformCampaignId },
                      { onSuccess: () => setPickerFor(null) },
                    )
                  }
                  attaching={attach.isPending}
                />
              )}

              {forCycle.ads.length > 0 && (
                <AdGrid
                  ads={delivery.ads.filter((ad) =>
                    delivery.platformCampaigns.some(
                      (platformCampaign) =>
                        platformCampaign.id === ad.platformCampaignId &&
                        forCycle.ads.some(
                          (campaign) =>
                            campaign.id === platformCampaign.campaignId,
                        ),
                    ),
                  )}
                />
              )}

              {forCycle.ads.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {forCycle.ads.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        attach.mutate({
                          cycleId: null,
                          kind: "campaign",
                          id: row.id,
                        })
                      }
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                      title="Detach from this cycle"
                    >
                      <Unlink className="size-3" />
                      detach {row.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {account.cycles.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No cycles opened yet.
          </p>
        )}
      </section>

      <SponsoredAbandonment accountId={accountId} />

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

/**
 * Planned vs observed. The daily figures are the comparison that matters: a
 * monthly total looks fine until you divide it by the days left.
 */
function SpendPace({
  mediaBudget,
  actualSpendCents,
  actualSpendAt,
  onRefresh,
  refreshing,
}: {
  mediaBudget: number | null;
  actualSpendCents: number | null;
  actualSpendAt: Date | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const spent = typeof actualSpendCents === "number" ? actualSpendCents / 100 : null;
  const over = mediaBudget !== null && spent !== null && spent > mediaBudget;
  const pct =
    mediaBudget && spent !== null
      ? Math.min(100, Math.round((spent / mediaBudget) * 100))
      : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {spent === null ? (
            "Spend never computed"
          ) : (
            <>
              <span className={over ? "font-medium text-red-300" : "font-medium"}>
                ${spent.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>{" "}
              of {mediaBudget !== null ? `$${mediaBudget}` : "—"} media
              {pct !== null && ` · ${pct}%`}
              {over && " · over budget"}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
          {actualSpendAt
            ? new Date(actualSpendAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "refresh"}
        </button>
      </div>
      {pct !== null && (
        <div className="bg-surface-secondary h-1 w-full overflow-hidden rounded-full">
          <div
            className={`h-full ${over ? "bg-red-400" : "bg-emerald-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Platform campaigns not yet on any cycle. Search is by name; the id is what
 *  gets attached, so a near-duplicate name cannot pick the wrong campaign. */
function CampaignPicker({
  onAttach,
  attaching,
}: {
  onAttach: (platformCampaignId: string) => void;
  attaching: boolean;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery(
    trpc.performance.attachableCampaigns.queryOptions({
      query: query.trim() || undefined,
      limit: 12,
    }),
  );

  return (
    <div className="border-border bg-surface-secondary/30 space-y-2 rounded-md border p-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search unattached campaigns…"
        className="h-8 text-xs"
      />
      {isLoading && (
        <p className="text-muted-foreground text-xs">Searching…</p>
      )}
      {data?.campaigns.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No unattached campaigns match.
        </p>
      )}
      <div className="space-y-1">
        {data?.campaigns.map((campaign) => {
          const spend = campaign.stats?.spend ?? campaign.spend ?? 0;
          return (
            <button
              key={campaign.id}
              type="button"
              disabled={attaching}
              onClick={() => onAttach(campaign.id)}
              className="hover:bg-surface-secondary flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs disabled:opacity-50"
            >
              {campaign.heroThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={campaign.heroThumbnailUrl}
                  alt=""
                  className="size-8 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="bg-surface-secondary size-8 shrink-0 rounded" />
              )}
              <span className="min-w-0 flex-1 truncate">{campaign.name}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                ${spend.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
              <span className="text-muted-foreground shrink-0">
                {campaign.status}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The ads themselves. `businessKey` present means Growth drafted it;
 * `externalId` present means the platform accepted it. Showing both makes a
 * drafted-but-never-launched ad visible instead of looking identical to a live
 * one.
 */
function AdGrid({
  ads,
}: {
  ads: {
    id: string;
    name: string | null;
    status: string | null;
    adSetName: string | null;
    thumbnailUrl: string | null;
    stats: { impressions?: number; spend?: number; clicks?: number } | null;
    externalId: string | null;
    businessKey: string | null;
  }[];
}) {
  if (ads.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium">
        Ads ({ads.length})
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ads.map((ad) => (
          <div
            key={ad.id}
            className="border-border flex gap-2 rounded-md border p-2"
          >
            {ad.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ad.thumbnailUrl}
                alt=""
                className="size-14 shrink-0 rounded object-cover"
              />
            ) : (
              <span className="bg-surface-secondary text-muted-foreground/60 flex size-14 shrink-0 items-center justify-center rounded text-[10px]">
                no art
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="truncate text-xs font-medium" title={ad.name ?? ""}>
                {ad.name ?? ad.id}
              </div>
              <div className="text-muted-foreground truncate text-[11px]">
                {ad.adSetName ?? "no ad set"}
              </div>
              <div className="text-muted-foreground text-[11px] tabular-nums">
                {ad.stats?.impressions !== undefined
                  ? `${ad.stats.impressions.toLocaleString("en-US")} impr`
                  : "no delivery"}
                {ad.stats?.spend !== undefined &&
                  ` · $${ad.stats.spend.toFixed(2)}`}
              </div>
              <div className="text-[10px]">
                {ad.externalId ? (
                  <span className="text-emerald-300">live</span>
                ) : ad.businessKey ? (
                  <span className="text-sky-300">drafted, not launched</span>
                ) : (
                  <span className="text-muted-foreground/60">unknown</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const HEAT_META: Record<string, { label: string; cls: string }> = {
  payment_failed: { label: "tried to pay", cls: "text-red-300" },
  payment_entered: { label: "entered payment", cls: "text-amber-300" },
  checkout_abandoned: { label: "left checkout", cls: "text-sky-300" },
  converted: { label: "booked", cls: "text-emerald-300" },
};

/**
 * The BDR-facing signal: guests who got far on a sponsored home and stopped.
 * Matched on listing id, so a home without one cannot appear and is called out
 * rather than reported as zero.
 */
function SponsoredAbandonment({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.performance.sponsoredAbandonment.queryOptions({
      accountId,
      sinceHours: 168,
      stage: "checkout",
      includeConverted: false,
      limit: 25,
    }),
  );

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">
        Abandoned on sponsored homes · last 7 days
      </h2>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Checking funnel state…</p>
      )}

      {data && data.unresolvedProperties.length > 0 && (
        <p className="text-xs text-amber-300">
          {data.unresolvedProperties.length} home
          {data.unresolvedProperties.length === 1 ? "" : "s"} have no listing id
          yet, so abandonment on them cannot be matched. Set the id above.
        </p>
      )}

      {data && data.events.length === 0 && data.matchedProperties > 0 && (
        <p className="text-muted-foreground text-sm">
          No abandoned checkouts on the {data.matchedProperties} matched home
          {data.matchedProperties === 1 ? "" : "s"} in this window.
        </p>
      )}

      {data && data.events.length > 0 && (
        <div className="border-border divide-border divide-y rounded-lg border">
          {data.events.map((event) => {
            const heat = HEAT_META[event.heat] ?? {
              label: event.heat,
              cls: "text-muted-foreground",
            };
            return (
              <div
                key={`${event.userId}-${String(event.abandonedAt)}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {event.email ?? event.userId}
                  </div>
                  <div className="text-muted-foreground truncate">
                    {event.property?.title ?? event.propertyName ?? "—"}
                    {event.checkin && event.checkout
                      ? ` · ${event.checkin} → ${event.checkout}`
                      : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {typeof event.value === "number" && (
                    <span className="tabular-nums">
                      ${event.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  )}
                  <span className={heat.cls}>{heat.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Matched on listing id from the tracked event, never on property name.
        Nothing is sent to Outreach from here yet.
      </p>
    </section>
  );
}

/**
 * A home is bookable on wander.com (List+) or on the client's own WanderOS
 * site (Performance+). Either column can be null, so read whichever is set
 * rather than assuming the List+ shape.
 */
function propertyUrl(property: {
  wanderUrl: string | null;
  siteUrl: string | null;
}): string | null {
  return property.wanderUrl ?? property.siteUrl;
}

/** Drop the scheme and any www so the row shows the part that differs. */
function shortPropertyUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}
