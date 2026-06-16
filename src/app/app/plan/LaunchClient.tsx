"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { BlueprintReview, type Blueprint } from "./BlueprintReview";
import { PlanChat, type PlanDraft } from "./PlanChat";

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
  // Two ways to produce a blueprint: the structured Form, or the chat agent.
  const [mode, setMode] = useState<"form" | "chat">("form");
  // Seed from a deep-link (e.g. "Launch" from /media) when present.
  const [name, setName] = useState(initial?.name ?? "");
  const [brandId, setBrandId] = useState(initial?.brandId ?? brands[0]?.id ?? "");
  const [launchDate, setLaunchDate] = useState("");
  const [goal, setGoal] = useState("");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [imageText, setImageText] = useState(initial?.imageUrls?.join(" ") ?? "");
  // Primary input: paste a link (press release, landing page) and/or image URLs.
  // On generate these are scraped/passed through into name/brief/images first.
  const [sources, setSources] = useState("");

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
  const ingest = useMutation(trpc.moment.ingest.mutationOptions());
  const commit = useMutation(trpc.moment.commit.mutationOptions());

  const imageUrls = imageText
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sourceList = sources
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

  const busy = generate.isPending || ingest.isPending;

  // Pasted links/images ARE the input: scrape any page URLs into a brief +
  // reference images (run once), merge with whatever's typed, then generate.
  // Subsequent refine/regenerate reuse the populated fields — no re-scrape.
  const handleGenerate = async () => {
    let input = baseGenInput();
    if (sourceList.length) {
      const res = await ingest.mutateAsync({ sources: sourceList });
      const mergedName = name.trim() || res.name || "";
      const mergedPrompt = [prompt.trim(), res.brief].filter(Boolean).join("\n\n");
      const mergedImages = [...imageUrls, ...res.imageUrls];
      // Reflect the ingest into the editable fields so the operator can tweak.
      if (!name.trim() && res.name) setName(res.name);
      if (res.brief) setPrompt(mergedPrompt);
      if (res.imageUrls.length) setImageText(mergedImages.join(" "));
      setSources(""); // consumed — don't re-scrape on refine
      input = {
        brandId,
        name: mergedName || undefined,
        prompt: mergedPrompt || undefined,
        imageUrls: mergedImages.length ? mergedImages : undefined,
        goal: goal.trim() || undefined,
      };
    }
    generate.mutate(input);
  };

  const canGenerate =
    brandId && (name.trim() || prompt.trim() || sourceList.length > 0) && !busy;
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

  // The chat agent drafted a blueprint → lift it into the shared review/Save
  // panel, adopting the brand it planned for and seeding the name if empty.
  const onDraft = useCallback((draft: PlanDraft) => {
    setBlueprint(draft.blueprint);
    setEdited(null);
    if (draft.brandId) setBrandId(draft.brandId);
    const nm = draft.name ?? draft.blueprint.seriesName;
    if (nm) setName((cur) => cur.trim() || nm);
  }, []);

  const selectedBrandName = brands.find((b) => b.id === brandId)?.name;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Plan a moment</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Paste a link — a press release, a landing page — and/or image URLs, and
        that’s your input. We’ll read it, propose the shape, then you edit and save.
        Or just describe the moment below.
      </p>

      {/* Two ways in to the same blueprint: the structured Form, or the agent. */}
      <div className="mt-4 inline-flex rounded-lg border p-0.5 text-sm">
        {(["form", "chat"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1 transition-colors ${
              mode === m
                ? "bg-emerald-600 font-medium text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "form" ? "Form" : "Chat"}
          </button>
        ))}
      </div>

      {mode === "form" && (
        <div className="bg-card mt-3 space-y-3 rounded-xl border p-4">
          <label className="block">
            <span className="text-muted-foreground text-xs">
              Paste a link or image URL — this is your brief
            </span>
          <textarea
            value={sources}
            onChange={(e) => setSources(e.target.value)}
            rows={2}
            placeholder="https://propertymanagementinc.com/pmi-news/…wanderos-partnership   https://…/hero.jpg"
            className="border-border bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          />
          <span className="text-muted-foreground/70 mt-1 block text-[11px]">
            Page links are read for context; image links are used as hero
            creative. Fills the fields below — tweak before generating if you like.
          </span>
        </label>
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
            onClick={handleGenerate}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {ingest.isPending
              ? "Reading link…"
              : generate.isPending
                ? "Generating…"
                : "✨ Generate shape"}
          </button>
        </div>
        </div>
      )}

      {mode === "chat" && (
        <div className="bg-card mt-3 space-y-3 rounded-xl border p-4">
          {/* Brand + launch date still come from the operator; the agent
              drafts the shape, then saving uses these below. */}
          <div className="flex flex-wrap items-end gap-3">
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
          </div>
          <PlanChat
            selectedBrandId={brandId || undefined}
            selectedBrandName={selectedBrandName}
            onDraft={onDraft}
          />
        </div>
      )}

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
