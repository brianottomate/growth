"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DatePicker,
  fromDateInputValue,
  toDateInputValue,
} from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/components/ui/lib/utils";
import { PILLARS } from "@/lib/pillars";

type Brand = { id: string; name: string; slug: string | null };

// Where an idea can start from. Media is wired to the library next; for now it's
// a visible "soon" affordance so the entry point is established.
const SEEDS = [
  { id: "blank", label: "Blank" },
  { id: "hook", label: "From a hook" },
  { id: "paste", label: "Paste" },
  { id: "media", label: "From media" },
] as const;
type Seed = (typeof SEEDS)[number]["id"];

// The channels an idea can fan out to at create time (owned spots, primary
// format). Listening-only + ads platforms are intentionally excluded here.
const SPOT_PLATFORMS = [
  "instagram",
  "tiktok",
  "x",
  "facebook",
  "youtube",
  "threads",
  "pinterest",
  "linkedin",
] as const;

/**
 * The global "Add idea" create surface. Form-first, but laid out chat-ready:
 * the brief (the artifact) is the main column with a chat rail beside it we
 * light up next (homi-onboarding shape). An idea can start from anywhere —
 * blank, a hook, pasted text, or (soon) a piece of media.
 */
export function AddIdeaDrawer({
  brands,
  defaultBrandId,
  open,
  onOpenChange,
  onCreated,
}: {
  brands: Brand[];
  defaultBrandId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id?: string) => void;
}) {
  const trpc = useTRPC();
  const hookRef = useRef<HTMLInputElement>(null);

  const [seed, setSeed] = useState<Seed>("blank");
  const [brandId, setBrandId] = useState<string>(defaultBrandId ?? brands[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("");
  const [pillar, setPillar] = useState("");
  const [date, setDate] = useState(""); // yyyy-mm-dd
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState("");

  // Reset to a clean slate every time the drawer opens.
  useEffect(() => {
    if (open) {
      setSeed("blank");
      setBrandId(defaultBrandId ?? brands[0]?.id ?? "");
      setTitle("");
      setHook("");
      setCaption("");
      setCta("");
      setPillar("");
      setDate("");
      setPlatforms([]);
      setPasteText("");
    }
  }, [open, defaultBrandId, brands]);

  // Focus the hook field when the user seeds from a hook.
  useEffect(() => {
    if (seed === "hook") hookRef.current?.focus();
  }, [seed]);

  const selectedBrand = brands.find((b) => b.id === brandId) ?? null;
  const pillars = useMemo(
    () =>
      selectedBrand
        ? PILLARS.filter((p) => p.brandSlug === selectedBrand.slug)
        : PILLARS,
    [selectedBrand],
  );

  const create = useMutation(
    trpc.content.create.mutationOptions({
      onSuccess: ({ id }) => {
        onCreated(id);
        onOpenChange(false);
      },
    }),
  );

  const togglePlatform = (p: string) =>
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  // Pull a starting brief out of pasted text: first line → title + hook, the
  // rest → caption direction. Only fills empty fields (never clobbers edits).
  const applyPaste = () => {
    const lines = pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    if (!title.trim()) setTitle(lines[0]!.slice(0, 120));
    if (!hook.trim()) setHook(lines[0]!.slice(0, 200));
    const rest = lines.slice(1).join("\n");
    if (!caption.trim() && rest) setCaption(rest);
  };

  const canSubmit =
    !!brandId && (title.trim().length > 0 || hook.trim().length > 0) && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const finalTitle = title.trim() || hook.trim().slice(0, 80) || "Untitled";
    create.mutate({
      brandId,
      title: finalTitle,
      hook: hook.trim() || undefined,
      captionDirection: caption.trim() || undefined,
      ctaText: cta.trim() || undefined,
      pillar: pillar || undefined,
      plannedAt: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
      platforms: platforms.length
        ? (platforms as ("instagram" | "tiktok")[])
        : undefined,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>New idea</SheetTitle>
          {/* Seed: an idea can start from anywhere. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SEEDS.map((s) => {
              const disabled = s.id === "media";
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSeed(s.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    seed === s.id
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:bg-accent",
                    disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  {s.label}
                  {disabled && " · soon"}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Chat rail — the artifact-molding assistant lights up here next. */}
          <aside className="hidden w-40 shrink-0 border-r p-3 sm:block">
            <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Assist
            </div>
            <div className="border-border/60 text-muted-foreground/70 mt-2 rounded-lg border border-dashed p-3 text-xs leading-relaxed">
              A chat that molds this brief — describe an angle, paste research, or
              drop a reference, and it fills the fields.
              <span className="mt-1 block font-medium">Coming next.</span>
            </div>
          </aside>

          {/* Brief (the artifact). */}
          <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
            {seed === "paste" && (
              <div className="space-y-1.5">
                <Label>Paste anything</Label>
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste from Claude, a doc, a transcript… we'll seed the brief from it."
                  rows={4}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyPaste}
                  disabled={!pasteText.trim()}
                >
                  Fill brief from text
                </Button>
              </div>
            )}

            {seed === "media" && (
              <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                Starting from a media asset (pick from the library, auto-draft a
                brief around it) lands next. For now, fill the brief below.
              </div>
            )}

            {brands.length > 1 && (
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <SimpleSelect
                  value={brandId}
                  onValueChange={(v) => {
                    setBrandId(v);
                    setPillar("");
                  }}
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  aria-label="Brand"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="idea-title">Title</Label>
              <Input
                id="idea-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's the idea?"
                autoFocus={seed === "blank"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="idea-hook">Hook</Label>
              <Input
                id="idea-hook"
                ref={hookRef}
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                placeholder="The scroll-stopping first line"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pillar</Label>
                <SimpleSelect
                  value={pillar || "none"}
                  onValueChange={(v) => setPillar(v === "none" ? "" : v)}
                  options={[
                    { value: "none", label: "No pillar" },
                    ...pillars.map((p) => ({ value: p.slug, label: p.name })),
                  ]}
                  aria-label="Pillar"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="idea-date">Plan date</Label>
                <DatePicker
                  id="idea-date"
                  value={fromDateInputValue(date)}
                  onChange={(d) => setDate(d ? toDateInputValue(d) : "")}
                  placeholder="Plan date"
                  className="w-full justify-start py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="idea-caption">Caption direction</Label>
              <Textarea
                id="idea-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Copy direction for the spots (the brief, not the final caption)"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="idea-cta">CTA</Label>
              <Input
                id="idea-cta"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder='e.g. "Comment ESCAPE to get the list"'
              />
            </div>

            <div className="space-y-1.5">
              <Label>Channels</Label>
              <div className="flex flex-wrap gap-1.5">
                {SPOT_PLATFORMS.map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <ChannelLogo platform={p} className="size-3.5" />
                      {platformLabel(p)}
                    </button>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                Each selected channel becomes a spot at its primary format — tune
                them on the idea page.
              </p>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending ? "Creating…" : "Create idea"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
