"use client";

import Link from "next/link";
import { CampaignListRow } from "@/components/campaigns/campaign-summary";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CampaignStatus } from "@/server/db/schema";
import { orpc } from "@/orpc/client";

export const STATUS_META: Record<
  CampaignStatus,
  { label: string; dot: string; cls: string }
> = {
  active: { label: "Active", dot: "bg-emerald-400", cls: "text-emerald-300" },
  planned: { label: "Planned", dot: "bg-sky-400", cls: "text-sky-300" },
  paused: { label: "Paused", dot: "bg-amber-400", cls: "text-amber-300" },
  completed: {
    label: "Completed",
    dot: "bg-muted-foreground",
    cls: "text-muted-foreground",
  },
  archived: {
    label: "Archived",
    dot: "bg-muted-foreground",
    cls: "text-muted-foreground",
  },
};

// Display order — what's running first, history last.
const ORDER: CampaignStatus[] = [
  "active",
  "planned",
  "paused",
  "completed",
  "archived",
];

export function fmtRange(start: Date | null, end: Date | null) {
  if (!start && !end) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const year = (d: Date) =>
    d.getFullYear() !== new Date().getFullYear()
      ? ` '${String(d.getFullYear()).slice(2)}`
      : "";
  const s = start ? start.toLocaleDateString("en-US", opts) + year(start) : "…";
  const e = end ? end.toLocaleDateString("en-US", opts) + year(end) : "…";
  return s === e ? s : `${s} – ${e}`;
}

export function CampaignsClient({
  brands,
}: {
  brands: { id: string; name: string }[];
}) {
  const { data } = useQuery(orpc.campaign.overview.queryOptions());
  const campaigns = data?.campaigns ?? [];

  const byStatus = (s: CampaignStatus) =>
    campaigns
      .filter((i) => i.status === s)
      .sort(
        (a, b) =>
          (b.startAt?.getTime() ?? 0) - (a.startAt?.getTime() ?? 0) ||
          a.name.localeCompare(b.name),
      );

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every brand&apos;s campaigns in one place. A campaign is created on
            the brand it belongs to and opens there; this is the index across
            all of them.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/app/brands">
            <Plus className="size-4" />
            New campaign
          </Link>
        </Button>
      </div>

      {/* status summary */}
      <div className="mt-4 flex flex-wrap gap-2 border-b pb-4">
        {ORDER.map((s) => {
          const n = campaigns.filter((i) => i.status === s).length;
          if (!n) return null;
          const meta = STATUS_META[s];
          return (
            <span
              key={s}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
            >
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              <span className={meta.cls}>{meta.label}</span>
              <span className="text-muted-foreground tabular-nums">{n}</span>
            </span>
          );
        })}
      </div>

      {campaigns.length === 0 && (
        <p className="mt-10 text-sm text-muted-foreground">
          No campaigns yet. Create a paid campaign from{" "}
          <Link href="/app/brands" className="underline underline-offset-2">
            Brands
          </Link>
          .
        </p>
      )}

      {ORDER.map((s) => {
        const list = byStatus(s);
        if (!list.length) return null;
        const meta = STATUS_META[s];
        return (
          <section key={s} className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              {meta.label} · {list.length}
            </h2>
            <div className="flex flex-col gap-2">
              {list.map((i) => {
                const range = fmtRange(i.startAt, i.endAt);
                return (
                  <article
                    key={i.id}
                    className="min-w-0 rounded-xl border bg-card"
                    style={{ borderLeftColor: i.color ?? undefined }}
                  >
                    <CampaignListRow
                      name={i.name}
                      href={
                        i.brand?.slug
                          ? `/app/brands/${i.brand.slug}/ads/${i.id}`
                          : `/app/campaigns/${i.id}`
                      }
                      status={meta.label}
                      detail={[
                        brands.length > 1 ? i.brand?.name : null,
                        range,
                        i.goal,
                        i.adCampaignCount > 0
                          ? `${i.adCampaignCount} ad campaign${i.adCampaignCount === 1 ? "" : "s"}`
                          : "No platform campaigns yet",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      description={i.description}
                      spend={
                        i.budget != null ? (
                          <span className="text-xs tabular-nums">
                            <strong>${i.budget.toLocaleString()}</strong>
                            <span className="text-muted-foreground">
                              {" "}
                              budget
                            </span>
                          </span>
                        ) : undefined
                      }
                    />
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
