"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PIPELINE_COLUMNS,
  type PipelineStage,
} from "@/lib/performance-pipeline";
import type { PerformancePipelineCard } from "@/lib/performance-card";
import {
  CARD_VIEWS,
  PerformanceClientCard,
  type CardDetail,
  type CardView,
} from "./PerformanceClientCard";

export type PipelineCard = PerformancePipelineCard;

export function PipelineBoard({ cards }: { cards: PipelineCard[] }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<CardView>("All");
  const [collapsed, setCollapsed] = useState<PipelineStage[]>([
    "prospects",
    "paused",
  ]);
  const [detailSignal, setDetailSignal] = useState({
    detail: "Compact" as CardDetail,
    revision: 0,
  });
  function setAll(detail: CardDetail) {
    setDetailSignal((current) => ({ detail, revision: current.revision + 1 }));
  }
  function toggleColumn(stage: PipelineStage) {
    setCollapsed((current) =>
      current.includes(stage)
        ? current.filter((id) => id !== stage)
        : [...current, stage],
    );
  }
  const visible = cards.filter((card) =>
    `${card.name} ${card.website ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Pipeline focus"
          >
            {CARD_VIEWS.map((item) => (
              <Button
                key={item}
                variant={view === item ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === item}
                onClick={() => setView(item)}
              >
                {item}
              </Button>
            ))}
          </div>
          <Input
            className="h-8 w-60 max-w-full"
            aria-label="Search pipeline"
            placeholder="Search clients or sites"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {visible.length} {visible.length === 1 ? "account" : "accounts"}
          </span>
        </div>
        <div
          className="ml-auto flex flex-wrap items-center gap-1"
          role="group"
          aria-label="All card details"
        >
          <Button variant="ghost" size="sm" onClick={() => setAll("Compact")}>
            Compact
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAll("Overview")}>
            Summary
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAll("Detailed")}>
            Milestones
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-3">
        <div
          className="grid h-full items-start gap-3"
          style={{
            gridTemplateColumns: PIPELINE_COLUMNS.map((column) =>
              collapsed.includes(column.id) ? "44px" : "minmax(340px, 1fr)",
            ).join(" "),
            minWidth:
              PIPELINE_COLUMNS.reduce(
                (width, column) =>
                  width + (collapsed.includes(column.id) ? 44 : 340),
                0,
              ) +
              (PIPELINE_COLUMNS.length - 1) * 12,
          }}
        >
          {PIPELINE_COLUMNS.map((column) => {
            const rows = visible.filter((card) => card.stage === column.id);
            if (collapsed.includes(column.id))
              return (
                <button
                  key={column.id}
                  type="button"
                  aria-label={`Expand ${column.name}`}
                  aria-expanded={false}
                  onClick={() => toggleColumn(column.id)}
                  className="flex min-h-52 flex-col items-center gap-3 rounded-xl border bg-muted/10 px-2 py-3 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ChevronRight className="size-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {rows.length}
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {column.name}
                  </span>
                </button>
              );
            return (
              <section
                key={column.id}
                aria-label={column.name}
                className="flex max-h-full min-h-0 flex-col rounded-xl border bg-muted/10 p-2"
              >
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
                  <h2 className="text-xs font-semibold">{column.name}</h2>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {rows.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Collapse ${column.name}`}
                      aria-expanded
                      onClick={() => toggleColumn(column.id)}
                    >
                      <ChevronLeft />
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 scrollbar-thin space-y-2 overflow-y-auto">
                  {rows.map((card) => (
                    <PerformanceClientCard
                      key={card.id}
                      card={card}
                      view={view}
                      detailSignal={detailSignal}
                    />
                  ))}
                  {rows.length === 0 && (
                    <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                      No clients in this stage.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
