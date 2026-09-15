"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Home, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import type { HomesRun, HomesRunStep } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

/** Six is a Meta carousel that still gives each card room to be seen. */
const DEFAULT_PICK = 6;

/**
 * Build a static and a carousel from the client's own homes.
 *
 * The operator picks the homes from the site's own feed, watches each card
 * render, and reads what the art director changed. Everything it makes is a
 * draft: rendered cards in the media library and ad rows on this campaign,
 * with the push still deciding what runs.
 */
export function DraftFromHomesButton({
  campaignId,
  brandId,
  lastRun,
  variant = "outline",
  label,
}: {
  campaignId: string;
  brandId: string;
  /** The stored run, so the dialog can open on the result of the last one. */
  lastRun: HomesRun | null;
  variant?: "outline" | "default";
  label?: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [watching, setWatching] = useState(false);

  const samples = useQuery({
    ...trpc.media.listingSamples.queryOptions({ brandId }),
    enabled: open,
  });
  const homes = samples.data?.homes ?? [];
  // First open: the top homes are ticked, the way the run used to choose.
  const selection =
    picked ?? new Set(homes.slice(0, DEFAULT_PICK).map((home) => home.url));

  const run = useQuery({
    ...trpc.ads.homesRun.queryOptions({ campaignId }),
    enabled: watching,
    refetchInterval: watching ? 2500 : false,
    initialData: lastRun ?? undefined,
  });
  const live = watching ? (run.data ?? lastRun) : lastRun;

  const draft = useMutation(
    trpc.ads.draftAdsFromHomes.mutationOptions({
      onMutate: () => setWatching(true),
      onSuccess: (result) => {
        toast.success(
          `Drafted ${result.adIds.length} ad${result.adIds.length === 1 ? "" : "s"} from ${result.homesUsed.length} home${result.homesUsed.length === 1 ? "" : "s"}`,
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
      onSettled: () => {
        void run.refetch();
        setWatching(false);
      },
    }),
  );

  // A run that is still writing (page reloaded mid-run) keeps being watched.
  useEffect(() => {
    if (lastRun?.status === "running") setWatching(true);
  }, [lastRun?.status]);

  const toggle = (url: string) =>
    setPicked((current) => {
      const next = new Set(current ?? selection);
      if (next.has(url)) next.delete(url);
      else if (next.size < 10) next.add(url);
      return next;
    });

  const showRun = draft.isPending || live?.status === "running";
  const pickedUrls = homes
    .filter((home) => selection.has(home.url))
    .map((home) => home.url);

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" />
        {label ?? "Draft ads from their homes"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && draft.isPending) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ads from their homes</DialogTitle>
            <DialogDescription>
              One card per home from its hero photo, judged by the art director,
              then one static ad and one carousel. Drafts only; nothing reaches
              a platform until you push.
            </DialogDescription>
          </DialogHeader>

          {showRun && live ? (
            <RunProgress run={live} />
          ) : samples.isLoading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reading their listings
            </div>
          ) : samples.error ? (
            <p className="text-xs text-red-300">{samples.error.message}</p>
          ) : !samples.data?.hasSite ? (
            <p className="text-sm text-muted-foreground">
              This brand has no website on record, so there are no homes to
              read.
            </p>
          ) : homes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No listings with photos on their site. Check the website is a
              WanderOS site.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {homes.map((home) => {
                  const on = selection.has(home.url);
                  const previous = lastRun?.steps.find(
                    (step) => step.url === home.url,
                  );
                  return (
                    <button
                      key={home.id}
                      type="button"
                      onClick={() => toggle(home.url)}
                      aria-pressed={on}
                      className={cn(
                        "group relative overflow-hidden rounded-lg border text-left transition",
                        on
                          ? "ring-2 ring-primary"
                          : "opacity-80 hover:opacity-100",
                      )}
                      title={home.name}
                    >
                      {/* oxlint-disable-next-line nextjs/no-img-element */}
                      <img
                        src={home.thumbUrl}
                        alt={home.name}
                        className="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                      />
                      <div className="space-y-0.5 p-2">
                        <div className="truncate text-xs font-medium">
                          {home.name}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {previous?.assetId ? "Has a card" : home.place}
                        </div>
                      </div>
                      {on ? (
                        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {lastRun && lastRun.status !== "running" ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Last run · {new Date(lastRun.startedAt).toLocaleString()} ·{" "}
                    {lastRun.steps.filter((step) => step.assetId).length} cards
                  </summary>
                  <div className="mt-2">
                    <RunProgress run={lastRun} />
                  </div>
                </details>
              ) : null}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {showRun
                ? "Rendering. You can close this; the run keeps going."
                : `${selection.size} of ${homes.length} homes · up to 10`}
            </span>
            <div className="flex items-center gap-2">
              {showRun ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={pickedUrls.length === 0 || draft.isPending}
                  onClick={() =>
                    draft.mutate({ campaignId, listingUrls: pickedUrls })
                  }
                >
                  <Sparkles className="size-3.5" />
                  Draft {pickedUrls.length} card
                  {pickedUrls.length === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const STEP_LABEL: Record<HomesRunStep["status"], string> = {
  pending: "Waiting",
  rendering: "Rendering",
  done: "Done",
  reused: "Reused",
  failed: "Failed",
};

/** The run as it stands: one row per home, the director's note beside it. */
function RunProgress({ run }: { run: HomesRun }) {
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {run.steps.map((step) => (
          <li key={step.url} className="flex items-start gap-3 px-3 py-2">
            <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {step.cardUrl ? (
                // oxlint-disable-next-line nextjs/no-img-element
                <img
                  src={step.cardUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {step.name}
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    step.status === "failed"
                      ? "bg-red-500/15 text-red-300"
                      : step.status === "rendering"
                        ? "bg-sky-500/15 text-sky-300"
                        : step.status === "pending"
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-500/15 text-emerald-300",
                  )}
                >
                  {step.status === "rendering" ? (
                    <Loader2 className="mr-1 inline size-3 animate-spin" />
                  ) : step.status === "failed" ? (
                    <X className="mr-1 inline size-3" />
                  ) : step.status === "pending" ? null : (
                    <Check className="mr-1 inline size-3" />
                  )}
                  {STEP_LABEL[step.status]}
                </span>
              </div>
              {step.changes && step.changes.length > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Art director: {step.changes.join("; ")}.
                </p>
              ) : step.note ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.note}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {run.error ? <p className="text-xs text-red-300">{run.error}</p> : null}
      {run.status !== "running" && run.notes.length > 0 ? (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {run.notes
            .filter(
              (note) =>
                !run.steps.some((step) => note.startsWith(`${step.name}:`)),
            )
            .map((note) => (
              <li key={note}>{note}</li>
            ))}
        </ul>
      ) : null}
      {run.status === "running" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Home className="size-3.5" />
          Each card is an import, a render and a look from the art director. A
          minute or two for six homes.
        </p>
      ) : null}
    </div>
  );
}
