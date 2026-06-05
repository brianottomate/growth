"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { useTRPC } from "@/trpc/react";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { SimpleSelect } from "@/components/ui/select";
import { cn } from "@/components/ui/lib/utils";
import { PILLARS, PILLAR_BY_SLUG } from "@/lib/pillars";
import type { ContentStatus } from "@/server/db/schema";
import type { RouterOutputs } from "@/trpc/react";

type Card = RouterOutputs["content"]["board"][number];

// Active editorial pipeline, left → right. `rejected` / `archived` are terminal
// and intentionally off the board (they'd just be noise in the daily flow).
const COLUMNS: { status: ContentStatus; label: string }[] = [
  { status: "discovered", label: "Discovered" },
  { status: "draft", label: "Draft" },
  { status: "pending_review", label: "In Review" },
  { status: "approved", label: "Approved" },
  { status: "scheduled", label: "Scheduled" },
  { status: "published", label: "Published" },
];

const DOT: Record<string, string> = {
  published: "bg-emerald-500",
  scheduled: "bg-sky-500",
  approved: "bg-amber-500",
  pending_review: "bg-amber-500",
  draft: "bg-slate-400",
  discovered: "bg-violet-400",
  rejected: "bg-rose-500",
  archived: "bg-muted-foreground",
};

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

export function ContentBoard({
  brands,
}: {
  brands: { id: string; name: string; slug: string | null }[];
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();

  const [brandFilter, setBrandFilter] = useState("all");
  const [pillarFilter, setPillarFilter] = useState("all");
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  // A real drag should not also "click" the card open afterwards.
  const suppressClick = useRef(false);

  const input = useMemo(
    () => ({
      brandId: brandFilter !== "all" ? brandFilter : undefined,
      pillar: pillarFilter !== "all" ? pillarFilter : undefined,
    }),
    [brandFilter, pillarFilter],
  );

  const selectedBrand = brands.find((b) => b.id === brandFilter) ?? null;
  const pillars = useMemo(
    () =>
      selectedBrand
        ? PILLARS.filter((p) => p.brandSlug === selectedBrand.slug)
        : PILLARS,
    [selectedBrand],
  );

  const boardOptions = trpc.content.board.queryOptions(input);
  const { data: cards = [], isLoading } = useQuery(boardOptions);

  const setStatus = useMutation(
    trpc.content.setStatus.mutationOptions({
      onMutate: async ({ id, status }) => {
        const key = boardOptions.queryKey;
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<Card[]>(key);
        qc.setQueryData<Card[]>(key, (old) =>
          old?.map((c) => (c.id === id ? { ...c, status } : c)),
        );
        return { prev, key };
      },
      onError: (_e, _v, context) => {
        if (context?.prev) qc.setQueryData(context.key, context.prev);
      },
      onSettled: () => qc.invalidateQueries({ queryKey: boardOptions.queryKey }),
    }),
  );

  const byStatus = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const col of COLUMNS) m.set(col.status, []);
    for (const c of cards) m.get(c.status)?.push(c);
    return m;
  }, [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveCard(cards.find((c) => c.id === e.active.id) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveCard(null);
    suppressClick.current = true;
    const overStatus = e.over?.id as ContentStatus | undefined;
    const card = cards.find((c) => c.id === e.active.id);
    if (overStatus && card && card.status !== overStatus) {
      setStatus.mutate({ id: card.id, status: overStatus });
    }
  };

  const openCard = (id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    router.push(`/app/content/${id}`);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {cards.length} {cards.length === 1 ? "idea" : "ideas"} · drag to move
            through the pipeline
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect
            value={brandFilter}
            onValueChange={(v) => {
              setBrandFilter(v);
              setPillarFilter("all");
            }}
            options={[
              { value: "all", label: "All brands" },
              ...brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
            size="sm"
            aria-label="Brand"
          />
          <SimpleSelect
            value={pillarFilter}
            onValueChange={setPillarFilter}
            options={[
              { value: "all", label: "All pillars" },
              ...pillars.map((p) => ({ value: p.slug, label: p.name })),
            ]}
            size="sm"
            aria-label="Pillar"
          />
        </div>
      </div>

      {/* Board */}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="mt-5 flex flex-1 gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.status}
              status={col.status}
              label={col.label}
              cards={byStatus.get(col.status) ?? []}
              onOpen={openCard}
              loading={isLoading}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <ContentCardBody card={activeCard} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  label,
  cards,
  onOpen,
  loading,
}: {
  status: string;
  label: string;
  cards: Card[];
  onOpen: (id: string) => void;
  loading: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", DOT[status])} />
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {cards.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver ? "border-foreground/40 bg-accent/30" : "border-border/60",
        )}
      >
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} onOpen={onOpen} />
        ))}
        {cards.length === 0 && (
          <div className="text-muted-foreground/50 px-1 py-6 text-center text-xs">
            {loading ? "Loading…" : "Nothing here"}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  card,
  onOpen,
}: {
  card: Card;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(card.id)}
      className={cn("cursor-grab touch-none", isDragging && "opacity-40")}
    >
      <ContentCardBody card={card} />
    </div>
  );
}

function ContentCardBody({ card, dragging }: { card: Card; dragging?: boolean }) {
  const pillar = card.pillar ? PILLAR_BY_SLUG[card.pillar] : null;
  const reach =
    card.views > 0
      ? `${fmt(card.views)} views`
      : card.likes > 0
        ? `${fmt(card.likes)} likes`
        : null;
  return (
    <div
      className={cn(
        "bg-card rounded-lg border p-3 text-left",
        dragging && "shadow-lg",
      )}
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
    >
      <div className="flex items-start gap-2">
        <span className="line-clamp-2 flex-1 text-sm font-medium">
          {card.title ?? "Untitled"}
        </span>
        {card.origin === "ai" && (
          <span className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
            AI
          </span>
        )}
      </div>

      {(card.seriesName || pillar) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {card.seriesName && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: `${card.seriesColor ?? "#64748b"}22`,
                color: card.seriesColor ?? "#94a3b8",
              }}
            >
              {card.seriesName}
            </span>
          )}
          {pillar && (
            <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
              <span
                className="size-1.5 rounded-full"
                style={{ background: pillar.color }}
              />
              {pillar.name}
            </span>
          )}
        </div>
      )}

      <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[11px]">
        <span className="truncate">{card.brandName}</span>
        <span className="ml-auto flex items-center gap-1">
          {card.platforms.slice(0, 4).map((p) => (
            <span key={p} title={platformLabel(p)}>
              <ChannelLogo platform={p} className="size-3.5" />
            </span>
          ))}
        </span>
      </div>

      {(card.postCount > 0 || reach) && (
        <div className="text-muted-foreground/70 mt-1.5 flex items-center gap-2 text-[11px] tabular-nums">
          <span>
            {card.postCount} post{card.postCount === 1 ? "" : "s"}
          </span>
          {reach && <span>· {reach}</span>}
        </div>
      )}
    </div>
  );
}
