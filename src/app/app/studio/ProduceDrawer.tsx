"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon, Loader2, Sparkles } from "lucide-react";

import type { MediaItem } from "@/server/db/schema";
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
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { PILLAR_BY_SLUG, PILLARS } from "@/lib/pillars";
import { useTRPC } from "@/trpc/react";

const DEFAULT_PLATFORMS = ["instagram", "x", "linkedin", "facebook"] as const;

type Target = { platform: string; channelId?: string; label: string };

export function ProduceDrawer({
  brandId,
  brandSlug,
  pillarSlug,
  date,
  open,
  onClose,
  onSaved,
}: {
  brandId: string;
  brandSlug: string | null;
  pillarSlug?: string;
  date: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const when = new Date(date);

  // Pillar can arrive fixed (from a wheel lane) or be chosen here (from the
  // calendar, which isn't pillar-laned).
  const [pillarChoice, setPillarChoice] = useState(pillarSlug ?? "");
  const pillar = pillarChoice ? PILLAR_BY_SLUG[pillarChoice] : undefined;
  const brandPillars = PILLARS.filter((p) => p.brandSlug === brandSlug);

  const { data: channels } = useQuery(trpc.studio.channels.queryOptions({ brandId }));
  const { data: references } = useQuery(trpc.studio.references.queryOptions({ brandId }));
  const { data: media } = useQuery(trpc.media.list.queryOptions({ brandId }));

  // Fan-out targets: the brand's social channels, else a sensible default set.
  const targets: Target[] = useMemo(() => {
    if (channels?.length) {
      return channels.map((c) => ({
        platform: c.platform,
        channelId: c.id,
        label: c.handle ?? c.displayName ?? platformLabel(c.platform),
      }));
    }
    return DEFAULT_PLATFORMS.map((p) => ({ platform: p, label: platformLabel(p) }));
  }, [channels]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refIds, setRefIds] = useState<Set<string>>(new Set());
  const [steer, setSteer] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [hooks, setHooks] = useState<Record<string, string>>({});
  const [pickedMedia, setPickedMedia] = useState<MediaItem[]>([]);
  const [drafted, setDrafted] = useState(false);

  // Default-select all targets once they load.
  useEffect(() => {
    if (targets.length && selected.size === 0 && !drafted) {
      setSelected(new Set(targets.map((t) => t.channelId ?? t.platform)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets]);

  const key = (t: Target) => t.channelId ?? t.platform;
  const selectedTargets = targets.filter((t) => selected.has(key(t)));
  const selectedPlatforms = [...new Set(selectedTargets.map((t) => t.platform))];

  const draftIdea = useMutation(
    trpc.studio.draftIdea.mutationOptions({
      onSuccess: (d) => {
        setTitle(d.title ?? "");
        setBody(d.body ?? "");
        if (d.seriesSuggestion) setSeriesName(d.seriesSuggestion);
        setHooks(d.platformHooks ?? {});
        setDrafted(true);
        toast.success("Draft ready — edit anything before saving");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const createFromDraft = useMutation(
    trpc.studio.createFromDraft.mutationOptions({
      onSuccess: async (res) => {
        toast.success(`Saved — ${res.platformPostCount} platform posts created`);
        await queryClient.invalidateQueries(
          trpc.studio.wheel.queryOptions({ brandId, year: when.getFullYear() }),
        );
        onSaved?.();
        onClose();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const toggleMedia = (m: { url: string | null; kind: string; thumbnailUrl: string | null; width: number | null; height: number | null }) => {
    const url = m.kind === "video" ? (m.thumbnailUrl ?? "") : (m.url ?? "");
    if (!url) return;
    setPickedMedia((prev) =>
      prev.some((x) => x.url === url)
        ? prev.filter((x) => x.url !== url)
        : [
            ...prev,
            {
              url,
              type: m.kind === "video" ? "video" : "image",
              width: m.width ?? undefined,
              height: m.height ?? undefined,
              thumbnail: m.thumbnailUrl ?? undefined,
            },
          ],
    );
  };

  const handleSave = () => {
    const posts = selectedTargets.map((t) => ({
      platform: t.platform,
      channelId: t.channelId,
      text: hooks[t.platform] ?? "",
      media: pickedMedia.length ? pickedMedia : undefined,
    })) as Parameters<typeof createFromDraft.mutate>[0]["posts"];

    createFromDraft.mutate({
      brandId,
      title: title.trim() || "Untitled idea",
      body: body.trim() || undefined,
      pillarSlug: pillarChoice || undefined,
      plannedAt: date,
      origin: drafted ? "ai" : "human",
      newSeriesName: seriesName.trim() || undefined,
      posts,
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Produce
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {pillar && (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: pillar.color }} />
                {pillar.name}
              </span>
            )}
            <span>·</span>
            <span>{when.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-24">
          {/* Targets */}
          <div className="space-y-2">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-1.5">
              {targets.map((t) => {
                const k = key(t);
                const on = selected.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setSelected((prev) => {
                        const n = new Set(prev);
                        n.has(k) ? n.delete(k) : n.add(k);
                        return n;
                      })
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on ? "border-primary bg-primary/10" : "border-border opacity-60",
                    )}
                  >
                    <ChannelLogo platform={t.platform} className="size-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* References */}
          {(references?.own.length || references?.tracked.length) && (
            <div className="space-y-2">
              <Label>Pull references (optional)</Label>
              <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border p-2">
                {[...(references?.own ?? []), ...(references?.tracked ?? [])].map((r) => {
                  const on = refIds.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setRefIds((prev) => {
                          const n = new Set(prev);
                          n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                          return n;
                        })
                      }
                      className={cn(
                        "flex items-start gap-2 rounded-md border p-1.5 text-left text-xs transition-colors",
                        on ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent/40",
                      )}
                    >
                      <ChannelLogo platform={r.platform} className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="text-muted-foreground block text-[10px] uppercase">
                          {r.kind} · {r.brandName}
                          {r.likes ? ` · ${r.likes}♥` : ""}
                        </span>
                        <span className="line-clamp-2">{r.text ?? "(no text)"}</span>
                      </span>
                      {on && <Check className="text-primary size-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pillar + steer + draft */}
          <div className="space-y-2">
            <Label>Pillar</Label>
            <SimpleSelect
              value={pillarChoice}
              onValueChange={setPillarChoice}
              options={brandPillars.map((p) => ({ value: p.slug, label: p.name }))}
              placeholder="Choose a pillar…"
              size="sm"
              aria-label="Pillar"
            />
            <Label htmlFor="steer" className="pt-1">
              Direction (optional)
            </Label>
            <Input
              id="steer"
              value={steer}
              onChange={(e) => setSteer(e.target.value)}
              placeholder="e.g. lean playful, push the wellness angle…"
            />
            <Button
              onClick={() =>
                draftIdea.mutate({
                  brandId,
                  pillarSlug: pillarChoice,
                  date,
                  platforms: selectedPlatforms as Parameters<
                    typeof draftIdea.mutate
                  >[0]["platforms"],
                  referenceIds: [...refIds],
                  steer: steer.trim() || undefined,
                })
              }
              disabled={
                draftIdea.isPending || selectedPlatforms.length === 0 || !pillarChoice
              }
              className="w-full"
            >
              {draftIdea.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {drafted ? "Re-draft with AI" : "Draft with AI"}
            </Button>
            {!pillarChoice && (
              <p className="text-muted-foreground text-xs">
                Pick a pillar to draft with AI.
              </p>
            )}
          </div>

          {/* Master idea */}
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="title">Main piece</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="The core idea / angle…"
              rows={3}
            />
            <Input
              value={seriesName}
              onChange={(e) => setSeriesName(e.target.value)}
              placeholder="Series name (optional)"
            />
          </div>

          {/* Media */}
          {media && media.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ImageIcon className="size-3.5" /> Attach media
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {media
                  .filter((m) => m.status === "ready")
                  .slice(0, 18)
                  .map((m) => {
                    const url = m.kind === "video" ? m.thumbnailUrl : m.url;
                    const picked = pickedMedia.some(
                      (x) => x.url === (m.kind === "video" ? m.thumbnailUrl : m.url),
                    );
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMedia(m)}
                        className={cn(
                          "relative size-14 overflow-hidden rounded-md border",
                          picked ? "ring-primary ring-2" : "",
                        )}
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="text-muted-foreground m-auto size-4" />
                        )}
                        {picked && (
                          <Check className="text-primary absolute right-0.5 top-0.5 size-3.5 rounded-full bg-white" />
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Per-platform copy / previews */}
          {selectedTargets.length > 0 && (drafted || selectedTargets.length > 0) && (
            <div className="space-y-2 border-t pt-4">
              <Label>Platform posts</Label>
              <div className="space-y-3">
                {selectedTargets.map((t) => (
                  <div key={key(t)} className="rounded-lg border p-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <ChannelLogo platform={t.platform} className="size-5" />
                      <span className="text-sm font-medium">{platformLabel(t.platform)}</span>
                      <span className="text-muted-foreground text-xs">{t.label}</span>
                    </div>
                    <Textarea
                      value={hooks[t.platform] ?? ""}
                      onChange={(e) =>
                        setHooks((prev) => ({ ...prev, [t.platform]: e.target.value }))
                      }
                      placeholder={`Copy for ${platformLabel(t.platform)}…`}
                      rows={3}
                    />
                    {pickedMedia.length > 0 && (
                      <div className="mt-2 flex gap-1.5">
                        {pickedMedia.slice(0, 4).map((m, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={m.thumbnail ?? m.url}
                            alt=""
                            className="size-10 rounded object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-background absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 border-t p-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={createFromDraft.isPending || selectedTargets.length === 0 || !title.trim()}
          >
            {createFromDraft.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save {selectedTargets.length} draft{selectedTargets.length === 1 ? "" : "s"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
