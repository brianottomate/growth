"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/components/ui/lib/utils";
import { PILLARS } from "@/lib/pillars";
import { useFullBleed } from "@/lib/use-full-bleed";
import { useTRPC } from "@/trpc/react";
import { ProduceDrawer } from "./ProduceDrawer";

type Brand = { id: string; name: string; slug: string | null };

const LABEL_W = 150; // sticky pillar-name gutter
const TRACK_MIN = 1000; // min timeline width before horizontal scroll
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const STATUS_OPACITY: Record<string, string> = {
  active: "opacity-100",
  running: "opacity-100",
  planned: "opacity-60",
  completed: "opacity-45",
  archived: "opacity-30",
  paused: "opacity-50",
};

export function StudioWheel({ brands }: { brands: Brand[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [brandId, setBrandId] = useState(brands[0]!.id);
  const [year, setYear] = useState(2026);
  const [draft, setDraft] = useState<{
    pillarSlug: string;
    date: string;
  } | null>(null);

  // Deep-link into the Calendar, filtered to this brand (+ pillar) and focused
  // on the relevant month — the tactical, day-level counterpart to the wheel.
  const goCalendar = (opts: {
    pillar?: string | null;
    at?: Date | string | null;
  }) => {
    const params = new URLSearchParams({ brand: brandId, y: String(year) });
    if (opts.pillar) params.set("pillar", opts.pillar);
    if (opts.at) params.set("m", String(new Date(opts.at).getMonth()));
    router.push(`/app/calendar?${params.toString()}`);
  };

  const brand = brands.find((b) => b.id === brandId)!;
  const pillars = useMemo(
    () => PILLARS.filter((p) => p.brandSlug === brand.slug),
    [brand.slug],
  );

  const { data, isLoading } = useQuery(
    trpc.studio.wheel.queryOptions({ brandId, year }),
  );

  const yearStart = useMemo(() => new Date(year, 0, 1).getTime(), [year]);
  const yearMs = useMemo(
    () => new Date(year + 1, 0, 1).getTime() - yearStart,
    [year, yearStart],
  );
  const frac = (d: Date | string | null | undefined) => {
    if (!d) return null;
    const t = new Date(d).getTime();
    return Math.min(1, Math.max(0, (t - yearStart) / yearMs));
  };

  // Group items by pillar slug.
  const seriesByPillar = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["series"]>();
    for (const s of data?.series ?? []) {
      const key = s.pillar ?? "_unassigned";
      (m.get(key) ?? m.set(key, []).get(key)!).push(s);
    }
    return m;
  }, [data]);

  const piecesByPillar = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["pieces"]>();
    for (const p of data?.pieces ?? []) {
      const key = p.pillar ?? "_unassigned";
      (m.get(key) ?? m.set(key, []).get(key)!).push(p);
    }
    return m;
  }, [data]);

  const hasUnassigned =
    (seriesByPillar.get("_unassigned")?.length ?? 0) > 0 ||
    (piecesByPillar.get("_unassigned")?.length ?? 0) > 0;

  const { ref: bleedRef, style: bleedStyle } = useFullBleed();

  // Click a lane → resolve x to a date, open the produce drawer for that slot.
  const onLaneClick = (
    e: React.MouseEvent<HTMLDivElement>,
    pillarSlug: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const date = new Date(yearStart + f * yearMs);
    setDraft({ pillarSlug, date: date.toISOString() });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Studio</h1>
          <p className="text-muted-foreground text-sm">
            Plan the year by pillar, then produce platform posts from any slot
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brands.length > 1 && (
            <SimpleSelect
              value={brandId}
              onValueChange={setBrandId}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              aria-label="Brand"
              size="sm"
            />
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-12 text-center text-sm font-semibold tabular-nums">
              {year}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setDraft({
                pillarSlug: pillars[0]?.slug ?? "",
                date: new Date(year, new Date().getMonth(), 1).toISOString(),
              })
            }
          >
            <Sparkles className="size-4" />
            New
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={bleedRef}
        style={bleedStyle}
        className="overflow-x-auto rounded-xl border"
      >
        <div style={{ minWidth: LABEL_W + TRACK_MIN }}>
          {/* Month axis */}
          <div className="bg-muted/30 flex border-b text-[11px]">
            <div
              className="bg-muted/30 sticky left-0 z-10 shrink-0 border-r px-3 py-1.5 font-semibold"
              style={{ width: LABEL_W }}
            >
              {brand.name}
            </div>
            <div className="relative h-7 flex-1">
              {MONTHS.map((m, i) => {
                const f = frac(new Date(year, i, 1))!;
                return (
                  <div
                    key={m}
                    className="text-muted-foreground absolute top-1.5 border-l pl-1.5"
                    style={{ left: `${f * 100}%`, height: 18 }}
                  >
                    {m}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pillar lanes */}
          {isLoading ? (
            <div className="text-muted-foreground p-6 text-sm">
              Loading the year…
            </div>
          ) : (
            <>
              {pillars.map((pillar) => (
                <Lane
                  key={pillar.slug}
                  label={pillar.name}
                  color={pillar.color}
                  onClick={(e) => onLaneClick(e, pillar.slug)}
                >
                  {(seriesByPillar.get(pillar.slug) ?? []).map((s) => {
                    const a = frac(s.startAt);
                    const b = frac(s.endAt);
                    if (a == null || b == null) return null;
                    return (
                      <SeriesBar
                        key={s.id}
                        left={a}
                        width={Math.max(b - a, 0.02)}
                        color={s.color ?? pillar.color}
                        label={s.name}
                        status={s.status}
                        meta={`${s.postCount} piece${s.postCount === 1 ? "" : "s"}`}
                        onOpen={() =>
                          goCalendar({ pillar: pillar.slug, at: s.startAt })
                        }
                      />
                    );
                  })}
                  {(piecesByPillar.get(pillar.slug) ?? []).map((p) => {
                    const f = frac(p.plannedAt);
                    if (f == null) return null;
                    return (
                      <PieceDot
                        key={p.id}
                        left={f}
                        color={pillar.color}
                        label={p.title ?? "Untitled"}
                        ai={p.origin === "ai"}
                        onOpen={() => router.push(`/app/content/${p.id}`)}
                      />
                    );
                  })}
                </Lane>
              ))}

              {hasUnassigned && (
                <Lane
                  label="Unassigned"
                  color="#64748b"
                  onClick={(e) => onLaneClick(e, pillars[0]?.slug ?? "")}
                >
                  {(seriesByPillar.get("_unassigned") ?? []).map((s) => {
                    const a = frac(s.startAt);
                    const b = frac(s.endAt);
                    if (a == null || b == null) return null;
                    return (
                      <SeriesBar
                        key={s.id}
                        left={a}
                        width={Math.max(b - a, 0.02)}
                        color={s.color ?? "#64748b"}
                        label={s.name}
                        status={s.status}
                        meta={`${s.postCount} pieces`}
                        onOpen={() => goCalendar({ at: s.startAt })}
                      />
                    );
                  })}
                </Lane>
              )}

              {/* Paid lane */}
              <Lane label="Campaigns" color="#f59e0b" muted>
                {(data?.initiatives ?? []).length === 0 ? (
                  <span className="text-muted-foreground absolute top-1/2 left-2 -translate-y-1/2 text-[11px]">
                    No campaigns this year
                  </span>
                ) : (
                  (data?.initiatives ?? []).map((i) => {
                    const a = frac(i.startAt);
                    const b = frac(i.endAt);
                    if (a == null || b == null) return null;
                    return (
                      <SeriesBar
                        key={i.id}
                        left={a}
                        width={Math.max(b - a, 0.02)}
                        color={i.color ?? "#f59e0b"}
                        label={i.name}
                        status={i.status}
                        meta={i.goal ?? "paid"}
                        dashed
                        onOpen={() => goCalendar({ at: i.startAt })}
                      />
                    );
                  })
                )}
              </Lane>
            </>
          )}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Tip: click anywhere in a pillar lane to draft content for that pillar +
        date.
      </p>

      {draft && (
        <ProduceDrawer
          brandId={brandId}
          brandSlug={brand.slug}
          pillarSlug={draft.pillarSlug}
          date={draft.date}
          open={!!draft}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

function Lane({
  label,
  color,
  children,
  onClick,
  muted,
}: {
  label: string;
  color: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  muted?: boolean;
}) {
  return (
    <div className="group flex border-b last:border-b-0">
      <div
        className="bg-background sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-3 py-2"
        style={{ width: LABEL_W }}
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span
          className={cn(
            "truncate text-xs font-medium",
            muted && "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </div>
      <div
        className="hover:bg-accent/20 relative h-14 flex-1 cursor-pointer transition-colors"
        onClick={onClick}
      >
        {/* faint month gridlines */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="border-border/40 absolute inset-y-0 border-l"
            style={{ left: `${(i / 12) * 100}%` }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

function SeriesBar({
  left,
  width,
  color,
  label,
  status,
  meta,
  dashed,
  onOpen,
}: {
  left: number;
  width: number;
  color: string;
  label: string;
  status: string;
  meta?: string;
  dashed?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role={onOpen ? "button" : undefined}
          className={cn(
            "absolute top-1/2 flex h-7 -translate-y-1/2 items-center overflow-hidden rounded-md border px-2 text-[11px] font-medium text-white",
            STATUS_OPACITY[status] ?? "opacity-90",
            dashed && "border-dashed bg-transparent",
            onOpen && "cursor-pointer hover:brightness-110",
          )}
          style={{
            left: `${left * 100}%`,
            width: `calc(${width * 100}% - 2px)`,
            background: dashed ? "transparent" : color,
            borderColor: color,
            color: dashed ? color : "white",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.();
          }}
        >
          <span className="truncate">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs capitalize">
          {status}
          {meta ? ` · ${meta}` : ""}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function PieceDot({
  left,
  color,
  label,
  ai,
  onOpen,
}: {
  left: number;
  color: string;
  label: string;
  ai?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role={onOpen ? "button" : undefined}
          className={cn(
            "absolute bottom-1 -translate-x-1/2",
            onOpen && "cursor-pointer",
          )}
          style={{ left: `${left * 100}%` }}
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.();
          }}
        >
          <span
            className="ring-background block size-2.5 rounded-full ring-2"
            style={{ background: color }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{label}</span>
        {ai && (
          <span className="text-muted-foreground block text-xs">AI draft</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
