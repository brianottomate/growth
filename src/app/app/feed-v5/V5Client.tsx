"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Layers, Rocket, X } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { SimpleDialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { PILLAR_BY_SLUG, PILLARS } from "@/lib/pillars";
import { useFullBleed } from "@/lib/use-full-bleed";

export type V5Role = "owned" | "competitor" | "inspiration";

export type V5Brand = {
  id: string;
  name: string;
  logo: string | null;
  role: V5Role;
};

export type V5Entry = {
  id: string;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  role: V5Role;
  platform: string;
  handle: string | null;
  contentPostId: string | null;
  title: string | null;
  pillar: string | null;
  seriesName: string | null;
  seriesColor: string | null;
  text: string | null;
  status: string;
  externalUrl: string | null;
  externalKind: string | null;
  mediaUrl: string | null;
  likes: number;
  comments: number;
  views: number;
  at: string; // ISO — published ?? scheduled ?? created
};

// ---- date helpers (local time) -------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Monday that starts the week containing `d`. */
const weekStart = (d: Date) => addDays(dateOnly(d), -((d.getDay() + 6) % 7));
const weekKey = (d: Date) => {
  const s = weekStart(d);
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
};
const fmtDay = (d: Date) =>
  d.toLocaleDateString([], { month: "short", day: "numeric" });

const STATUS_DOT: Record<string, string> = {
  published: "bg-emerald-500",
  scheduled: "bg-sky-500",
  approved: "bg-amber-500",
  pending_review: "bg-amber-500",
  draft: "bg-slate-400",
  discovered: "bg-violet-400",
};

const ROLE_BADGE: Record<V5Role, { label: string; cls: string }> = {
  owned: { label: "You", cls: "bg-emerald-500/15 text-emerald-300" },
  competitor: { label: "Competitor", cls: "bg-amber-500/15 text-amber-300" },
  inspiration: { label: "Inspiration", cls: "bg-sky-500/15 text-sky-300" },
};

// One content piece in a cell: a master idea + its platform spots (throughline),
// or a single standalone/scraped post.
type Group = {
  key: string;
  contentPostId: string | null;
  entries: V5Entry[];
};

function groupEntries(entries: V5Entry[]): Group[] {
  const byKey = new Map<string, Group>();
  for (const e of entries) {
    const key = e.contentPostId ?? `solo:${e.id}`;
    const g = byKey.get(key);
    if (g) g.entries.push(e);
    else byKey.set(key, { key, contentPostId: e.contentPostId, entries: [e] });
  }
  return [...byKey.values()];
}

type LaneAxis = "brand" | "pillar" | "channel";
type Lane = { key: string; label: string; logo: string | null; role: V5Role | null; color: string | null; platform: string | null };

// ==========================================================================

export function V5Client({
  brands,
  entries,
  nowISO,
}: {
  brands: V5Brand[];
  entries: V5Entry[];
  nowISO: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const { ref, style } = useFullBleed();

  const [axis, setAxis] = useState<LaneAxis>("brand");
  // Brand filter — default everything on.
  const [brandSel, setBrandSel] = useState<Set<string>>(
    () => new Set(brands.map((b) => b.id)),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupUnit, setGroupUnit] = useState<"single" | "series">("single");

  const ownedFirst = useMemo(
    () =>
      [...brands].sort(
        (a, b) => (a.role === "owned" ? 0 : 1) - (b.role === "owned" ? 0 : 1),
      ),
    [brands],
  );

  const filtered = useMemo(
    () => entries.filter((e) => brandSel.has(e.brandId)),
    [entries, brandSel],
  );

  // Lanes (columns) for the current axis.
  const lanes = useMemo<Lane[]>(() => {
    if (axis === "brand") {
      return ownedFirst
        .filter((b) => brandSel.has(b.id))
        .map((b) => ({
          key: b.id,
          label: b.name,
          logo: b.logo,
          role: b.role,
          color: null,
          platform: null,
        }));
    }
    if (axis === "pillar") {
      const present = new Set(filtered.map((e) => e.pillar ?? "__none"));
      const out: Lane[] = PILLARS.filter((p) => present.has(p.slug)).map((p) => ({
        key: p.slug,
        label: p.name,
        logo: null,
        role: null,
        color: p.color,
        platform: null,
      }));
      if (present.has("__none"))
        out.push({ key: "__none", label: "Unsorted", logo: null, role: null, color: null, platform: null });
      return out;
    }
    // channel
    const platforms = [...new Set(filtered.map((e) => e.platform))].sort();
    return platforms.map((p) => ({
      key: p,
      label: platformLabel(p),
      logo: null,
      role: null,
      color: null,
      platform: p,
    }));
  }, [axis, ownedFirst, brandSel, filtered]);

  const laneKeyOf = (e: V5Entry): string =>
    axis === "brand" ? e.brandId : axis === "pillar" ? (e.pillar ?? "__none") : e.platform;

  // Week rows (descending — soonest/newest first), and a cell index.
  const { weeks, cells } = useMemo(() => {
    const cellMap = new Map<string, V5Entry[]>();
    const weekSet = new Set<string>([weekKey(now)]);
    for (const e of filtered) {
      const d = new Date(e.at);
      const wk = weekKey(d);
      weekSet.add(wk);
      const ck = `${wk}|${laneKeyOf(e)}`;
      (cellMap.get(ck) ?? cellMap.set(ck, []).get(ck)!).push(e);
    }
    const weekList = [...weekSet].sort((a, b) => (a < b ? 1 : -1)); // desc
    return { weeks: weekList, cells: cellMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, axis, now]);

  const selectedEntries = useMemo(
    () => filtered.filter((e) => selected.has(e.id)),
    [filtered, selected],
  );

  const createGrouping = useMutation(
    trpc.content.createGrouping.mutationOptions({
      onSuccess: () => {
        setSelected(new Set());
        setGroupOpen(false);
        setGroupTitle("");
        router.refresh();
      },
    }),
  );

  const toggleGroup = (g: Group) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = g.entries.every((e) => next.has(e.id));
      for (const e of g.entries) allOn ? next.delete(e.id) : next.add(e.id);
      return next;
    });

  const sendToLaunch = () => {
    const sel = selectedEntries;
    if (!sel.length) return;
    const owned = sel.find((e) => e.role === "owned");
    const params = new URLSearchParams();
    if (owned) params.set("brandId", owned.brandId);
    params.set(
      "prompt",
      `Riff on ${sel.length} selected post${sel.length > 1 ? "s" : ""} from the timeline.`,
    );
    const imgs = [...new Set(sel.map((e) => e.mediaUrl).filter((u): u is string => !!u))].slice(0, 6);
    for (const u of imgs) params.append("img", u);
    router.push(`/app/launch?${params.toString()}`);
  };

  const allBrandsOn = brandSel.size === brands.length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {filtered.length} posts · {lanes.length} lanes · {weeks.length} weeks
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={axis}
            onChange={setAxis}
            options={[
              { value: "brand", label: "Brand" },
              { value: "pillar", label: "Pillar" },
              { value: "channel", label: "Channel" },
            ]}
          />
        </div>
      </div>

      {/* Brand filter chips */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b pb-4">
        <span className="text-muted-foreground mr-1 text-xs">Brands</span>
        <button
          onClick={() => setBrandSel(new Set(brands.map((b) => b.id)))}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs transition-colors",
            allBrandsOn
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          All
        </button>
        <button
          onClick={() => setBrandSel(new Set(brands.filter((b) => b.role === "owned").map((b) => b.id)))}
          className="border-border text-muted-foreground hover:bg-accent rounded-full border px-2 py-0.5 text-xs transition-colors"
        >
          Only owned
        </button>
        <span className="bg-border mx-1 h-4 w-px" />
        {ownedFirst.map((b) => {
          const on = brandSel.has(b.id);
          return (
            <button
              key={b.id}
              onClick={() =>
                setBrandSel((prev) => {
                  const next = new Set(prev);
                  next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                  return next;
                })
              }
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                on
                  ? "border-foreground/30 bg-accent"
                  : "border-border text-muted-foreground/60 hover:bg-accent",
              )}
            >
              <span className={cn("size-1.5 rounded-full", on ? ROLE_BADGE[b.role].cls : "bg-muted")} />
              {b.name}
            </button>
          );
        })}
      </div>

      {/* Swimlane grid — time flows down, lanes are columns. */}
      <div ref={ref} style={style} className="mt-5 px-8 sm:px-0">
        {lanes.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No lanes — turn on a brand above.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <div
              className="grid min-w-max"
              style={{ gridTemplateColumns: `7rem repeat(${lanes.length}, 15rem)` }}
            >
              {/* Header row */}
              <div className="bg-muted/40 sticky left-0 top-0 z-20 border-b border-r" />
              {lanes.map((l) => (
                <LaneHeader key={l.key} lane={l} />
              ))}

              {/* Week rows */}
              {weeks.map((wk) => {
                const start = new Date(`${wk}T00:00:00`);
                const end = addDays(start, 6);
                const isThisWeek = wk === weekKey(now);
                return (
                  <Fragment key={wk}>
                    <div
                      className={cn(
                        "bg-muted/20 sticky left-0 z-10 flex flex-col justify-start gap-0.5 border-b border-r p-2 text-xs",
                        isThisWeek && "bg-emerald-500/10",
                      )}
                    >
                      <span className="font-medium">{fmtDay(start)}</span>
                      <span className="text-muted-foreground">– {fmtDay(end)}</span>
                      {isThisWeek && (
                        <span className="mt-0.5 text-[10px] font-medium text-emerald-400">
                          This week
                        </span>
                      )}
                    </div>
                    {lanes.map((l) => {
                      const cell = cells.get(`${wk}|${l.key}`) ?? [];
                      const groups = groupEntries(cell);
                      return (
                        <div
                          key={l.key}
                          className="flex min-h-16 flex-col gap-1.5 border-b border-r p-1.5 [&:nth-last-child(1)]:border-r-0"
                        >
                          {groups.map((g) => (
                            <GroupCard
                              key={g.key}
                              group={g}
                              selected={g.entries.every((e) => selected.has(e.id))}
                              onToggle={() => toggleGroup(g)}
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
        )}
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="bg-card flex items-center gap-2 rounded-full border px-3 py-2 shadow-lg">
            <span className="px-1 text-sm font-medium">{selected.size} selected</span>
            <span className="bg-border h-5 w-px" />
            <button
              onClick={() => setGroupOpen(true)}
              className="hover:bg-accent flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors"
            >
              <Layers className="size-4" /> Group
            </button>
            <button
              onClick={sendToLaunch}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              <Rocket className="size-4" /> Send to Launch
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-full transition-colors"
              aria-label="Clear selection"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Group dialog */}
      <SimpleDialog open={groupOpen} onOpenChange={setGroupOpen} title="Group into a content idea">
        <p className="text-muted-foreground text-sm">
          {selected.size} post{selected.size === 1 ? "" : "s"} → one content idea on the board.
        </p>
        <label className="mt-3 block">
          <span className="text-muted-foreground text-xs">Title</span>
          <input
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder="e.g. World Cup 2026 push"
            className="border-border bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
        <div className="mt-3 flex gap-2">
          {(["single", "series"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setGroupUnit(u)}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                groupUnit === u ? "border-foreground/40 bg-accent" : "border-border hover:bg-accent",
              )}
            >
              <span className="block text-sm font-medium capitalize">{u}</span>
              <span className="text-muted-foreground">
                {u === "single"
                  ? "One idea; these posts are its renderings"
                  : "A series; one idea per post"}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => setGroupOpen(false)}
            className="text-muted-foreground hover:bg-accent rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={createGrouping.isPending}
            onClick={() =>
              createGrouping.mutate({
                platformPostIds: [...selected],
                title: groupTitle.trim() || undefined,
                unit: groupUnit,
              })
            }
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {createGrouping.isPending ? "Grouping…" : "Create grouping"}
          </button>
        </div>
        {createGrouping.error && (
          <p className="mt-2 text-xs text-rose-400">{createGrouping.error.message}</p>
        )}
      </SimpleDialog>
    </div>
  );
}

// ---- pieces --------------------------------------------------------------

function LaneHeader({ lane }: { lane: Lane }) {
  return (
    <div
      className="bg-muted/40 sticky top-0 z-10 flex items-center gap-1.5 border-b border-r px-2 py-2 text-xs font-medium [&:nth-last-child(1)]:border-r-0"
      style={lane.color ? { borderBottom: `2px solid ${lane.color}` } : undefined}
    >
      {lane.platform ? (
        <ChannelLogo platform={lane.platform} className="size-4 shrink-0" />
      ) : lane.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={lane.logo} alt="" className="size-4 shrink-0 rounded object-cover" />
      ) : null}
      <span className="truncate">{lane.label}</span>
      {lane.role && lane.role !== "owned" && (
        <span className={cn("ml-auto rounded px-1 py-0.5 text-[9px]", ROLE_BADGE[lane.role].cls)}>
          {ROLE_BADGE[lane.role].label}
        </span>
      )}
    </div>
  );
}

function GroupCard({
  group,
  selected,
  onToggle,
}: {
  group: Group;
  selected: boolean;
  onToggle: () => void;
}) {
  const first = group.entries[0]!;
  const pillar = first.pillar ? PILLAR_BY_SLUG[first.pillar] : null;
  const media = group.entries.find((e) => e.mediaUrl)?.mediaUrl ?? null;
  const label = first.title ?? first.text ?? platformLabel(first.platform);
  const platforms = [...new Set(group.entries.map((e) => e.platform))];
  const status = first.status;
  const externalUrl = group.entries.find((e) => e.externalUrl)?.externalUrl ?? null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      title={label}
      className={cn(
        "group bg-card relative flex cursor-pointer flex-col gap-1 overflow-hidden rounded-md border p-1 text-left text-xs transition-colors",
        selected ? "ring-2 ring-emerald-500" : "hover:border-foreground/30",
      )}
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
    >
      {externalUrl && (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open original"
          className="bg-card/80 text-muted-foreground hover:text-foreground absolute right-1 top-1 z-10 flex size-5 items-center justify-center rounded border opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
      <div className="flex items-center gap-1.5">
        <Poster src={media} platform={first.platform} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words leading-tight">{label}</span>
          <span className="mt-0.5 flex items-center gap-1">
            <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status] ?? "bg-slate-400")} />
            {/* Throughline: this idea's platform spots. */}
            {platforms.slice(0, 4).map((p) => (
              <ChannelLogo key={p} platform={p} className="size-3" />
            ))}
            {group.entries.length > 1 && (
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {group.entries.length} spots
              </span>
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Post thumbnail with a graceful fallback: scraped IG/peer media lives on
 *  signed CDN URLs (scontent.cdninstagram.com) that EXPIRE, so a once-valid
 *  thumbnail 404s later. On error, fall back to the platform logo rather than
 *  a broken-image icon. (Durable fix = re-host to R2 at scrape time.) */
function Poster({ src, platform }: { src: string | null; platform: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <span className="bg-muted relative size-8 shrink-0 overflow-hidden rounded">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span className="text-muted-foreground flex size-full items-center justify-center">
          <ChannelLogo platform={platform} className="size-4" />
        </span>
      )}
    </span>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="border-border flex overflow-hidden rounded-full border">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
