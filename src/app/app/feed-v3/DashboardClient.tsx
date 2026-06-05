"use client";

import { useMemo, useState } from "react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import type { ProtoBrand, ProtoEntry, ProtoRole } from "../_feed-proto/data";

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

const DAY = 86_400_000;

const ROLE_DOT: Record<ProtoRole, string> = {
  owned: "bg-emerald-400",
  competitor: "bg-amber-400",
  inspiration: "bg-sky-400",
};

type BrandStat = {
  brand: ProtoBrand;
  count: number;
  totalEng: number;
  avgEng: number;
  perWeek: number;
};

export function DashboardClient({
  brands,
  entries,
  nowISO,
}: {
  brands: ProtoBrand[];
  entries: ProtoEntry[];
  nowISO: string;
}) {
  const now = new Date(nowISO).getTime();
  const [mode, setMode] = useState<"posts" | "engagement">("posts");

  const brandById = useMemo(
    () => new Map(brands.map((b) => [b.id, b])),
    [brands],
  );

  const stats: BrandStat[] = useMemo(() => {
    return brands
      .map((brand) => {
        const list = entries.filter((e) => e.brandId === brand.id);
        const published = list.filter((e) => e.engagement > 0);
        const totalEng = published.reduce((n, e) => n + e.engagement, 0);
        const recent = list.filter((e) => {
          const t = new Date(e.at).getTime();
          return t <= now && now - t < 30 * DAY;
        });
        return {
          brand,
          count: list.length,
          totalEng,
          avgEng: published.length ? Math.round(totalEng / published.length) : 0,
          perWeek: recent.length / (30 / 7),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [brands, entries, now]);

  const sovValue = (s: BrandStat) => (mode === "posts" ? s.count : s.totalEng);
  const sovMax = Math.max(...stats.map(sovValue), 1);
  const sovTotal = stats.reduce((n, s) => n + sovValue(s), 0) || 1;

  const topCompetitor = useMemo(
    () =>
      entries
        .filter((e) => brandById.get(e.brandId)?.role !== "owned")
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 8),
    [entries, brandById],
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Competition · Dashboard{" "}
        <span className="text-muted-foreground text-sm font-normal">
          (v3 prototype)
        </span>
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Benchmarks across you and your tracked brands — latest-snapshot stats.
      </p>

      {/* share of voice */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Share of voice
        </h2>
        <div className="border-border flex overflow-hidden rounded-full border text-xs">
          {(["posts", "engagement"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 font-medium capitalize transition-colors ${
                mode === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {stats.map((s) => {
          const v = sovValue(s);
          const pct = Math.round((v / sovTotal) * 100);
          return (
            <div key={s.brand.id} className="flex items-center gap-3">
              <div className="flex w-44 shrink-0 items-center gap-2">
                <span
                  className={`size-1.5 rounded-full ${ROLE_DOT[s.brand.role]}`}
                />
                <span className="truncate text-sm">{s.brand.name}</span>
              </div>
              <div className="bg-muted h-3 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-foreground/80 h-full rounded-full"
                  style={{ width: `${(v / sovMax) * 100}%` }}
                />
              </div>
              <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
                {mode === "posts" ? `${v} · ${pct}%` : `${fmt(v)} · ${pct}%`}
              </span>
            </div>
          );
        })}
      </div>

      {/* cadence + avg engagement table */}
      <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold uppercase tracking-wider">
        Per-brand benchmarks
      </h2>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground bg-muted/30 text-xs">
            <tr>
              <th className="p-2.5 text-left font-medium">Brand</th>
              <th className="p-2.5 text-right font-medium">Posts</th>
              <th className="p-2.5 text-right font-medium">Posts / wk</th>
              <th className="p-2.5 text-right font-medium">Avg ❤</th>
              <th className="p-2.5 text-right font-medium">Total ❤</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.brand.id} className="border-t">
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-1.5 rounded-full ${ROLE_DOT[s.brand.role]}`}
                    />
                    {s.brand.name}
                  </div>
                </td>
                <td className="p-2.5 text-right tabular-nums">{s.count}</td>
                <td className="p-2.5 text-right tabular-nums">
                  {s.perWeek.toFixed(1)}
                </td>
                <td className="p-2.5 text-right tabular-nums">{fmt(s.avgEng)}</td>
                <td className="p-2.5 text-right tabular-nums">
                  {fmt(s.totalEng)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* top competitor posts */}
      <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold uppercase tracking-wider">
        Top competitor posts
      </h2>
      <div className="flex flex-col gap-2">
        {topCompetitor.map((e) => {
          const brand = brandById.get(e.brandId);
          return (
            <div
              key={e.id}
              className="bg-card flex items-center gap-3 rounded-xl border p-2.5"
            >
              <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.mediaUrl ?? "/placeholder.svg"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <ChannelLogo platform={e.platform} className="size-3.5" />
                  <span className="font-medium">{brand?.name ?? "—"}</span>
                  <span>· {platformLabel(e.platform)}</span>
                  {e.isSeed && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                      Seed
                    </span>
                  )}
                </div>
                {e.text && (
                  <p className="mt-0.5 line-clamp-1 text-sm">{e.text}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">
                  {fmt(e.engagement)} ❤
                </div>
                <div className="text-muted-foreground text-[11px] tabular-nums">
                  {fmt(e.views)} views
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
