"use client";

import { Fragment, useMemo, useState } from "react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { useFullBleed } from "@/lib/use-full-bleed";
import type {
  ProtoBrand,
  ProtoCampaign,
  ProtoEntry,
  ProtoInitiative,
  ProtoRole,
} from "../_feed-proto/data";

const DAY = 86_400_000;
const dayKey = (iso: string) => iso.slice(0, 10);

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
const money = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n}`;

const ROLE: Record<ProtoRole, { label: string; cls: string }> = {
  owned: { label: "You", cls: "bg-emerald-500/15 text-emerald-300" },
  competitor: { label: "Competitor", cls: "bg-amber-500/15 text-amber-300" },
  inspiration: { label: "Inspiration", cls: "bg-sky-500/15 text-sky-300" },
};

const onDay = (c: ProtoCampaign, day: string) => {
  const s = c.startAt && dayKey(c.startAt);
  if (!s) return false;
  const e = c.endAt && dayKey(c.endAt);
  return s <= day && (!e || day <= e);
};

// One initiative's presence in a brand column (its campaigns + color).
type Track = { init: ProtoInitiative; color: string; campaigns: ProtoCampaign[] };

function MiniCard({ e, future }: { e: ProtoEntry; future: boolean }) {
  return (
    <div className="bg-card w-[11rem] shrink-0 overflow-hidden rounded-lg border">
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
            {fmt(e.engagement)} ❤
          </div>
        )}
      </div>
    </div>
  );
}

/** Initiative tracks for one brand, on one day. One bar per initiative. */
function Spine({ tracks, day }: { tracks: Track[]; day: string }) {
  if (tracks.length === 0) return <div className="w-0 shrink-0" />;
  return (
    <div className="flex shrink-0 gap-[3px] pr-2">
      {tracks.map((t) => {
        const live = t.campaigns.some((c) => c.status === "live" && onDay(c, day));
        const active = live || t.campaigns.some((c) => onDay(c, day));
        return (
          <div
            key={t.init.id}
            title={`${t.init.name}${active ? " · running" : ""}`}
            className={`w-1 self-stretch rounded-full ${active ? "" : "bg-border/20"}`}
            style={
              active
                ? { background: t.color, opacity: live ? 0.95 : 0.45 }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

/** Rail card: one initiative — pacing + per-channel verify vs targetChannels. */
function InitiativeCard({
  init,
  color,
  spend,
  implemented,
  now,
}: {
  init: ProtoInitiative;
  color: string;
  spend: number;
  implemented: Set<string>;
  now: number;
}) {
  void now;
  const pct = init.budget ? Math.min(1, spend / init.budget) : 0;
  const targets = init.targetChannels ?? [];
  return (
    <div className="bg-card relative w-72 shrink-0 overflow-hidden rounded-xl border p-3">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: color }}
      />
      <div className="pl-1.5">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm font-semibold">
            {init.name}
          </span>
          <span className="text-muted-foreground text-[10px] capitalize">
            {init.status}
          </span>
        </div>
        {init.goal && (
          <div className="text-muted-foreground mt-0.5 text-[11px]">
            goal: <span className="capitalize">{init.goal}</span>
            {init.landingUrl
              ? ` · ${init.landingUrl.replace(/^https?:\/\//, "")}`
              : ""}
          </div>
        )}
        <div className="mt-2">
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct * 100}%`, background: color }}
            />
          </div>
          <div className="text-muted-foreground mt-1 text-[10px] tabular-nums">
            {money(spend)} / {money(init.budget)}
          </div>
        </div>
        {/* channel verify: target vs implemented */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {targets.map((ch) => {
            const ok = implemented.has(ch);
            return (
              <span
                key={ch}
                title={`${platformLabel(ch)} — ${ok ? "running" : "not set up"}`}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${
                  ok
                    ? "border-emerald-500/30 text-emerald-300"
                    : "border-amber-500/40 text-amber-300"
                }`}
              >
                <ChannelLogo platform={ch} className="size-3" />
                {ok ? "✓" : "⚠"}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function V4Client({
  brands,
  entries,
  campaigns,
  initiatives,
  nowISO,
}: {
  brands: ProtoBrand[];
  entries: ProtoEntry[];
  campaigns: ProtoCampaign[];
  initiatives: ProtoInitiative[];
  nowISO: string;
}) {
  const now = new Date(nowISO).getTime();
  const todayKey = dayKey(nowISO);
  const [selected, setSelected] = useState<string[]>(brands.map((b) => b.id));
  const rail = useFullBleed();
  const grid = useFullBleed();

  const lanes = brands.filter((b) => selected.includes(b.id));

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 7; i >= -14; i--)
      out.push(dayKey(new Date(now + i * DAY).toISOString()));
    return out;
  }, [now]);
  const windowStart = days[days.length - 1]!;
  const windowEnd = days[0]!;

  const overlapsWindow = (c: ProtoCampaign) => {
    const s = c.startAt && dayKey(c.startAt);
    if (!s) return false;
    const e = c.endAt && dayKey(c.endAt);
    return s <= windowEnd && (!e || e >= windowStart);
  };

  const perBrand = useMemo(() => {
    const map = new Map<
      string,
      {
        byDay: Map<string, ProtoEntry[]>;
        tracks: Track[];
        count: number;
        avg: number;
      }
    >();
    for (const b of brands) {
      const byDay = new Map<string, ProtoEntry[]>();
      const list = entries.filter((e) => e.brandId === b.id);
      for (const e of list) {
        const d = dayKey(e.at);
        const arr = byDay.get(d) ?? [];
        arr.push(e);
        byDay.set(d, arr);
      }
      for (const arr of byDay.values())
        arr.sort((a, c) => new Date(a.at).getTime() - new Date(c.at).getTime());
      const published = list.filter((e) => e.engagement > 0);
      const avg = published.length
        ? Math.round(
            published.reduce((n, e) => n + e.engagement, 0) / published.length,
          )
        : 0;
      const tracks: Track[] = initiatives
        .filter((i) => i.brandId === b.id)
        .map((init) => ({
          init,
          color: init.color ?? "#94a3b8",
          campaigns: campaigns.filter(
            (c) => c.initiativeId === init.id && overlapsWindow(c),
          ),
        }))
        .filter((t) => t.campaigns.length > 0);
      map.set(b.id, { byDay, tracks, count: list.length, avg });
    }
    return map;
  }, [brands, entries, campaigns, initiatives, windowStart, windowEnd]);

  // Rail: initiatives across selected brands, with rolled-up spend + verify.
  const railItems = useMemo(() => {
    return initiatives
      .filter((i) => selected.includes(i.brandId))
      .map((init) => {
        const cs = campaigns.filter((c) => c.initiativeId === init.id);
        return {
          init,
          color: init.color ?? "#94a3b8",
          spend: cs.reduce((n, c) => n + (c.spend ?? 0), 0),
          implemented: new Set(cs.map((c) => c.platform)),
        };
      });
  }, [initiatives, campaigns, selected]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Feed · Command center{" "}
        <span className="text-muted-foreground text-sm font-normal">
          (v4 prototype)
        </span>
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Posts are cards (instants); each ad <b>initiative</b> is a colored band
        running down a brand&apos;s column (spans). The rail verifies which
        channels actually implement each initiative.
      </p>

      {/* brand toggles */}
      <div className="mt-4 flex flex-wrap gap-2">
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

      {/* initiatives rail */}
      <div className="text-muted-foreground mt-5 text-xs font-semibold uppercase tracking-wider">
        Initiatives · {railItems.length}
      </div>
      <div ref={rail.ref} style={rail.style} className="mt-2 px-8 sm:px-0">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {railItems.length === 0 && (
            <p className="text-muted-foreground text-sm">No initiatives.</p>
          )}
          {railItems.map((r) => (
            <InitiativeCard
              key={r.init.id}
              init={r.init}
              color={r.color}
              spend={r.spend}
              implemented={r.implemented}
              now={now}
            />
          ))}
        </div>
      </div>

      {/* the grid */}
      <div ref={grid.ref} style={grid.style} className="mt-6 px-8 sm:px-0">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-fit"
            style={{
              gridTemplateColumns: `5.5rem repeat(${lanes.length}, 26rem)`,
            }}
          >
            {/* header row */}
            <div className="bg-background sticky top-0 left-0 z-20" />
            {lanes.map((b) => {
              const pb = perBrand.get(b.id);
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
                      <b className="text-foreground">{pb?.count ?? 0}</b> posts
                    </span>
                    <span>
                      <b className="text-foreground">{fmt(pb?.avg ?? 0)}</b> ❤
                    </span>
                  </div>
                  {pb && pb.tracks.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                      {pb.tracks.map((t) => (
                        <span
                          key={t.init.id}
                          className="flex items-center gap-1 text-[9px]"
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ background: t.color }}
                          />
                          <span className="text-muted-foreground max-w-[8rem] truncate">
                            {t.init.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
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
                    const pb = perBrand.get(b.id);
                    const posts = pb?.byDay.get(d) ?? [];
                    return (
                      <div
                        key={b.id}
                        className="flex min-h-[2.75rem] border-t px-1.5 py-2"
                      >
                        <Spine tracks={pb?.tracks ?? []} day={d} />
                        <div className="flex flex-1 flex-wrap content-start gap-1.5">
                          {posts.map((e) => (
                            <MiniCard
                              key={e.id}
                              e={e}
                              future={new Date(e.at).getTime() > now}
                            />
                          ))}
                        </div>
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
