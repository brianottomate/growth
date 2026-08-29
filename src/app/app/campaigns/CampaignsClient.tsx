"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChannelLogo } from "@/components/channel-logos";
import type { CampaignStatus } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

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
  const trpc = useTRPC();
  const { data } = useQuery(trpc.campaign.overview.queryOptions());
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
          <p className="text-muted-foreground mt-1 text-sm">
            Every brand&apos;s campaigns in one place. A campaign is created
            on the brand it belongs to and opens there; this is the index
            across all of them.
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
              className="border-border flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
            >
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              <span className={meta.cls}>{meta.label}</span>
              <span className="text-muted-foreground tabular-nums">{n}</span>
            </span>
          );
        })}
      </div>

      {campaigns.length === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">
          No campaigns yet. Create one here, or commit a moment from{" "}
          <Link href="/app/plan" className="underline underline-offset-2">
            Plan
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
            <h2 className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              {meta.label} · {list.length}
            </h2>
            <div className="flex flex-col gap-2">
              {list.map((i) => {
                const range = fmtRange(i.startAt, i.endAt);
                return (
                  <Link
                    key={i.id}
                    href={
                      i.brand?.slug
                        ? `/app/brands/${i.brand.slug}/ads/${i.id}`
                        : `/app/campaigns/${i.id}`
                    }
                    className="bg-card hover:bg-accent/40 flex items-center gap-3 rounded-xl border p-3.5 transition-colors"
                  >
                    <span
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{ background: i.color ?? "var(--border)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {i.name}
                        </span>
                        {i.goal && (
                          <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                            {i.goal}
                          </span>
                        )}
                        {brands.length > 1 && i.brand && (
                          <span className="text-muted-foreground text-[10px]">
                            {i.brand.name}
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        {range && <span>{range}</span>}
                        {i.contentCount > 0 && (
                          <span>
                            {i.contentCount} piece
                            {i.contentCount === 1 ? "" : "s"}
                            {i.publishedCount > 0 &&
                              ` · ${i.publishedCount} published`}
                          </span>
                        )}
                        {i.adCampaignCount > 0 && (
                          <span>
                            {i.adCampaignCount} ad campaign
                            {i.adCampaignCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {i.budget != null && (
                          <span>${i.budget.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    {(i.targetChannels ?? []).length > 0 && (
                      <div className="flex items-center gap-1">
                        {(i.targetChannels ?? []).slice(0, 5).map((p) => (
                          <ChannelLogo
                            key={p}
                            platform={p}
                            className="text-muted-foreground size-3.5"
                          />
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

    </div>
  );
}
