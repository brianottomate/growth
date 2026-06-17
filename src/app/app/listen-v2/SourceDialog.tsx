"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { platformLabel } from "@/components/channel-logos";
import type {
  AcquisitionShape,
  ChannelPlatform,
  ListeningSourceConfig,
  ListeningTrigger,
} from "@/server/db/schema";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type Source = RouterOutputs["listening"]["overview"]["sources"][number];

// Platforms worth listening on (drops the ad / newsletter / blog surfaces).
const LISTENING_PLATFORMS: ChannelPlatform[] = [
  "reddit",
  "x",
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "threads",
  "pinterest",
  "hackernews",
  "lobsters",
  "other",
];

const ACQUISITIONS: [AcquisitionShape, string, string][] = [
  ["keyword_search", "Market — keyword search", "Search public conversations for signal"],
  ["owned_inbound", "Owned — inbound", "DMs & comments on our own accounts"],
  ["provider_alert", "Provider — pushed alerts", "A third-party tool pushes matches to us"],
];

const TRIGGERS: [ListeningTrigger, string][] = [
  ["on_demand", "On demand (Scan now)"],
  ["scheduled", "Scheduled (cron)"],
  ["webhook", "Webhook (provider pushes)"],
];

const linesToArr = (s: string) =>
  s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrToLines = (a?: string[]) => (a ?? []).join("\n");

/** Best-guess connector slug so operators never have to know what an adapter is. */
function deriveAdapter(
  platform: ChannelPlatform,
  acquisition: AcquisitionShape,
): string {
  if (acquisition === "provider_alert") return "f5bot";
  if (acquisition === "owned_inbound") return "zernio-comments";
  if (platform === "reddit") return "reddit-json";
  if (platform === "x") return "x-search";
  return `${platform}-search`;
}

export function SourceDialog({
  open,
  onOpenChange,
  brandId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  initial?: Source;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [label, setLabel] = useState("");
  const [platform, setPlatform] = useState<ChannelPlatform>("reddit");
  const [acquisition, setAcquisition] =
    useState<AcquisitionShape>("keyword_search");
  const [trigger, setTrigger] = useState<ListeningTrigger>("on_demand");
  const [scheduleCron, setScheduleCron] = useState("");
  const [adapter, setAdapter] = useState("");
  const [subreddits, setSubreddits] = useState("");
  const [keywords, setKeywords] = useState("");
  const [signalNotes, setSignalNotes] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [overridesBrand, setOverridesBrand] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setPlatform((initial?.platform as ChannelPlatform) ?? "reddit");
    setAcquisition((initial?.acquisition as AcquisitionShape) ?? "keyword_search");
    setTrigger((initial?.trigger as ListeningTrigger) ?? "on_demand");
    setScheduleCron(initial?.scheduleCron ?? "");
    setAdapter(initial?.adapter ?? "");
    setSubreddits(arrToLines(initial?.config?.subreddits));
    setKeywords(arrToLines(initial?.config?.keywords));
    setSignalNotes(initial?.signalNotes ?? "");
    setVoiceText(initial?.voiceOverride?.fingerprintText ?? "");
    setOverridesBrand(initial?.voiceOverride?.overridesBrand ?? false);
    setShowAdvanced(false);
  }, [open, initial]);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.listening.overview.queryOptions());

  const create = useMutation(
    trpc.listening.createSource.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
        toast.success("Source added");
      },
      onError: (e) => toast.error(e.message || "Failed to add source"),
    }),
  );
  const update = useMutation(
    trpc.listening.updateSource.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to save source"),
    }),
  );
  const remove = useMutation(
    trpc.listening.deleteSource.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
        toast.success("Source removed");
      },
      onError: (e) => toast.error(e.message || "Failed to remove source"),
    }),
  );
  const pending = create.isPending || update.isPending || remove.isPending;

  const isKeywordSearch = acquisition === "keyword_search";
  const isReddit = platform === "reddit";

  function buildConfig(): ListeningSourceConfig {
    const config: ListeningSourceConfig = { ...(initial?.config ?? {}) };
    if (isKeywordSearch && isReddit) config.subreddits = linesToArr(subreddits);
    if (isKeywordSearch && !isReddit) config.keywords = linesToArr(keywords);
    return config;
  }

  function buildVoiceOverride() {
    return voiceText.trim()
      ? { fingerprintText: voiceText.trim(), overridesBrand }
      : null;
  }

  function submit() {
    if (!label.trim()) return toast.error("Give the source a name");
    const cron = trigger === "scheduled" ? scheduleCron.trim() || null : null;

    if (isEdit && initial?.id) {
      update.mutate({
        id: initial.id,
        patch: {
          label: label.trim(),
          trigger,
          scheduleCron: cron,
          signalNotes: signalNotes.trim() || null,
          config: buildConfig(),
          voiceOverride: buildVoiceOverride(),
        },
      });
    } else {
      create.mutate({
        brandId,
        label: label.trim(),
        platform,
        acquisition,
        trigger,
        adapter: adapter.trim() || deriveAdapter(platform, acquisition),
        scheduleCron: cron,
        signalNotes: signalNotes.trim() || null,
        config: buildConfig(),
        voiceOverride: buildVoiceOverride(),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit source" : "Add a source to monitor"}</DialogTitle>
          <DialogDescription>
            One place we listen — its config drives the scans and reply drafts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="src-label">Name</Label>
            <Input
              id="src-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Reddit — STR operator subs"
            />
          </div>

          {/* Platform + acquisition define the row's wiring — immutable once created. */}
          {isEdit ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Surface:</span>
              <span className="bg-muted rounded px-2 py-0.5 font-medium">
                {platformLabel(platform)}
              </span>
              <span className="bg-muted rounded px-2 py-0.5 font-medium">
                {ACQUISITIONS.find((a) => a[0] === acquisition)?.[1] ?? acquisition}
              </span>
              <span className="text-muted-foreground/70">
                (fixed — delete &amp; re-add to change)
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Select
                  value={platform}
                  onValueChange={(v) => setPlatform(v as ChannelPlatform)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LISTENING_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {platformLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>What kind</Label>
                <Select
                  value={acquisition}
                  onValueChange={(v) => setAcquisition(v as AcquisitionShape)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACQUISITIONS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* What we watch — only meaningful for keyword search. */}
          {isKeywordSearch ? (
            isReddit ? (
              <div className="space-y-1.5">
                <Label htmlFor="src-subs">Subreddits (one per line, no r/)</Label>
                <Textarea
                  id="src-subs"
                  value={subreddits}
                  onChange={(e) => setSubreddits(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder={"ShortTermRentals\nAirbnbHosts\nVRBOHosts"}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="src-kw">Keywords / search terms (one per line)</Label>
                <Textarea
                  id="src-kw"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder={"direct booking\nOTA fees\nalternative to Airbnb"}
                />
              </div>
            )
          ) : (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
              {acquisition === "owned_inbound"
                ? "Reads DMs / comments from the connected account — no keyword config."
                : "A provider pushes matches to us — keywords are managed in that tool."}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="src-notes">
              Signal notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="src-notes"
              value={signalNotes}
              onChange={(e) => setSignalNotes(e.target.value)}
              rows={2}
              placeholder="Anything specific to watch for here, layered over the brand story."
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-muted-foreground hover:text-foreground text-xs font-medium"
          >
            {showAdvanced ? "− Hide" : "+ Show"} advanced (cadence, connector, voice)
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-l-2 pl-3">
              <div className="space-y-1.5">
                <Label>Cadence</Label>
                <Select
                  value={trigger}
                  onValueChange={(v) => setTrigger(v as ListeningTrigger)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {trigger === "scheduled" && (
                  <Input
                    value={scheduleCron}
                    onChange={(e) => setScheduleCron(e.target.value)}
                    placeholder="cron e.g. 0 * * * *"
                    className="font-mono text-xs"
                  />
                )}
              </div>

              {!isEdit && (
                <div className="space-y-1.5">
                  <Label htmlFor="src-adapter">
                    Connector{" "}
                    <span className="text-muted-foreground">
                      (auto: {deriveAdapter(platform, acquisition)})
                    </span>
                  </Label>
                  <Input
                    id="src-adapter"
                    value={adapter}
                    onChange={(e) => setAdapter(e.target.value)}
                    placeholder={deriveAdapter(platform, acquisition)}
                    className="font-mono text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="src-voice">
                  Voice override{" "}
                  <span className="text-muted-foreground">
                    (blank = use brand voice)
                  </span>
                </Label>
                <Textarea
                  id="src-voice"
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  rows={2}
                />
                {voiceText.trim() && (
                  <label className="text-muted-foreground flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={overridesBrand}
                      onChange={(e) => setOverridesBrand(e.target.checked)}
                    />
                    Replace the brand voice entirely (instead of layering on top)
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {isEdit && initial?.id ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => {
                if (confirm(`Remove "${initial.label ?? "this source"}"?`))
                  remove.mutate({ id: initial.id });
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save" : "Add source"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
