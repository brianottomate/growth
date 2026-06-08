"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Film, FolderOpen, ImageIcon, Rocket } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { BlueprintReview, type Blueprint } from "../launch/BlueprintReview";

/**
 * What we hand the launch flow. Any media item (uploaded asset OR a hard-coded
 * Drive link) collapses to this: a title, a link to open, and — only when we
 * actually host a fetchable image — an `imageUrl` we let the model see. Drive
 * folders / videos are referenced by link, never pulled.
 */
export type LaunchTarget = {
  title: string;
  href: string | null;
  imageUrl?: string | null;
  kind: string;
  sourceProvider?: string | null;
};

const GOALS = ["supply", "fundraise", "awareness", "recruiting"] as const;
const SCALES: { value: "single" | "arc"; label: string; hint: string }[] = [
  { value: "single", label: "Single push", hint: "one piece, a few channels" },
  { value: "arc", label: "Full arc", hint: "multi-day teaser → recap" },
];

function Pill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function LaunchMediaDrawer({
  brandId,
  target,
  onClose,
}: {
  brandId: string;
  target: LaunchTarget | null;
  onClose: () => void;
}) {
  const trpc = useTRPC();

  const [prompt, setPrompt] = useState("");
  const [goal, setGoal] = useState<string | null>(null);
  const [scale, setScale] = useState<"single" | "arc" | null>(null);
  const [launchDate, setLaunchDate] = useState("");

  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [removedSlots, setRemovedSlots] = useState<Set<number>>(new Set());
  const [removedAmps, setRemovedAmps] = useState<Set<number>>(new Set());

  const generate = useMutation(
    trpc.moment.generate.mutationOptions({
      onSuccess: (bp) => {
        setBlueprint(bp);
        setRemovedSlots(new Set());
        setRemovedAmps(new Set());
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const commit = useMutation(
    trpc.moment.commit.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );

  const toggle = (set: Set<number>, i: number, fn: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    fn(next);
  };

  const isCampaign = blueprint?.verdict === "campaign";
  const canCommit =
    blueprint && !isCampaign && launchDate && !commit.isPending;

  // Reset everything when the drawer target changes (or closes).
  const open = target !== null;
  const reset = () => {
    setPrompt("");
    setGoal(null);
    setScale(null);
    setLaunchDate("");
    setBlueprint(null);
    setRemovedSlots(new Set());
    setRemovedAmps(new Set());
    commit.reset();
    generate.reset();
  };

  const doGenerate = () => {
    if (!target) return;
    const ref = [
      `Hero creative: "${target.title}" (${target.kind}${target.sourceProvider ? `, ${target.sourceProvider}` : ""}).`,
      target.href ? `Link: ${target.href}` : null,
      "Plan how to launch this piece across channels.",
    ]
      .filter(Boolean)
      .join(" ");
    generate.mutate({
      brandId,
      name: target.title,
      prompt: prompt.trim() ? `${ref}\n\n${prompt.trim()}` : ref,
      // Only let the model SEE the asset when we host a real image. Drive
      // folders / videos stay link-only references.
      imageUrls: target.imageUrl ? [target.imageUrl] : undefined,
      goal: goal ?? undefined,
      scaleHint: scale ?? undefined,
    });
  };

  const doCommit = () => {
    if (!blueprint || !target) return;
    commit.mutate({
      brandId,
      name: target.title,
      launchDateISO: new Date(launchDate).toISOString(),
      blueprint: {
        ...blueprint,
        slots: blueprint.slots.filter((_, i) => !removedSlots.has(i)),
        amplifierAsks: blueprint.amplifierAsks.filter((_, i) => !removedAmps.has(i)),
      },
    });
  };

  const KindIcon =
    target?.kind === "video"
      ? Film
      : target?.kind === "folder"
        ? FolderOpen
        : ImageIcon;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Rocket className="size-4" />
            Launch this media
          </SheetTitle>
          <SheetDescription>
            Steer with a prompt and a couple of toggles — we propose the shape, you
            edit it, then save.
          </SheetDescription>
        </SheetHeader>

        {target && (
          <div className="flex flex-col gap-4 px-4 pb-6">
            {/* Hero */}
            <div className="bg-muted/30 flex items-center gap-3 rounded-lg border p-3">
              <div className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded">
                {target.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={target.imageUrl}
                    alt={target.title}
                    className="size-full object-cover"
                  />
                ) : (
                  <KindIcon className="text-muted-foreground size-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{target.title}</p>
                <p className="text-muted-foreground text-xs capitalize">
                  {target.sourceProvider ?? target.kind}
                </p>
              </div>
              {target.href && (
                <a
                  href={target.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="Open"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>

            {/* Steering */}
            <div className="flex flex-col gap-1.5">
              <Label>The ask</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. New hero video for wander.com/list — landing page + a small paid push + organic. Drive supply."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Goal</Label>
              <div className="flex flex-wrap gap-1.5">
                {GOALS.map((g) => (
                  <Pill
                    key={g}
                    active={goal === g}
                    onClick={() => setGoal(goal === g ? null : g)}
                  >
                    {g}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Scale</Label>
              <div className="flex flex-wrap gap-1.5">
                {SCALES.map((s) => (
                  <Pill
                    key={s.value}
                    active={scale === s.value}
                    title={s.hint}
                    onClick={() => setScale(scale === s.value ? null : s.value)}
                  >
                    {s.label}
                  </Pill>
                ))}
                <span className="text-muted-foreground self-center text-xs">
                  {scale ? "" : "(let AI decide)"}
                </span>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Launch date</Label>
                <Input
                  type="date"
                  value={launchDate}
                  onChange={(e) => setLaunchDate(e.target.value)}
                  className="w-auto"
                />
              </div>
              <Button
                className="ml-auto"
                loading={generate.isPending}
                onClick={doGenerate}
              >
                {blueprint ? "Regenerate" : "✨ Generate shape"}
              </Button>
            </div>

            {/* Verdict: ads-only → send to Campaigns. */}
            {isCampaign && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-sm font-medium text-amber-300">
                  This looks like ads-ops, not a content moment.
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {blueprint?.verdictReason}
                </p>
                <Link
                  href="/app/campaigns"
                  className="mt-2 inline-block text-sm text-amber-300 hover:underline"
                >
                  → Create a campaign instead
                </Link>
              </div>
            )}

            {/* Review + edit */}
            {blueprint && !isCampaign && (
              <div className="border-t pt-4">
                <BlueprintReview
                  blueprint={blueprint}
                  removedSlots={removedSlots}
                  removedAmps={removedAmps}
                  onToggleSlot={(i) => toggle(removedSlots, i, setRemovedSlots)}
                  onToggleAmp={(i) => toggle(removedAmps, i, setRemovedAmps)}
                />

                <div className="mt-5 flex items-center gap-3">
                  <Button
                    disabled={!canCommit}
                    loading={commit.isPending}
                    onClick={doCommit}
                  >
                    Save moment
                  </Button>
                  {!launchDate && (
                    <span className="text-muted-foreground text-xs">
                      Set a launch date to save.
                    </span>
                  )}
                  {commit.data && (
                    <span className="text-sm text-emerald-400">
                      ✓ Saved — {commit.data.slots} slots
                      {commit.data.amplifierTargets
                        ? `, ${commit.data.amplifierTargets} amplifiers`
                        : ""}
                      .{" "}
                      <Link href="/app/content" className="underline">
                        View in Content
                      </Link>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
