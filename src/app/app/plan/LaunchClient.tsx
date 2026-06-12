"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { BlueprintReview, type Blueprint } from "./BlueprintReview";

// yyyy-mm-dd in LOCAL time (what <input type="date"> expects).
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const DATE_PRESETS: { label: string; get: () => Date }[] = [
  { label: "Today", get: () => new Date() },
  {
    label: "Tomorrow",
    get: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: "Next week",
    get: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d;
    },
  },
  {
    label: "Next month",
    get: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d;
    },
  },
];

export function LaunchClient({
  brands,
  initial,
}: {
  brands: { id: string; name: string }[];
  initial?: {
    brandId?: string;
    name?: string;
    prompt?: string;
    imageUrls?: string[];
  };
}) {
  const trpc = useTRPC();
  // Seed from a deep-link (e.g. "Launch" from /media) when present.
  const [name, setName] = useState(initial?.name ?? "");
  const [brandId, setBrandId] = useState(initial?.brandId ?? brands[0]?.id ?? "");
  const [launchDate, setLaunchDate] = useState("");
  const [goal, setGoal] = useState("");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [imageText, setImageText] = useState(initial?.imageUrls?.join(" ") ?? "");

  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  // The committable edit reported by the remix builder (slots/amplifiers after
  // pins/removes). Null until the builder reports — then mirrors the blueprint.
  const [edited, setEdited] = useState<{
    slots: Blueprint["slots"];
    amplifierAsks: Blueprint["amplifierAsks"];
  } | null>(null);

  const generate = useMutation(
    trpc.moment.generate.mutationOptions({
      onSuccess: (bp) => setBlueprint(bp),
    }),
  );
  const commit = useMutation(trpc.moment.commit.mutationOptions());

  const imageUrls = imageText
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Shared input for both first-generate and refine/regenerate.
  const baseGenInput = () => ({
    brandId,
    name: name.trim() || undefined,
    prompt: prompt.trim() || undefined,
    imageUrls: imageUrls.length ? imageUrls : undefined,
    goal: goal.trim() || undefined,
  });

  const canGenerate = brandId && (name.trim() || prompt.trim()) && !generate.isPending;
  const isCampaign = blueprint?.verdict === "campaign";
  const canCommit =
    blueprint && !isCampaign && name.trim() && launchDate && !commit.isPending;

  const doCommit = () => {
    if (!blueprint) return;
    const eff = edited ?? {
      slots: blueprint.slots,
      amplifierAsks: blueprint.amplifierAsks,
    };
    commit.mutate({
      brandId,
      name: name.trim(),
      launchDateISO: new Date(launchDate).toISOString(),
      blueprint: { ...blueprint, slots: eff.slots, amplifierAsks: eff.amplifierAsks },
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Plan a moment</h1>
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Launch date:</span>
          {DATE_PRESETS.map((p) => {
            const value = toDateInput(p.get());
            const active = launchDate === value;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setLaunchDate(value)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  active
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
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
            onClick={() => generate.mutate(baseGenInput())}
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
            launchDate={launchDate}
            onEdited={setEdited}
            onRegenerate={(refine) => generate.mutate({ ...baseGenInput(), refine })}
            regenerating={generate.isPending}
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
