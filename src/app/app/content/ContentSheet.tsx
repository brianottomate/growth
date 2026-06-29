"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { OwnerAvatar } from "@/components/assignment/assignee";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { cn } from "@/components/ui/lib/utils";
import type { RouterOutputs } from "@/trpc/react";

type Row = RouterOutputs["content"]["grid"][number];

// Column run mirrors the team's old Google-Sheet calendar, left → right.
// "Repurpose To" + "UTM" have no home in the model yet — kept as columns (so
// nothing reads as missing) but rendered empty for now.
const COLUMNS = [
  "Day",
  "Platform",
  "Pillar",
  "Series",
  "Content Concept",
  "Format",
  "Hook",
  "Caption Direction",
  "Visuals",
  "CTA",
  "ManyChat?",
  "Keyword",
  "Primary KPI",
  "Repurpose To",
  "Content Owner",
  "Status",
  "Final Assets",
  "Links",
  "UTM",
] as const;

// Tinted status fills, echoing the spreadsheet's colored Status column.
const STATUS_FILL: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  approved: "bg-amber-500/15 text-amber-300",
  pending_review: "bg-amber-500/15 text-amber-300",
  discovered: "bg-violet-500/15 text-violet-300",
  draft: "bg-muted text-muted-foreground",
  slot: "bg-slate-500/15 text-slate-300",
  rejected: "bg-rose-500/15 text-rose-300",
  archived: "bg-muted text-muted-foreground",
};

const ymOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y!, m!, 1).toLocaleDateString([], {
    month: "short",
    year: "numeric",
  });
};
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/** The legacy-comfort surface: the old content sheet, rebuilt natively. Day
 *  pinned left, the full column run scrolling horizontally, one workbook tab
 *  per month. Read-only — click a row to edit it on the detail page. */
export function ContentSheet({
  brandId,
  pillar,
  onOpen,
}: {
  brandId?: string;
  pillar?: string;
  onOpen: (id: string) => void;
}) {
  const trpc = useTRPC();
  const { data: rows = [], isLoading } = useQuery(
    trpc.content.grid.queryOptions({ brandId, pillar }),
  );

  // Month "workbooks" derived from the rows' effective publish dates.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(ymOf(r.at));
    return [...set].sort();
  }, [rows]);

  const currentYm = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
  }, []);

  const [picked, setPicked] = useState<string | null>(null);
  // Default to the current month if it has rows, else the latest workbook.
  const month =
    (picked && months.includes(picked) ? picked : null) ??
    (months.includes(currentYm) ? currentYm : (months[months.length - 1] ?? null));

  const monthRows = useMemo(
    () => (month ? rows.filter((r) => ymOf(r.at) === month) : []),
    [rows, month],
  );

  const headerCls =
    "sticky top-0 z-20 whitespace-nowrap bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground";
  const cellCls = "border-border border-b px-3 py-2 align-top text-sm";

  return (
    <div className="mt-5 flex h-[calc(100vh-13rem)] flex-col">
      {/* Grid */}
      <div className="border-border flex-1 overflow-auto rounded-t-xl border">
        {isLoading && rows.length === 0 ? (
          <div className="text-muted-foreground px-3 py-12 text-center text-sm">
            Loading…
          </div>
        ) : months.length === 0 ? (
          <div className="text-muted-foreground px-3 py-12 text-center text-sm">
            No dated content yet — give an idea a plan date or schedule a spot and
            it shows up here.
          </div>
        ) : (
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                {COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      headerCls,
                      i === 0 && "left-0 z-30",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthRows.map((r) => (
                <SheetRow key={r.id} row={r} onOpen={onOpen} cellCls={cellCls} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Month "workbooks" — the spreadsheet tab strip. */}
      <div className="border-border bg-muted/30 flex items-center gap-1 overflow-x-auto rounded-b-xl border border-t-0 px-2 py-1.5">
        {months.length === 0 ? (
          <span className="text-muted-foreground px-2 text-xs">No workbooks</span>
        ) : (
          months.map((ym) => (
            <button
              key={ym}
              onClick={() => setPicked(ym)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors",
                ym === month
                  ? "bg-background text-foreground border-border border shadow-sm"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {monthLabel(ym)}
            </button>
          ))
        )}
        {month && (
          <span className="text-muted-foreground ml-auto px-2 text-xs tabular-nums">
            {monthRows.length} {monthRows.length === 1 ? "row" : "rows"}
          </span>
        )}
      </div>
    </div>
  );
}

function SheetRow({
  row: r,
  onOpen,
  cellCls,
}: {
  row: Row;
  onOpen: (id: string) => void;
  cellCls: string;
}) {
  const pillar = r.pillar ? PILLAR_BY_SLUG[r.pillar] : null;
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onOpen(r.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(r.id);
      }}
      className="group hover:bg-accent/40 cursor-pointer"
    >
      {/* Day — pinned left */}
      <td
        className={cn(
          cellCls,
          "bg-background group-hover:bg-accent/40 sticky left-0 z-10 whitespace-nowrap font-medium tabular-nums",
        )}
      >
        {fmtDay(r.at)}
      </td>

      {/* Platform */}
      <td className={cn(cellCls, "whitespace-nowrap")}>
        <span className="flex items-center gap-1">
          {r.platforms.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            r.platforms.map((p) => (
              <span key={p} title={platformLabel(p)}>
                <ChannelLogo platform={p} className="size-4" />
              </span>
            ))
          )}
        </span>
      </td>

      {/* Pillar */}
      <td className={cn(cellCls, "whitespace-nowrap")}>
        {pillar ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: `${pillar.color}22`, color: pillar.color }}
          >
            {pillar.name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Series */}
      <td className={cn(cellCls, "max-w-[160px] truncate")} title={r.seriesName ?? ""}>
        {r.seriesName ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: `${r.seriesColor ?? "#64748b"}22`,
              color: r.seriesColor ?? "#94a3b8",
            }}
          >
            {r.seriesName}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Content Concept (title) */}
      <td
        className={cn(cellCls, "min-w-[200px] max-w-[260px] font-medium")}
        title={r.title ?? ""}
      >
        {r.title ?? <span className="text-muted-foreground font-normal">Untitled</span>}
      </td>

      {/* Format */}
      <td
        className={cn(cellCls, "max-w-[160px] truncate")}
        title={r.formats.join(" · ")}
      >
        {r.formats.length ? (
          r.formats.join(" · ")
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Hook / Caption Direction / Visuals / CTA — long text, wraps */}
      <LongCell cellCls={cellCls} value={r.hook} />
      <LongCell cellCls={cellCls} value={r.captionDirection} />
      <LongCell cellCls={cellCls} value={r.visualDirection} />
      <LongCell cellCls={cellCls} value={r.ctaText} />

      {/* ManyChat? — derived from a comment-trigger keyword being set */}
      <td className={cn(cellCls, "whitespace-nowrap text-center")}>
        {r.ctaKeyword ? (
          <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-emerald-300">
            YES
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Keyword */}
      <td className={cn(cellCls, "whitespace-nowrap")}>
        {r.ctaKeyword ?? <span className="text-muted-foreground">—</span>}
      </td>

      {/* Primary KPI */}
      <td className={cn(cellCls, "max-w-[140px] truncate")} title={r.kpi ?? ""}>
        {r.kpi ?? <span className="text-muted-foreground">—</span>}
      </td>

      {/* Repurpose To — not modeled yet */}
      <td className={cn(cellCls, "text-muted-foreground")}>—</td>

      {/* Content Owner */}
      <td className={cn(cellCls, "whitespace-nowrap")}>
        {r.owner ? (
          <span className="flex items-center gap-1.5">
            <OwnerAvatar member={r.owner} size="sm" />
            <span className="truncate">{r.owner.name ?? "—"}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Status */}
      <td className={cn(cellCls, "whitespace-nowrap")}>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
            STATUS_FILL[r.status] ?? STATUS_FILL.draft,
          )}
        >
          {r.status.replace("_", " ")}
        </span>
      </td>

      {/* Final Assets */}
      <LinkCell cellCls={cellCls} urls={r.assetLinks} label="Asset" />

      {/* Links */}
      <LinkCell cellCls={cellCls} urls={r.links} label="Link" />

      {/* UTM — not modeled yet */}
      <td className={cn(cellCls, "text-muted-foreground")}>—</td>
    </tr>
  );
}

function LongCell({ cellCls, value }: { cellCls: string; value: string | null }) {
  return (
    <td className={cn(cellCls, "min-w-[220px] max-w-[280px]")}>
      {value ? (
        <span className="text-muted-foreground line-clamp-4 whitespace-pre-wrap">
          {value}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </td>
  );
}

function LinkCell({
  cellCls,
  urls,
  label,
}: {
  cellCls: string;
  urls: string[];
  label: string;
}) {
  return (
    <td className={cn(cellCls, "whitespace-nowrap")} onClick={(e) => e.stopPropagation()}>
      {urls.length === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="flex flex-wrap items-center gap-1">
          {urls.slice(0, 3).map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border text-muted-foreground hover:text-foreground hover:bg-accent rounded-md border px-1.5 py-0.5 text-xs transition-colors"
            >
              ↗ {label}
              {urls.length > 1 ? ` ${i + 1}` : ""}
            </a>
          ))}
          {urls.length > 3 && (
            <span className="text-muted-foreground text-xs">+{urls.length - 3}</span>
          )}
        </span>
      )}
    </td>
  );
}
