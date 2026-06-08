"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { BlueprintReview, type Blueprint } from "./BlueprintReview";

export function LaunchClient({
  brands,
}: {
  brands: { id: string; name: string }[];
}) {
  const trpc = useTRPC();
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [launchDate, setLaunchDate] = useState("");
  const [goal, setGoal] = useState("");
  const [prompt, setPrompt] = useState("");
  const [imageText, setImageText] = useState("");

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
    }),
  );
  const commit = useMutation(trpc.moment.commit.mutationOptions());

  const imageUrls = imageText
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const canGenerate = brandId && (name.trim() || prompt.trim()) && !generate.isPending;
  const isCampaign = blueprint?.verdict === "campaign";
  const canCommit =
    blueprint && !isCampaign && name.trim() && launchDate && !commit.isPending;

  const toggle = (set: Set<number>, i: number, fn: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    fn(next);
  };

  const doCommit = () => {
    if (!blueprint) return;
    commit.mutate({
      brandId,
      name: name.trim(),
      launchDateISO: new Date(launchDate).toISOString(),
      blueprint: {
        ...blueprint,
        slots: blueprint.slots.filter((_, i) => !removedSlots.has(i)),
        amplifierAsks: blueprint.amplifierAsks.filter((_, i) => !removedAmps.has(i)),
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Launch planner</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Describe a moment — a Series C launch, or just “here’s our new hero
        video, get it out there.” Generate the shape, edit it, then save.
      </p>

      <div className="bg-card mt-5 space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="text-muted-foreground text-xs">Moment</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Series C / List on Wander video"
              className="border-border bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </label>
          <label>
            <span className="text-muted-foreground text-xs">Brand</span>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="border-border bg-background mt-1 block rounded-md border px-2 py-1.5 text-sm"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-muted-foreground text-xs">Launch date</span>
            <input
              type="date"
              value={launchDate}
              onChange={(e) => setLaunchDate(e.target.value)}
              className="border-border bg-background mt-1 block rounded-md border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="w-28">
            <span className="text-muted-foreground text-xs">Goal (opt)</span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="fundraise"
              className="border-border bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-muted-foreground text-xs">
            Prompt / brief (what’s happening, the assets, the ask)
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="New founder hero video for wander.com/list — goes on the landing page, small paid push, and organic. Drive supply."
            className="border-border bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-muted-foreground text-xs">
            Reference image URLs (optional, space/newline separated)
          </span>
          <input
            value={imageText}
            onChange={(e) => setImageText(e.target.value)}
            placeholder="https://…/hero-frame.jpg"
            className="border-border bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex justify-end">
          <button
            disabled={!canGenerate}
            onClick={() =>
              generate.mutate({
                brandId,
                name: name.trim() || undefined,
                prompt: prompt.trim() || undefined,
                imageUrls: imageUrls.length ? imageUrls : undefined,
                goal: goal.trim() || undefined,
              })
            }
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {generate.isPending ? "Generating…" : "✨ Generate shape"}
          </button>
        </div>
      </div>

      {/* Verdict: ads-only → send to Campaigns. */}
      {isCampaign && (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
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

      {/* Review + edit before saving. */}
      {blueprint && !isCampaign && (
        <div className="mt-6">
          <BlueprintReview
            blueprint={blueprint}
            removedSlots={removedSlots}
            removedAmps={removedAmps}
            onToggleSlot={(i) => toggle(removedSlots, i, setRemovedSlots)}
            onToggleAmp={(i) => toggle(removedAmps, i, setRemovedAmps)}
          />

          <div className="mt-5 flex items-center gap-3">
            <button
              disabled={!canCommit}
              onClick={doCommit}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {commit.isPending ? "Saving…" : "Save moment"}
            </button>
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
  );
}
