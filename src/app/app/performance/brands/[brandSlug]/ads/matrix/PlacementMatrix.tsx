"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RotateCcw,
  Trash2,
  Type,
} from "lucide-react";

import { AdMock, type AdMockSurface } from "@/components/ad-mock";
import type { SocialMockCrop } from "@/components/social-mock";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import type { MediaItem } from "@/server/db/content-schema";
import { Button } from "@/components/ui/button";
import { DeleteAlert } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

type CellState = "rendered" | "overridden" | "frozen";

export type MatrixCell = {
  key: string;
  label: string;
  shortLabel: string;
  surface: AdMockSurface;
  crop: SocialMockCrop;
  state: CellState;
  fitIssues: string[];
  frozenAt: string | null;
  copy: { headline: string; body: string; callToAction: string | null };
  cards: { url: string; thumbnail: string | null; type: string }[];
};

export type MatrixSourceCard = {
  assetId: string | null;
  thumbnail: string | null;
  url: string;
  type: string;
  /** The line this card draws on the image, editable when it is a composition. */
  title: string;
  composed: boolean;
};

export type MatrixAd = {
  id: string;
  name: string;
  format: string;
  status: "drawn" | "approved";
  base: { headline: string; body: string; callToAction: string | null };
  photoOnly: boolean;
  coverage: {
    total: number;
    frozen: number;
    overridden: number;
    rendered: number;
    unfit: number;
  };
  /** The source photos behind the compositions, for swapping a card. */
  sourceCards: MatrixSourceCard[];
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
  brandId,
  brandName,
  brandLogo,
  focusKey,
}: {
  homes: MatrixHome[];
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  /** A home to open and scroll to on arrival, from a per-home link. */
  focusKey?: string | null;
}) {
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        [focusKey, ...homes.slice(0, 1).map((home) => home.key)].filter(
          (key): key is string => Boolean(key),
        ),
      ),
  );

  // A per-home link lands here focused on one home; open it and bring it into
  // view. Only fires when that home is actually in the drafted set.
  useEffect(() => {
    if (!focusKey) return;
    document
      .getElementById(`home-${focusKey}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusKey]);
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
          <div
            key={home.key}
            id={`home-${home.key}`}
            className="scroll-mt-24 overflow-hidden rounded-2xl border"
          >
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
                    brandId={brandId}
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
  brandId,
  brandName,
  brandLogo,
}: {
  ad: MatrixAd;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
}) {
  const router = useRouter();
  const [editingBase, setEditingBase] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Which card the library picker fills: an index to swap, or "append".
  const [picking, setPicking] = useState<number | "append" | null>(null);
  // Which card's on-image line is being edited, and the working text.
  const [editingText, setEditingText] = useState<number | null>(null);
  const [text, setText] = useState("");
  const refresh = () => router.refresh();
  const onError = (error: { message: string }) => toast.error(error.message);

  const photoOnly = useMutation(
    orpc.ads.setAdPhotoOnly.mutationOptions({ onSuccess: refresh, onError }),
  );
  const approve = useMutation(
    orpc.ads.setAdStatus.mutationOptions({ onSuccess: refresh, onError }),
  );
  const remove = useMutation(
    orpc.ads.deleteAd.mutationOptions({
      onSuccess: () => {
        toast.success("Ad deleted.");
        refresh();
      },
      onError,
    }),
  );
  const editCards = useMutation(
    orpc.ads.editAdCards.mutationOptions({ onSuccess: refresh, onError }),
  );
  const cardCopy = useMutation(
    orpc.ads.setCardCopy.mutationOptions({
      onSuccess: () => {
        setEditingText(null);
        refresh();
      },
      onError,
    }),
  );

  const approved = ad.status === "approved";
  // Statics and videos hold one card; every other shape is a carousel.
  const multi = !/^(static|video)$/i.test(ad.format);
  const picked = (item: MediaItem) => {
    const assetId = item.assetId ?? null;
    const slot = picking;
    setPicking(null);
    if (!assetId) {
      toast.error("Pick something that is in the library");
      return;
    }
    editCards.mutate({
      adId: ad.id,
      edit:
        slot === "append" || slot === null
          ? { op: "append", mediaAssetId: assetId }
          : { op: "replace", index: slot, mediaAssetId: assetId },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
        <button
          type="button"
          disabled={photoOnly.isPending}
          onClick={() =>
            photoOnly.mutate({ adId: ad.id, photoOnly: !ad.photoOnly })
          }
          title="Drop the composition and show the bare photos"
          className={cn(
            "inline-flex items-center gap-1 text-[11px] hover:underline",
            ad.photoOnly ? "text-amber-400" : "text-muted-foreground",
          )}
        >
          {photoOnly.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ImageOff className="size-3" />
          )}
          Photo only
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate({
                adId: ad.id,
                status: approved ? "drawn" : "approved",
              })
            }
            title={
              approved
                ? "Approved. A rebuild leaves this one alone."
                : "Approve. Keeps it through the next rebuild, and it can go to a campaign."
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
              approved
                ? "border-emerald-500/40 text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {approve.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            {approved ? "Approved" : "Approve"}
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete this ad"
            title="Delete this ad"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            {remove.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* The source photos behind the compositions: swap one, drop one, add one. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ad.sourceCards.map((card, index) => (
          <div key={`${ad.id}-${index}`} className="group relative">
            <button
              type="button"
              onClick={() => setPicking(index)}
              disabled={editCards.isPending}
              title={`Swap card ${index + 1}`}
              className="relative block size-12 overflow-hidden rounded-md border bg-muted hover:border-sky-400"
            >
              {card.thumbnail || card.type !== "video" ? (
                <Image
                  src={card.thumbnail ?? card.url}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized
                />
              ) : null}
            </button>
            {card.composed ? (
              <button
                type="button"
                onClick={() => {
                  setEditingText(index);
                  setText(card.title);
                }}
                aria-label={`Edit the line on card ${index + 1}`}
                title="Edit the line drawn on this card"
                className={cn(
                  "absolute -bottom-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground shadow hover:text-sky-400",
                  editingText === index
                    ? "flex text-sky-400"
                    : "hidden group-hover:flex",
                )}
              >
                <Type className="size-2.5" />
              </button>
            ) : null}
            {ad.sourceCards.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  editCards.mutate({
                    adId: ad.id,
                    edit: { op: "remove", index },
                  })
                }
                disabled={editCards.isPending}
                aria-label={`Remove card ${index + 1}`}
                className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-background text-muted-foreground shadow group-hover:flex hover:text-destructive"
              >
                <Trash2 className="size-2.5" />
              </button>
            ) : null}
            {/* Reorder within the carousel; a static holds one card. */}
            {multi && index > 0 ? (
              <button
                type="button"
                onClick={() =>
                  editCards.mutate({
                    adId: ad.id,
                    edit: { op: "move", index, to: index - 1 },
                  })
                }
                disabled={editCards.isPending}
                aria-label={`Move card ${index + 1} earlier`}
                title="Move earlier"
                className="absolute top-1/2 -left-1.5 hidden size-4 -translate-y-1/2 items-center justify-center rounded-full bg-background text-muted-foreground shadow group-hover:flex hover:text-sky-400"
              >
                <ChevronLeft className="size-2.5" />
              </button>
            ) : null}
            {multi && index < ad.sourceCards.length - 1 ? (
              <button
                type="button"
                onClick={() =>
                  editCards.mutate({
                    adId: ad.id,
                    edit: { op: "move", index, to: index + 1 },
                  })
                }
                disabled={editCards.isPending}
                aria-label={`Move card ${index + 1} later`}
                title="Move later"
                className="absolute top-1/2 -right-1.5 hidden size-4 -translate-y-1/2 items-center justify-center rounded-full bg-background text-muted-foreground shadow group-hover:flex hover:text-sky-400"
              >
                <ChevronRight className="size-2.5" />
              </button>
            ) : null}
          </div>
        ))}
        {multi && ad.sourceCards.length < 10 ? (
          <button
            type="button"
            onClick={() => setPicking("append")}
            disabled={editCards.isPending}
            title="Add a card from the library"
            className="flex size-12 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:border-sky-400 hover:text-foreground"
          >
            {editCards.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </button>
        ) : null}
      </div>

      {editingText !== null ? (
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
          <div className="text-[10.5px] text-muted-foreground">
            The line drawn on card {editingText + 1}, in every placement.
          </div>
          <Input
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                cardCopy.mutate({
                  adId: ad.id,
                  index: editingText,
                  title: text,
                });
              if (e.key === "Escape") setEditingText(null);
            }}
            placeholder="Text on the card (blank clears it)"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={cardCopy.isPending}
              onClick={() =>
                cardCopy.mutate({
                  adId: ad.id,
                  index: editingText,
                  title: text,
                })
              }
            >
              {cardCopy.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Save the card"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingText(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
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

      {picking !== null ? (
        <MediaPickerDialog
          brandId={brandId}
          open
          onOpenChange={(next) => !next && setPicking(null)}
          existingAssetIds={ad.sourceCards.flatMap((card) =>
            card.assetId ? [card.assetId] : [],
          )}
          onPick={picked}
        />
      ) : null}
      <DeleteAlert
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onConfirm={() => {
          setConfirmingDelete(false);
          remove.mutate({ adId: ad.id });
        }}
        title="Delete this ad?"
        description="This removes the drafted ad. You can rebuild the set or add it again."
        isLoading={remove.isPending}
      />
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
  const [headline, setHeadline] = useState(ad.base.headline);
  const [body, setBody] = useState(ad.base.body);
  const save = useMutation(
    orpc.ads.setAdCopy.mutationOptions({
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
  const [editing, setEditing] = useState(false);
  const [card, setCard] = useState(0);
  const [headline, setHeadline] = useState(cell.copy.headline);
  const [body, setBody] = useState(cell.copy.body);

  const refresh = () => router.refresh();
  const onError = (error: { message: string }) => toast.error(error.message);

  const overrideCopy = useMutation(
    orpc.ads.setPlacementCopy.mutationOptions({
      onSuccess: () => {
        toast.success(`${cell.shortLabel} copy overridden.`);
        setEditing(false);
        refresh();
      },
      onError,
    }),
  );
  const reset = useMutation(
    orpc.ads.clearPlacement.mutationOptions({ onSuccess: refresh, onError }),
  );
  const freeze = useMutation(
    orpc.ads.freezePlacement.mutationOptions({
      onSuccess: () => {
        toast.success(`${cell.shortLabel} frozen.`);
        refresh();
      },
      onError,
    }),
  );
  const unfreeze = useMutation(
    orpc.ads.unfreezePlacement.mutationOptions({ onSuccess: refresh, onError }),
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
        crop={cell.crop}
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
                  headline,
                  body,
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
