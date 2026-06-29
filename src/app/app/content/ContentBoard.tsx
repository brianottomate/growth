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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSquare, Plus } from "lucide-react";
import { cn } from "@/components/ui/lib/utils";
import {
  AssigneeButton,
  AvatarStack,
  MultiAssigneeButton,
  OwnerAvatar,
  useSelfAssignHotkey,
  type Member,
} from "@/components/assignment/assignee";
import { PILLARS, PILLAR_BY_SLUG } from "@/lib/pillars";
import type { ContentStatus } from "@/server/db/schema";
import type { RouterOutputs } from "@/trpc/react";
import { ContentCalendar } from "./ContentCalendar";
import { ContentSheet } from "./ContentSheet";
import { ReshuffleDialog } from "./ReshuffleDialog";
import { AddIdeaDrawer } from "./AddIdeaDrawer";

type Card = RouterOutputs["content"]["board"][number];

// Threaded through the board to the cards so each can assign its idea owner.
type Assign = {
  members: Member[];
  currentUserId: string;
  onAssign: (cardId: string, ownerId: string | null) => void;
  onSetAssignees: (cardId: string, userIds: string[]) => void;
};

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

const STATUS_LABEL: Record<string, string> = {
  slot: "Slot",
  draft: "Draft",
  discovered: "Discovered",
  pending_review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
  archived: "Archived",
};
// Pipeline order for the List view sort.
const STATUS_ORDER = [
  "discovered",
  "draft",
  "pending_review",
  "approved",
  "scheduled",
  "published",
  "slot",
  "rejected",
  "archived",
];

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

export function ContentBoard({
  brands,
  currentUserId,
}: {
  brands: { id: string; name: string; slug: string | null }[];
  currentUserId: string;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();

  const [brandFilter, setBrandFilter] = useState("all");
  const [pillarFilter, setPillarFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
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
  const { data: members = [] } = useQuery(
    trpc.content.assignableMembers.queryOptions(),
  );

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
      onSettled: () =>
        qc.invalidateQueries({ queryKey: boardOptions.queryKey }),
    }),
  );

  const setOwner = useMutation(
    trpc.content.setOwner.mutationOptions({
      onMutate: async ({ contentPostId, ownerId }) => {
        const key = boardOptions.queryKey;
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<Card[]>(key);
        const owner = ownerId
          ? (members.find((m) => m.id === ownerId) ?? null)
          : null;
        qc.setQueryData<Card[]>(key, (old) =>
          old?.map((c) => (c.id === contentPostId ? { ...c, owner } : c)),
        );
        return { prev, key };
      },
      onError: (_e, _v, context) => {
        if (context?.prev) qc.setQueryData(context.key, context.prev);
      },
      onSettled: () =>
        qc.invalidateQueries({ queryKey: boardOptions.queryKey }),
    }),
  );

  const setAssignees = useMutation(
    trpc.content.setAssignees.mutationOptions({
      onMutate: async ({ contentPostId, userIds }) => {
        const key = boardOptions.queryKey;
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<Card[]>(key);
        const assignees = userIds
          .map((id) => members.find((m) => m.id === id))
          .filter((m): m is Member => !!m);
        qc.setQueryData<Card[]>(key, (old) =>
          old?.map((c) => (c.id === contentPostId ? { ...c, assignees } : c)),
        );
        return { prev, key };
      },
      onError: (_e, _v, context) => {
        if (context?.prev) qc.setQueryData(context.key, context.prev);
      },
      onSettled: () =>
        qc.invalidateQueries({ queryKey: boardOptions.queryKey }),
    }),
  );

  const assign: Assign = {
    members,
    currentUserId,
    onAssign: (cardId, ownerId) =>
      setOwner.mutate({ contentPostId: cardId, ownerId }),
    onSetAssignees: (cardId, userIds) =>
      setAssignees.mutate({ contentPostId: cardId, userIds }),
  };

  // Inline "+ Add idea" creates under the filtered brand (or the first owned).
  const createBrandId =
    brandFilter !== "all" ? brandFilter : (brands[0]?.id ?? null);
  const createIdea = useMutation(
    trpc.content.create.mutationOptions({
      onSettled: () =>
        qc.invalidateQueries({ queryKey: boardOptions.queryKey }),
    }),
  );
  const onCreate = (title: string, plannedAt?: string) => {
    if (!createBrandId) return;
    createIdea.mutate({
      brandId: createBrandId,
      title,
      plannedAt,
      pillar: pillarFilter !== "all" ? pillarFilter : undefined,
    });
  };

  // List is the team's default surface; Board is the strategist's lens; Week is
  // the tactical "what's coming up this week" lens; Schedule is the full
  // date-first manual posting worklist.
  const [view, setView] = useState<
    "board" | "list" | "week" | "schedule" | "calendar" | "sheet"
  >("list");
  const [reshuffleOpen, setReshuffleOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const visible = useMemo(() => {
    let out = cards;
    if (statusFilter !== "all")
      out = out.filter((c) => c.status === statusFilter);
    if (mineOnly)
      out = out.filter(
        (c) =>
          c.owner?.id === currentUserId ||
          c.spotOwners.some((o) => o.id === currentUserId),
      );
    return out;
  }, [cards, statusFilter, mineOnly, currentUserId]);

  // Status options reflect what's actually present, in pipeline order.
  const statusOptions = useMemo(() => {
    const present = [...new Set(cards.map((c) => c.status))].sort(
      (a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
    );
    return [
      { value: "all", label: "All statuses" },
      ...present.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s })),
    ];
  }, [cards]);

  // Schedule view (spot-level, date-first) — fetched lazily when active.
  const scheduleOpts = trpc.content.schedule.queryOptions({
    brandId: brandFilter !== "all" ? brandFilter : undefined,
    pillar: pillarFilter !== "all" ? pillarFilter : undefined,
  });
  const { data: scheduleRows = [], isLoading: scheduleLoading } = useQuery({
    ...scheduleOpts,
    enabled: view === "schedule" || view === "calendar" || view === "week",
  });
  const scheduleVisible = useMemo(
    () =>
      scheduleRows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (
          mineOnly &&
          r.owner?.id !== currentUserId &&
          r.spotOwner?.id !== currentUserId
        )
          return false;
        return true;
      }),
    [scheduleRows, statusFilter, mineOnly, currentUserId],
  );
  const invalidateSchedule = () =>
    qc.invalidateQueries({ queryKey: scheduleOpts.queryKey });
  const setSpotSchedule = useMutation(
    trpc.content.setSpotSchedule.mutationOptions({
      onSettled: invalidateSchedule,
    }),
  );
  const onReschedule = (spotId: string, dateISO: string) =>
    setSpotSchedule.mutate({ platformPostId: spotId, scheduledAt: dateISO });

  const byStatus = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const col of COLUMNS) m.set(col.status, []);
    for (const c of visible) m.get(c.status)?.push(c);
    return m;
  }, [visible]);

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {visible.length} {visible.length === 1 ? "idea" : "ideas"}
            {view === "board" ? " · drag to move through the pipeline" : ""}
          </p>
        </div>
        {createBrandId && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
          >
            <Plus className="size-4" /> Add idea
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="border-border flex overflow-hidden rounded-full border">
          {(
            ["list", "board", "week", "schedule", "calendar", "sheet"] as const
          ).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1 text-xs font-medium capitalize transition-colors",
                view === v
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {(view === "schedule" || view === "calendar") && createBrandId && (
          <button
            onClick={() => setReshuffleOpen(true)}
            className="border-border hover:bg-accent rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          >
            ✨ Reshuffle
          </button>
        )}
        <button
          onClick={() => setMineOnly((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            mineOnly
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          Mine
        </button>
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
        <SimpleSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={statusOptions}
          size="sm"
          aria-label="Status"
        />
      </div>
      {/* List / Board / Schedule */}
      {view === "list" ? (
        <ContentList
          cards={visible}
          onOpen={openCard}
          assign={assign}
          loading={isLoading}
          onCreate={onCreate}
          canAdd={!!createBrandId}
          onCommentChange={() =>
            qc.invalidateQueries({ queryKey: boardOptions.queryKey })
          }
        />
      ) : view === "week" ? (
        <WeekView
          rows={scheduleVisible}
          loading={scheduleLoading}
          onOpen={openCard}
          onChanged={invalidateSchedule}
        />
      ) : view === "schedule" ? (
        <ScheduleView
          rows={scheduleVisible}
          loading={scheduleLoading}
          onOpen={openCard}
          onChanged={invalidateSchedule}
        />
      ) : view === "calendar" ? (
        <ContentCalendar
          rows={scheduleVisible}
          onReschedule={onReschedule}
          onOpen={openCard}
        />
      ) : view === "sheet" ? (
        <ContentSheet
          brandId={input.brandId}
          pillar={input.pillar}
          onOpen={openCard}
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="mt-5 flex flex-1 gap-3 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.status}
                status={col.status}
                label={col.label}
                cards={byStatus.get(col.status) ?? []}
                onOpen={openCard}
                loading={isLoading}
                assign={assign}
              />
            ))}
          </div>
          <DragOverlay>
            {activeCard ? <ContentCardBody card={activeCard} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {createBrandId && (
        <ReshuffleDialog
          brandId={createBrandId}
          year={new Date().getFullYear()}
          open={reshuffleOpen}
          onClose={() => setReshuffleOpen(false)}
          onApplied={() => {
            void invalidateSchedule();
            void qc.invalidateQueries({ queryKey: boardOptions.queryKey });
          }}
        />
      )}

      <AddIdeaDrawer
        brands={brands}
        defaultBrandId={createBrandId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: boardOptions.queryKey });
          void invalidateSchedule();
        }}
      />
    </div>
  );
}

type GroupBy = "week" | "status" | "pillar" | "series";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "status", label: "Status" },
  { value: "pillar", label: "Pillar" },
  { value: "series", label: "Series" },
];

const DAY_MS = 86_400_000;
/** Monday of the week containing `iso` (local time, week starts Monday). */
function mondayOf(iso: string): Date {
  const d = new Date(iso);
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}
function weekRange(monday: Date): string {
  const end = new Date(monday.getTime() + 6 * DAY_MS);
  const f = (x: Date) =>
    x.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${f(monday)} – ${f(end)}`;
}

/** The sheet-killer: one scannable line per idea, grouped (by week by default).
 *  No spreadsheet grid — the brief lives on the detail screen; this is triage:
 *  glance the title + hook + pillar + channels, reassign, or add a new idea. */
function ContentList({
  cards,
  onOpen,
  assign,
  loading,
  onCreate,
  canAdd,
  onCommentChange,
}: {
  cards: Card[];
  onOpen: (id: string) => void;
  assign: Assign;
  loading: boolean;
  onCreate: (title: string, plannedAt?: string) => void;
  canAdd: boolean;
  onCommentChange: () => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>("week");

  const groups = useMemo(() => {
    type G = {
      key: string;
      label: string;
      sort: number;
      weekStartISO?: string;
      cards: Card[];
    };
    const map = new Map<string, G>();
    const push = (
      key: string,
      label: string,
      sort: number,
      c: Card,
      weekStartISO?: string,
    ) => {
      const g = map.get(key);
      if (g) g.cards.push(c);
      else map.set(key, { key, label, sort, weekStartISO, cards: [c] });
    };
    for (const c of cards) {
      if (groupBy === "week") {
        if (c.plannedAt) {
          const mon = mondayOf(c.plannedAt);
          push(
            `w${mon.getTime()}`,
            weekRange(mon),
            mon.getTime(),
            c,
            mon.toISOString(),
          );
        } else push("none", "Unscheduled", Number.MAX_SAFE_INTEGER, c);
      } else if (groupBy === "status") {
        push(
          c.status,
          STATUS_LABEL[c.status] ?? c.status,
          STATUS_ORDER.indexOf(c.status),
          c,
        );
      } else if (groupBy === "pillar") {
        const name = c.pillar
          ? (PILLAR_BY_SLUG[c.pillar]?.name ?? c.pillar)
          : "No pillar";
        push(c.pillar ?? "none", name, c.pillar ? 0 : 1, c);
      } else {
        push(
          c.seriesName ?? "none",
          c.seriesName ?? "No series",
          c.seriesName ? 0 : 1,
          c,
        );
      }
    }
    const arr = [...map.values()].sort(
      (a, b) => a.sort - b.sort || a.label.localeCompare(b.label),
    );
    for (const g of arr)
      g.cards.sort((a, b) =>
        (a.plannedAt ?? "").localeCompare(b.plannedAt ?? ""),
      );
    return arr;
  }, [cards, groupBy]);

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          Group by
        </span>
        <div className="border-border flex overflow-hidden rounded-full border">
          {GROUP_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setGroupBy(o.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium transition-colors",
                groupBy === o.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="text-muted-foreground rounded-xl border px-3 py-12 text-center text-sm">
          {loading ? "Loading…" : "No ideas yet"}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.key}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <h3 className="text-sm font-semibold">{g.label}</h3>
              <span className="text-muted-foreground text-xs tabular-nums">
                {g.cards.length}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border">
              {g.cards.map((c) => (
                <ListRow
                  key={c.id}
                  card={c}
                  onOpen={onOpen}
                  assign={assign}
                  onCommentChange={onCommentChange}
                />
              ))}
              {canAdd && groupBy === "week" && (
                <InlineAdd
                  onCreate={(title) => onCreate(title, g.weekStartISO)}
                />
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ListRow({
  card: c,
  onOpen,
  assign,
  onCommentChange,
}: {
  card: Card;
  onOpen: (id: string) => void;
  assign: Assign;
  onCommentChange: () => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const pillar = c.pillar ? PILLAR_BY_SLUG[c.pillar] : null;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  return (
    <div
      className="border-b last:border-b-0"
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(c.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(c.id);
        }}
        className="hover:bg-accent/40 group flex cursor-pointer items-center gap-3 px-3 py-2.5"
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", DOT[c.status])}
          title={STATUS_LABEL[c.status] ?? c.status}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {c.title ?? "Untitled"}
          </div>
          {c.hook && (
            <div className="text-muted-foreground truncate text-xs">
              {c.hook}
            </div>
          )}
        </div>
        {c.seriesName && (
          <span
            className="hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline"
            style={{
              background: `${c.seriesColor ?? "#64748b"}22`,
              color: c.seriesColor ?? "#94a3b8",
            }}
          >
            {c.seriesName}
          </span>
        )}
        <span className="flex w-16 shrink-0 items-center justify-end gap-1">
          {c.platforms.slice(0, 4).map((p) => (
            <ChannelLogo key={p} platform={p} className="size-3.5" />
          ))}
        </span>
        <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
          {c.plannedAt ? fmtDate(c.plannedAt) : "—"}
        </span>
        <span
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <CommentChip
            count={c.commentCount}
            last={c.lastComment}
            active={commentsOpen}
            onToggle={() => setCommentsOpen((o) => !o)}
          />
          {c.assignees.length > 0 && (
            <AvatarStack members={c.assignees} size="sm" />
          )}
          <AssigneeButton
            value={c.owner}
            members={assign.members}
            currentUserId={assign.currentUserId}
            onChange={(ownerId) => assign.onAssign(c.id, ownerId)}
            size="sm"
            label="Assign lead"
          />
        </span>
      </div>
      {commentsOpen && (
        <InlineCommentThread
          contentPostId={c.id}
          currentUserId={assign.currentUserId}
          onOpen={() => onOpen(c.id)}
          onChanged={onCommentChange}
        />
      )}
    </div>
  );
}

/** Comment badge: count + hover preview; click toggles the inline thread. */
function CommentChip({
  count,
  last,
  active,
  onToggle,
}: {
  count: number;
  last: Card["lastComment"];
  active: boolean;
  onToggle: () => void;
}) {
  const btn = (
    <button
      onClick={onToggle}
      aria-label="Comments"
      className={cn(
        "flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-accent text-foreground"
          : count > 0
            ? "text-muted-foreground hover:bg-accent"
            : "text-muted-foreground/30 hover:text-muted-foreground",
      )}
    >
      <MessageSquare className="size-3.5" />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
  if (!last) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{last.author ?? "Someone"}</span>
        <span className="text-muted-foreground block max-w-[220px] truncate text-xs">
          {last.body}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Inline reply thread under a List row — reuses the existing comment procs. */
function InlineCommentThread({
  contentPostId,
  currentUserId,
  onOpen,
  onChanged,
}: {
  contentPostId: string;
  currentUserId: string;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const opts = trpc.content.comments.queryOptions({ contentPostId });
  const { data: comments = [], isLoading } = useQuery(opts);
  const [body, setBody] = useState("");
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: opts.queryKey });
    onChanged();
  };
  const add = useMutation(
    trpc.content.addComment.mutationOptions({
      onSuccess: () => {
        setBody("");
        invalidate();
      },
    }),
  );
  const del = useMutation(
    trpc.content.deleteComment.mutationOptions({ onSuccess: invalidate }),
  );
  const submit = () => {
    const t = body.trim();
    if (t) add.mutate({ contentPostId, body: t });
  };
  return (
    <div className="bg-muted/20 border-t px-3 py-2.5">
      {isLoading ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground mb-2 text-xs">No comments yet.</p>
      ) : (
        <div className="mb-2 flex flex-col gap-2">
          {comments.map((cm) => (
            <div key={cm.id} className="flex items-start gap-2 text-xs">
              <OwnerAvatar member={cm.author} size="sm" />
              <div className="min-w-0 flex-1">
                <span className="font-medium">
                  {cm.author?.name ?? "Someone"}
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {new Date(cm.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <p className="text-foreground/90 whitespace-pre-wrap">
                  {cm.body}
                </p>
              </div>
              {cm.authorId === currentUserId && (
                <button
                  onClick={() => del.mutate({ id: cm.id })}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Delete comment"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Reply…"
          className="bg-background focus:ring-ring/40 flex-1 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
        />
        <button
          onClick={submit}
          disabled={!body.trim() || add.isPending}
          className="bg-foreground text-background rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50"
        >
          Send
        </button>
        <button
          onClick={onOpen}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          Open ↗
        </button>
      </div>
    </div>
  );
}

/** Inline capture at the bottom of a week group — Enter to add, Esc to cancel. */
function InlineAdd({ onCreate }: { onCreate: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const submit = () => {
    const t = value.trim();
    if (t) onCreate(t);
    setValue("");
    setOpen(false);
  };
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:bg-accent/40 hover:text-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
      >
        <span className="text-base leading-none">+</span> Add idea
      </button>
    );
  }
  return (
    <div className="px-3 py-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        onBlur={submit}
        placeholder="New idea…"
        className="bg-background focus:ring-ring/40 w-full rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
      />
    </div>
  );
}

// ---- Schedule view (date-first manual posting worklist) -------------------

type SchedRow = RouterOutputs["content"]["schedule"][number];
const schedDayKey = (d: Date) =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Tactical week lens — one Mon–Sun week, all 7 days shown (gaps included) so
 *  the team sees the week's shape at a glance: what ships when, where the holes
 *  are. Prev/next/This-week navigation; rows reuse the Schedule worklist row
 *  (expand → copyable brief + assets + mark-done). */
function WeekView({
  rows,
  loading,
  onOpen,
  onChanged,
}: {
  rows: SchedRow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const [offset, setOffset] = useState(0); // weeks from the current week

  const { days, label, total } = useMemo(() => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return { key: schedDayKey(date), date, rows: [] as SchedRow[] };
    });
    const byKey = new Map(days.map((d) => [d.key, d]));
    let total = 0;
    for (const r of rows) {
      if (!r.at) continue;
      const d = new Date(r.at);
      const day = byKey.get(
        schedDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate())),
      );
      if (day) {
        day.rows.push(r);
        total++;
      }
    }
    const end = days[6]!.date;
    const f = (x: Date) =>
      x.toLocaleDateString([], { month: "short", day: "numeric" });
    return { days, label: `${f(monday)} – ${f(end)}`, total };
  }, [rows, offset]);

  const todayKey = schedDayKey(new Date());
  const navBtn =
    "border-border text-muted-foreground hover:bg-accent rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40";

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setOffset((o) => o - 1)}
          className={navBtn}
          aria-label="Previous week"
        >
          ←
        </button>
        <button
          onClick={() => setOffset(0)}
          disabled={offset === 0}
          className={navBtn}
        >
          This week
        </button>
        <button
          onClick={() => setOffset((o) => o + 1)}
          className={navBtn}
          aria-label="Next week"
        >
          →
        </button>
        <span className="ml-1 text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {total} {total === 1 ? "post" : "posts"}
          {loading ? " · loading…" : ""}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {days.map((d) => {
          const isToday = d.key === todayKey;
          return (
            <section key={d.key}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <h3 className="text-sm font-semibold">
                  {d.date.toLocaleDateString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                {isToday && (
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                    Today
                  </span>
                )}
                {d.rows.length > 0 && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {d.rows.length}
                  </span>
                )}
              </div>
              {d.rows.length === 0 ? (
                <div className="text-muted-foreground/60 px-1 pb-1 text-xs">
                  Nothing planned
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {d.rows.map((r) => (
                    <ScheduleRow
                      key={r.id}
                      row={r}
                      onOpen={onOpen}
                      onChanged={onChanged}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Spot-level agenda grouped by ship day — what the team posts, per channel,
 *  per day. Each row expands to the copyable caption + assets + mark-done. */
function ScheduleView({
  rows,
  loading,
  onOpen,
  onChanged,
}: {
  rows: SchedRow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  // Past days are posted-and-done; default to hiding them so the worklist opens
  // on today + upcoming rather than a wall of completed items.
  const [showPast, setShowPast] = useState(false);

  const { days, undated } = useMemo(() => {
    const map = new Map<
      string,
      { key: string; date: Date; rows: SchedRow[] }
    >();
    const undated: SchedRow[] = [];
    for (const r of rows) {
      if (!r.at) {
        undated.push(r);
        continue;
      }
      const d = new Date(r.at);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const k = schedDayKey(day);
      const g = map.get(k);
      if (g) g.rows.push(r);
      else map.set(k, { key: k, date: day, rows: [r] });
    }
    const days = [...map.values()].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    return { days, undated };
  }, [rows]);

  if (!loading && rows.length === 0) {
    return (
      <div className="text-muted-foreground mt-5 rounded-xl border px-3 py-12 text-center text-sm">
        Nothing scheduled
      </div>
    );
  }

  const now = new Date();
  const todayK = schedDayKey(now);
  const todayTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const pastDays = days.filter((g) => g.date.getTime() < todayTime);
  const shownDays = showPast
    ? days
    : days.filter((g) => g.date.getTime() >= todayTime);

  return (
    <div className="mt-5 flex flex-col gap-4">
      {loading && rows.length === 0 && (
        <div className="text-muted-foreground text-sm">Loading…</div>
      )}
      {pastDays.length > 0 && (
        <div className="flex">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="border-border text-muted-foreground hover:bg-accent rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          >
            {showPast
              ? "Hide past"
              : `Show ${pastDays.length} earlier ${pastDays.length === 1 ? "day" : "days"}`}
          </button>
        </div>
      )}
      {shownDays.length === 0 && undated.length === 0 && (
        <div className="text-muted-foreground rounded-xl border px-3 py-12 text-center text-sm">
          Nothing upcoming
        </div>
      )}
      {shownDays.map((g) => {
        const isToday = g.key === todayK;
        const isPast = g.date.getTime() < todayTime;
        return (
          <section key={g.key}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <h3
                className={cn(
                  "text-sm font-semibold",
                  isPast && "text-muted-foreground",
                )}
              >
                {g.date.toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </h3>
              {isToday && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  Today
                </span>
              )}
              <span className="text-muted-foreground text-xs tabular-nums">
                {g.rows.length}
              </span>
            </div>
            <div className={cn("flex flex-col gap-2", isPast && "opacity-60")}>
              {g.rows.map((r) => (
                <ScheduleRow
                  key={r.id}
                  row={r}
                  onOpen={onOpen}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </section>
        );
      })}
      {undated.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <h3 className="text-muted-foreground text-sm font-semibold">
              No date yet
            </h3>
            <span className="text-muted-foreground text-xs tabular-nums">
              {undated.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {undated.map((r) => (
              <ScheduleRow
                key={r.id}
                row={r}
                onOpen={onOpen}
                onChanged={onChanged}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ScheduleRow({
  row,
  onOpen,
  onChanged,
}: {
  row: SchedRow;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const setStatus = useMutation(
    trpc.content.setSpotStatus.mutationOptions({ onSettled: onChanged }),
  );
  const done = row.status === "published";
  const time = row.at
    ? new Date(row.at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const copyText = [row.hook, row.caption, row.cta]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="bg-card rounded-xl border">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <ChannelLogo platform={row.platform} className="size-5 shrink-0" />
        <button
          onClick={() => setOpen((o) => !o)}
          className="min-w-0 flex-1 text-left"
        >
          <div
            className={cn(
              "truncate text-sm font-medium",
              done && "text-muted-foreground",
            )}
          >
            {row.title ?? "Untitled"}
          </div>
          {row.hook && (
            <div className="text-muted-foreground truncate text-xs">
              {row.hook}
            </div>
          )}
        </button>
        {time && (
          <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline">
            {time}
          </span>
        )}
        <span className={cn("size-2 shrink-0 rounded-full", DOT[row.status])} />
        {row.owner && <OwnerAvatar member={row.owner} size="sm" />}
        <button
          onClick={() =>
            setStatus.mutate({
              platformPostId: row.id,
              status: done ? "scheduled" : "published",
            })
          }
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
            done
              ? "border-emerald-500/40 text-emerald-400"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {done ? "✓ Done" : "Mark done"}
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t px-3 py-2.5">
          {copyText && (
            <div className="flex items-start gap-2">
              <p className="text-muted-foreground min-w-0 flex-1 text-sm whitespace-pre-wrap">
                {copyText}
              </p>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(copyText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="border-border hover:bg-accent shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {row.mediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.mediaUrl}
                alt=""
                className="size-10 rounded-md border object-cover"
              />
            )}
            {(row.assetLinks ?? []).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border text-muted-foreground hover:text-foreground hover:bg-accent rounded-md border px-1.5 py-0.5 transition-colors"
              >
                ↗ Asset{(row.assetLinks?.length ?? 0) > 1 ? ` ${i + 1}` : ""}
              </a>
            ))}
            {row.externalUrl && (
              <a
                href={row.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground underline"
              >
                Open ↗
              </a>
            )}
            {row.contentPostId && (
              <button
                onClick={() => onOpen(row.contentPostId!)}
                className="text-muted-foreground hover:text-foreground ml-auto underline"
              >
                Open idea →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Column({
  status,
  label,
  cards,
  onOpen,
  loading,
  assign,
}: {
  status: string;
  label: string;
  cards: Card[];
  onOpen: (id: string) => void;
  loading: boolean;
  assign: Assign;
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
          <DraggableCard key={c.id} card={c} onOpen={onOpen} assign={assign} />
        ))}
        {cards.length === 0 && (
          <div className="text-muted-foreground px-1 py-6 text-center text-xs">
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
  assign,
}: {
  card: Card;
  onOpen: (id: string) => void;
  assign: Assign;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });
  // Hover + Space self-toggles the idea owner (Trello-style).
  const hover = useSelfAssignHotkey({
    ownerId: card.owner?.id ?? null,
    currentUserId: assign.currentUserId,
    onChange: (ownerId) => assign.onAssign(card.id, ownerId),
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      {...hover}
      onClick={() => onOpen(card.id)}
      className={cn("cursor-grab touch-none", isDragging && "opacity-40")}
    >
      <ContentCardBody card={card} assign={assign} />
    </div>
  );
}

function ContentCardBody({
  card,
  dragging,
  assign,
}: {
  card: Card;
  dragging?: boolean;
  assign?: Assign;
}) {
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
          {card.spotOwners.length > 0 && (
            <AvatarStack members={card.spotOwners} size="sm" />
          )}
          {card.platforms.slice(0, 4).map((p) => (
            <span key={p} title={platformLabel(p)}>
              <ChannelLogo platform={p} className="size-3.5" />
            </span>
          ))}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        {(card.postCount > 0 || reach) && (
          <div className="text-muted-foreground flex items-center gap-2 text-[11px] tabular-nums">
            <span>
              {card.postCount} post{card.postCount === 1 ? "" : "s"}
            </span>
            {reach && <span>· {reach}</span>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {assign && (
            <MultiAssigneeButton
              value={card.assignees}
              members={assign.members}
              currentUserId={assign.currentUserId}
              onChange={(userIds) => assign.onSetAssignees(card.id, userIds)}
              size="sm"
            />
          )}
          {assign ? (
            <AssigneeButton
              value={card.owner}
              members={assign.members}
              currentUserId={assign.currentUserId}
              onChange={(ownerId) => assign.onAssign(card.id, ownerId)}
              size="md"
              label="Assign lead"
            />
          ) : (
            <OwnerAvatar member={card.owner} size="md" />
          )}
        </div>
      </div>
    </div>
  );
}
