"use client";

import { Fragment, useMemo, useState } from "react";

import { ChannelLogo } from "@/components/channel-logos";
import { useFullBleed } from "@/lib/use-full-bleed";
import type { ProtoBrand, ProtoEntry, ProtoRole } from "../_feed-proto/data";

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

const ROLE: Record<ProtoRole, { label: string; cls: string }> = {
  owned: { label: "You", cls: "bg-emerald-500/15 text-emerald-300" },
  competitor: { label: "Competitor", cls: "bg-amber-500/15 text-amber-300" },
  inspiration: { label: "Inspiration", cls: "bg-sky-500/15 text-sky-300" },
};

const DAY = 86_400_000;
const dayKey = (iso: string) => iso.slice(0, 10);

function MiniCard({ e, future }: { e: ProtoEntry; future: boolean }) {
  return (
    <div className="bg-card w-[11.25rem] shrink-0 overflow-hidden rounded-lg border">
      <div className="bg-muted relative h-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={e.mediaUrl ?? "/placeholder.svg"}
          alt=""
          className="h-full w-full object-cover"
        />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/30 p-0.5 backdrop-blur-sm">
          <ChannelLogo platform={e.platform} className="size-3.5" />
        </span>
        {future && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-sky-500/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
            soon
          </span>
        )}
        {e.isSeed && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-amber-500/80 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            Seed
          </span>
        )}
      </div>
      <div className="p-1.5">
        {e.text && (
          <p className="line-clamp-2 text-[11px] leading-snug">{e.text}</p>
        )}
        {e.engagement > 0 && (
          <div className="text-muted-foreground mt-0.5 text-[9px] tabular-nums">
            {fmt(e.engagement)} ❤ · {fmt(e.views)} views
          </div>
        )}
      </div>
    </div>
  );
}

export function LanesClient({
  brands,
  entries,
  nowISO,
}: {
  brands: ProtoBrand[];
  entries: ProtoEntry[];
  nowISO: string;
}) {
  const now = new Date(nowISO).getTime();
  const todayKey = dayKey(nowISO);
  const [selected, setSelected] = useState<string[]>(brands.map((b) => b.id));
  const { ref, style } = useFullBleed();

  const lanes = brands.filter((b) => selected.includes(b.id));

  // (brandId|day) -> posts, plus the per-brand metrics for the header.
  const { cell, days, metrics } = useMemo(() => {
    const cell = new Map<string, ProtoEntry[]>();
    const daySet = new Set<string>();
    for (const e of entries) {
      if (!selected.includes(e.brandId)) continue;
      const d = dayKey(e.at);
      daySet.add(d);
      const k = `${e.brandId}|${d}`;
      const list = cell.get(k) ?? [];
      list.push(e);
      cell.set(k, list);
    }
    for (const list of cell.values()) {
      list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    }
    const days = [...daySet].sort((a, b) => b.localeCompare(a)); // newest first

    const metrics = new Map<
      string,
      { count: number; avg: number; perWeek: number }
    >();
    for (const b of brands) {
      const list = entries.filter((e) => e.brandId === b.id);
      const published = list.filter((e) => e.engagement > 0);
      const avg = published.length
        ? Math.round(
            published.reduce((n, e) => n + e.engagement, 0) / published.length,
          )
        : 0;
      const recent = list.filter((e) => {
        const t = new Date(e.at).getTime();
        return t <= now && now - t < 30 * DAY;
      });
      metrics.set(b.id, {
        count: list.length,
        avg,
        perWeek: recent.length / (30 / 7),
      });
    }
    return { cell, days, metrics };
  }, [entries, selected, brands, now]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Feed · Compare lanes{" "}
        <span className="text-muted-foreground text-sm font-normal">
          (v2 prototype)
        </span>
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Brands across, days down — read a column for one brand&apos;s cadence,
        or a row to compare the same day.
      </p>

      {/* brand toggles */}
      <div className="mt-4 flex flex-wrap gap-2 border-b pb-4">
        {brands.map((b) => {
          const on = selected.includes(b.id);
          return (
            <button
              key={b.id}
              onClick={() =>
                setSelected((s) =>
                  on ? s.filter((x) => x !== b.id) : [...s, b.id],
                )
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>

      {/* full-bleed grid */}
      <div ref={ref} style={style} className="mt-5 px-8 sm:px-0">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-fit"
            style={{
              gridTemplateColumns: `5.5rem repeat(${lanes.length}, 24rem)`,
            }}
          >
            {/* header row */}
            <div className="bg-background sticky top-0 left-0 z-20" />
            {lanes.map((b) => {
              const m = metrics.get(b.id);
              const role = ROLE[b.role];
              return (
                <div
                  key={b.id}
                  className="bg-background sticky top-0 z-10 border-b px-2 pb-2"
                >
                  <div className="flex items-center gap-2">
                    {b.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.logo}
                        alt=""
                        className="size-6 rounded-md object-cover"
                      />
                    ) : (
                      <span className="bg-muted flex size-6 items-center justify-center rounded-md text-[9px] font-semibold">
                        {b.name.slice(0, 2)}
                      </span>
                    )}
                    <span className="flex-1 truncate text-sm font-semibold">
                      {b.name}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${role.cls}`}
                    >
                      {role.label}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1 flex gap-3 text-[10px]">
                    <span>
                      <b className="text-foreground">{m?.count ?? 0}</b> posts
                    </span>
                    <span>
                      <b className="text-foreground">{fmt(m?.avg ?? 0)}</b> ❤
                    </span>
                    <span>
                      <b className="text-foreground">
                        {(m?.perWeek ?? 0).toFixed(1)}
                      </b>
                      /wk
                    </span>
                  </div>
                </div>
              );
            })}

            {/* day rows */}
            {days.map((d) => {
              const label = new Date(`${d}T12:00:00`).toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const isToday = d === todayKey;
              return (
                <Fragment key={d}>
                  <div className="bg-background sticky left-0 z-10 border-t px-2 py-2">
                    <span
                      className={`text-[11px] font-medium ${
                        isToday ? "text-sky-400" : "text-muted-foreground"
                      }`}
                    >
                      {label}
                      {isToday ? " · today" : ""}
                    </span>
                  </div>
                  {lanes.map((b) => {
                    const posts = cell.get(`${b.id}|${d}`) ?? [];
                    return (
                      <div
                        key={b.id}
                        className="flex flex-wrap gap-1.5 border-t px-1.5 py-2"
                      >
                        {posts.map((e) => (
                          <MiniCard
                            key={e.id}
                            e={e}
                            future={new Date(e.at).getTime() > now}
                          />
                        ))}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
