"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  LockOpen,
  RotateCcw,
} from "lucide-react";

import { AdMock, type AdMockSurface } from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

type CellState = "rendered" | "overridden" | "frozen";

export type MatrixCell = {
  key: string;
  label: string;
  shortLabel: string;
  surface: AdMockSurface;
  state: CellState;
  fitIssues: string[];
  frozenAt: string | null;
  copy: { headline: string; body: string; callToAction: string | null };
  cards: { url: string; thumbnail: string | null; type: string }[];
};

export type MatrixAd = {
  id: string;
  name: string;
  format: string;
  base: { headline: string; body: string; callToAction: string | null };
  coverage: {
    total: number;
    frozen: number;
    overridden: number;
    rendered: number;
    unfit: number;
  };
  cells: MatrixCell[];
};

export type MatrixHome = { key: string; name: string; ads: MatrixAd[] };

const STATE_CHIP: Record<CellState, string> = {
  rendered: "text-muted-foreground",
  overridden: "text-sky-400",
  frozen: "text-emerald-400",
};

/** The crop each placement shows, so a cell reads at the shape it will run. */
export function PlacementMatrix({
  homes,
  brandName,
  brandLogo,
}: {
  homes: MatrixHome[];
  brandName: string;
  brandLogo: string | null;
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(homes.slice(0, 1).map((home) => home.key)),
  );
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      {homes.map((home) => {
        const isOpen = open.has(home.key);
        const frozen = home.ads.reduce(
          (sum, ad) => sum + ad.coverage.frozen,
          0,
        );
        const total = home.ads.reduce((sum, ad) => sum + ad.coverage.total, 0);
        const unfit = home.ads.reduce((sum, ad) => sum + ad.coverage.unfit, 0);
        return (
          <div key={home.key} className="overflow-hidden rounded-2xl border">
            <button
              type="button"
              onClick={() => toggle(home.key)}
              className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left"
            >
              {isOpen ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate text-sm font-medium">
                {home.name}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {home.ads.length} ad{home.ads.length === 1 ? "" : "s"}
              </span>
              <span
                className={cn(
                  "text-[11px]",
                  frozen === total && total > 0
                    ? "text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {frozen}/{total} frozen
              </span>
              {unfit > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                  <AlertTriangle className="size-3" />
                  {unfit}
                </span>
              ) : null}
            </button>
            {isOpen ? (
              <div className="space-y-5 border-t px-4 py-4">
                {home.ads.map((ad) => (
                  <AdRow
                    key={ad.id}
                    ad={ad}
                    brandName={brandName}
                    brandLogo={brandLogo}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AdRow({
  ad,
  brandName,
  brandLogo,
}: {
  ad: MatrixAd;
  brandName: string;
  brandLogo: string | null;
}) {
  const [editingBase, setEditingBase] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-medium">{ad.name}</span>
        <span className="text-[10.5px] text-muted-foreground uppercase">
          {ad.format}
        </span>
        <button
          type="button"
          onClick={() => setEditingBase((v) => !v)}
          className="text-[11px] text-sky-300 hover:underline"
        >
          {editingBase ? "Close" : "Edit base copy"}
        </button>
      </div>
      {editingBase ? (
        <BaseCopyEditor ad={ad} onClose={() => setEditingBase(false)} />
      ) : null}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-3">
        {ad.cells.map((cell) => (
          <CellCard
            key={cell.key}
            adId={ad.id}
            cell={cell}
            brandName={brandName}
            brandLogo={brandLogo}
          />
        ))}
      </div>
    </div>
  );
}

function BaseCopyEditor({
  ad,
  onClose,
}: {
  ad: MatrixAd;
  onClose: () => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [headline, setHeadline] = useState(ad.base.headline);
  const [body, setBody] = useState(ad.base.body);
  const save = useMutation(
    trpc.ads.setAdCopy.mutationOptions({
      onSuccess: () => {
        toast.success("Base copy updated. Rendered cells follow it.");
        onClose();
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <Input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="Headline"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Body"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() => save.mutate({ adId: ad.id, headline, body })}
        >
          {save.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            "Save for all placements"
          )}
        </Button>
        <span className="text-[10.5px] text-muted-foreground">
          Overridden and frozen cells keep their own copy.
        </span>
      </div>
    </div>
  );
}

function CellCard({
  adId,
  cell,
  brandName,
  brandLogo,
}: {
  adId: string;
  cell: MatrixCell;
  brandName: string;
  brandLogo: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [editing, setEditing] = useState(false);
  const [card, setCard] = useState(0);
  const [headline, setHeadline] = useState(cell.copy.headline);
  const [body, setBody] = useState(cell.copy.body);

  const refresh = () => router.refresh();
  const onError = (error: { message: string }) => toast.error(error.message);

  const overrideCopy = useMutation(
    trpc.ads.setPlacementCopy.mutationOptions({
      onSuccess: () => {
        toast.success(`${cell.shortLabel} copy overridden.`);
        setEditing(false);
        refresh();
      },
      onError,
    }),
  );
  const reset = useMutation(
    trpc.ads.clearPlacement.mutationOptions({ onSuccess: refresh, onError }),
  );
  const freeze = useMutation(
    trpc.ads.freezePlacement.mutationOptions({
      onSuccess: () => {
        toast.success(`${cell.shortLabel} frozen.`);
        refresh();
      },
      onError,
    }),
  );
  const unfreeze = useMutation(
    trpc.ads.unfreezePlacement.mutationOptions({ onSuccess: refresh, onError }),
  );

  const busy =
    overrideCopy.isPending ||
    reset.isPending ||
    freeze.isPending ||
    unfreeze.isPending;
  const frozen = cell.state === "frozen";

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium">{cell.label}</span>
        <span className={cn("text-[10.5px]", STATE_CHIP[cell.state])}>
          {cell.state}
        </span>
      </div>
      <AdMock
        surface={cell.surface}
        brandName={brandName}
        brandLogo={brandLogo}
        body={cell.copy.body}
        headline={cell.copy.headline}
        link={null}
        callToAction={cell.copy.callToAction}
        media={cell.cards}
        card={card}
        onCard={setCard}
        className="w-full"
      />
      {cell.fitIssues.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {cell.fitIssues.map((issue) => (
            <span
              key={issue}
              className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400"
            >
              <AlertTriangle className="size-2.5" />
              {issue}
            </span>
          ))}
        </div>
      ) : null}
      {editing ? (
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Headline for this placement"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Body for this placement"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={overrideCopy.isPending}
              onClick={() =>
                overrideCopy.mutate({
                  adId,
                  placementKey: cell.key,
                  patch: { headline, body },
                  via: "manual",
                })
              }
            >
              {overrideCopy.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Save this placement"
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {!frozen ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className="text-sky-300 hover:underline"
            >
              Override copy
            </button>
          ) : null}
          {cell.state !== "rendered" && !frozen ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => reset.mutate({ adId, placementKey: cell.key })}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" /> Reset
            </button>
          ) : null}
          {frozen ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => unfreeze.mutate({ adId, placementKey: cell.key })}
              className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
            >
              <LockOpen className="size-3" /> Unfreeze
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => freeze.mutate({ adId, placementKey: cell.key })}
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              {freeze.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Lock className="size-3" />
              )}
              Freeze
            </button>
          )}
        </div>
      )}
    </div>
  );
}
