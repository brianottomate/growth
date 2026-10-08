"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import {
  stageBoardCollision,
  stageBoardInstructions,
  stageBoardAnnouncements,
  restoreStageBoardFocus,
  useStageBoardSensors,
} from "@/components/ui/stage-board-dnd";
import { Button } from "@/components/ui/button";
import { useContentWidth } from "@/components/content-width";
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
import { AccountList } from "./AccountList";
import { FilterPill, SegmentedToggle } from "./PageHeader";

export type PipelineCard = PerformancePipelineCard;
export type PipelineLayout = "board" | "list";

const LENSES = ["all", "commercial", "creative", "delivery"] as const;
const LENS_VIEW: Record<(typeof LENSES)[number], CardView> = {
  all: "All",
  commercial: "Commercial",
  creative: "Creative",
  delivery: "Delivery",
};
const VIEW_LENS = Object.fromEntries(
  Object.entries(LENS_VIEW).map(([lens, view]) => [view, lens]),
) as Record<CardView, (typeof LENSES)[number]>;

const DENSITIES = ["dense", "compact", "summary", "milestones"] as const;
const DENSITY_DETAIL: Record<(typeof DENSITIES)[number], CardDetail> = {
  dense: "Dense",
  compact: "Compact",
  summary: "Overview",
  milestones: "Detailed",
};
const DENSITY_LABEL: Record<(typeof DENSITIES)[number], string> = {
  dense: "Dense",
  compact: "Compact",
  summary: "Summary",
  milestones: "Milestones",
};
const STAGE_IDS = PIPELINE_COLUMNS.map((column) => column.id);
const WHO = ["clients", "prospects", "all"] as const;
const WHO_LABEL: Record<(typeof WHO)[number], string> = {
  clients: "Clients",
  prospects: "Prospects",
  all: "All",
};

const LENS_LABEL: Record<CardView, string> = {
  All: "Everything",
  Commercial: "Commercial",
  Creative: "Creative",
  Delivery: "Delivery",
};

/**
 * The same accounts two ways: a board for the funnel left to right, a list
 * for scanning everyone at once. Dashboard opens on the board, Clients on
 * the list; the toolbar is the same on both.
 */
export function PipelineBoard({
  cards,
  defaultLayout = "board",
  layouts = ["board", "list"],
  menus,
  details,
}: {
  cards: PipelineCard[];
  defaultLayout?: PipelineLayout;
  /** Which layouts to offer; one layout hides the toggle. */
  layouts?: PipelineLayout[];
  /** Per-row menus for the list, keyed by card id. */
  menus?: Record<string, ReactNode>;
  /** What opens under a list row, keyed by card id. */
  details?: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const sensors = useStageBoardSensors();
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const [stageOverrides, setStageOverrides] = useState<
    Record<string, PipelineStage>
  >({});
  const saving = useRef(false);
  const keyboardMove = useRef<string | null>(null);
  const savedMoves = useRef(new Set<string>());
  // Keep a successful move visible until the server refresh acknowledges it.
  useEffect(() => {
    const saved = new Set(savedMoves.current);
    savedMoves.current.clear();
    setStageOverrides((current) => {
      const confirmed = cards.filter(
        (card) =>
          current[card.id] !== undefined &&
          (current[card.id] === card.stage || saved.has(card.id)),
      );
      if (!confirmed.length) return current;
      const next = { ...current };
      for (const card of confirmed) {
        delete next[card.id];
      }
      return next;
    });
  }, [cards]);
  const move = useMutation(
    orpc.performance.setPipelineStage.mutationOptions({
      onSuccess: (_result, input) => {
        savedMoves.current.add(input.brandId);
      },
      onError: (error, input) => {
        setStageOverrides((current) => {
          const next = { ...current };
          delete next[input.brandId];
          return next;
        });
        toast.error(error.message);
        if (keyboardMove.current === input.brandId) {
          const card = cards.find((card) => card.id === input.brandId);
          if (card) restoreStageBoardFocus(card.id, card.stage);
        }
      },
      onSettled: () => {
        keyboardMove.current = null;
        saving.current = false;
        router.refresh();
      },
    }),
  );
  function onDragEnd({ active, over, activatorEvent }: DragEndEvent) {
    setActiveCard(null);
    const stage = PIPELINE_COLUMNS.find((column) => column.id === over?.id)?.id;
    const card = cards.find((card) => card.id === active.id);
    if (
      !stage ||
      !card ||
      saving.current ||
      (stageOverrides[card.id] ?? card.stage) === stage
    )
      return;
    keyboardMove.current = activatorEvent.type === "keydown" ? card.id : null;
    if (keyboardMove.current) restoreStageBoardFocus(card.id, stage);
    saving.current = true;
    setStageOverrides((current) => ({ ...current, [card.id]: stage }));
    move.mutate({ brandId: card.id, stage });
  }
  // Every control lives in the URL so a view can be bookmarked or shared.
  const [params, setParams] = useQueryStates(
    {
      layout: parseAsStringLiteral(["board", "list"] as const).withDefault(
        defaultLayout,
      ),
      lens: parseAsStringLiteral(LENSES).withDefault("all"),
      cards: parseAsStringLiteral(DENSITIES).withDefault("dense"),
      q: parseAsString.withDefault(""),
      hidden: parseAsArrayOf(parseAsStringLiteral(STAGE_IDS)).withDefault([
        "prospects",
        "paused",
      ]),
      who: parseAsStringLiteral(WHO).withDefault("clients"),
      people: parseAsStringLiteral(["all", "mine"] as const).withDefault("all"),
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );
  const { layout, q: search, hidden: collapsed } = params;
  // The board wants the whole canvas; the list reads better in a column.
  const { set: setWidth } = useContentWidth();
  useEffect(() => {
    setWidth(layout === "board" ? "full" : "contained");
  }, [layout, setWidth]);
  const view = LENS_VIEW[params.lens];
  // Bumped when the same density is picked again, so cards a rep opened by
  // hand fall back in line with the rest.
  const [revision, setRevision] = useState(0);
  const detailSignal = { detail: DENSITY_DETAIL[params.cards], revision };
  function setAll(cards: (typeof DENSITIES)[number]) {
    void setParams({ cards });
    setRevision((current) => current + 1);
  }
  function toggleColumn(stage: PipelineStage) {
    void setParams({
      hidden: collapsed.includes(stage)
        ? collapsed.filter((id) => id !== stage)
        : [...collapsed, stage],
    });
  }
  // "Mine" is any client where I am the CSM or the lead.
  const me = useQuery({
    ...orpc.performance.staffRoster.queryOptions(),
    staleTime: 5 * 60_000,
  }).data?.currentUserId;
  const matching = cards
    .map((card) => ({ ...card, stage: stageOverrides[card.id] ?? card.stage }))
    .filter(
      (card) =>
        `${card.name} ${card.website ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()) &&
        (params.people === "all" ||
          (!!me && (card.lead?.id === me || card.csLead?.id === me))),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  // The board shows every column; the list narrows to clients or prospects.
  const visible =
    layout === "list" && params.who !== "all"
      ? matching.filter((card) =>
          params.who === "prospects"
            ? card.stage === "prospects"
            : card.stage !== "prospects",
        )
      : matching;
  const whoCount = (who: (typeof WHO)[number]) =>
    who === "all"
      ? matching.length
      : matching.filter((card) =>
          who === "prospects"
            ? card.stage === "prospects"
            : card.stage !== "prospects",
        ).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {layout === "list" ? (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Who to show"
          >
            {WHO.map((who) => (
              <FilterPill
                key={who}
                active={params.who === who}
                onClick={() => void setParams({ who })}
                count={whoCount(who)}
              >
                {WHO_LABEL[who]}
              </FilterPill>
            ))}
          </div>
        ) : (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Status lens"
          >
            {CARD_VIEWS.map((item) => (
              <FilterPill
                key={item}
                active={view === item}
                onClick={() => void setParams({ lens: VIEW_LENS[item] })}
              >
                {LENS_LABEL[item]}
              </FilterPill>
            ))}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-56 max-w-full"
            aria-label="Search accounts"
            placeholder="Search accounts or sites"
            value={search}
            onChange={(event) => void setParams({ q: event.target.value })}
          />
          <SegmentedToggle
            label="Whose accounts"
            value={params.people}
            onChange={(people) => void setParams({ people })}
            options={[
              { id: "all", label: "All" },
              { id: "mine", label: "Mine" },
            ]}
          />
          {layouts.length > 1 ? (
            <SegmentedToggle
              label="Layout"
              value={layout}
              onChange={(next) => void setParams({ layout: next })}
              options={[
                { id: "board", label: "Board" },
                { id: "list", label: "List" },
              ]}
            />
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span aria-live="polite">
          {visible.length} {visible.length === 1 ? "account" : "accounts"}
        </span>
        {layout === "board" ? (
          <div
            className="ml-auto flex items-center gap-1"
            role="group"
            aria-label="All card details"
          >
            <span className="mr-1">Cards</span>
            {DENSITIES.map((density) => (
              <Button
                key={density}
                variant={params.cards === density ? "secondary" : "ghost"}
                size="xs"
                aria-pressed={params.cards === density}
                onClick={() => setAll(density)}
              >
                {DENSITY_LABEL[density]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {layout === "list" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <AccountList
            cards={visible}
            view={view}
            menus={menus}
            details={details}
          />
        </div>
      ) : (
        <DndContext
          id="performance-pipeline"
          sensors={sensors}
          collisionDetection={stageBoardCollision}
          accessibility={{
            screenReaderInstructions: stageBoardInstructions,
            announcements: stageBoardAnnouncements,
          }}
          onDragStart={({ active }) =>
            setActiveCard(visible.find((card) => card.id === active.id) ?? null)
          }
          onDragCancel={() => setActiveCard(null)}
          onDragEnd={onDragEnd}
        >
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
                    <StageDropTarget
                      key={column.id}
                      stage={column.id}
                      collapsed
                    >
                      <button
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
                    </StageDropTarget>
                  );
                return (
                  <StageDropTarget key={column.id} stage={column.id}>
                    <section
                      aria-label={column.name}
                      className="flex h-full max-h-full min-h-52 flex-col rounded-xl border bg-muted/10 p-2"
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
                          <DraggableClientCard
                            key={card.id}
                            card={card}
                            view={view}
                            detailSignal={detailSignal}
                            disabled={move.isPending}
                          />
                        ))}
                        {rows.length === 0 && (
                          <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                            No clients in this stage.
                          </p>
                        )}
                      </div>
                    </section>
                  </StageDropTarget>
                );
              })}
            </div>
          </div>
          <DragOverlay>
            {activeCard ? (
              <div
                className="rounded-xl border bg-card p-4 shadow-xl"
                aria-hidden="true"
              >
                <p className="text-sm font-semibold">{activeCard.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Move to another stage
                </p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function StageDropTarget({
  stage,
  collapsed = false,
  children,
}: {
  stage: PipelineStage;
  collapsed?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    data: {
      label: PIPELINE_COLUMNS.find((column) => column.id === stage)?.name,
    },
  });
  return (
    <div
      ref={setNodeRef}
      data-stage-column={stage}
      tabIndex={-1}
      className={cn(
        "max-h-full min-h-0 rounded-xl",
        collapsed ? "[&>button]:w-full" : "h-full",
        isOver && "bg-accent/30 ring-2 ring-ring",
      )}
    >
      {children}
    </div>
  );
}

function DraggableClientCard({
  card,
  view,
  detailSignal,
  disabled,
}: {
  card: PipelineCard;
  view: CardView;
  detailSignal: { detail: CardDetail; revision: number };
  disabled: boolean;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useDraggable({ id: card.id, disabled, data: { label: card.name } });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <PerformanceClientCard
        card={card}
        view={view}
        detailSignal={detailSignal}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-disabled={disabled}
            data-stage-card-handle={card.id}
            aria-label={`Move ${card.name} between stages`}
            className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-disabled:opacity-50 pointer-coarse:size-11"
          >
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  );
}
