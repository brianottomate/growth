"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  SUBREDDIT_STANCES,
  subredditProfiles,
  type SubredditProfile,
  type SubredditStance,
} from "@/lib/subreddit";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type Source = RouterOutputs["listening"]["overview"]["sources"][number];

// Stance → tone. Mirrors the intent palette used across the listen surfaces.
const STANCE_META: Record<
  SubredditStance,
  { label: string; cls: string }
> = {
  engage: {
    label: "Engage",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  },
  cautious: {
    label: "Cautious",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  },
  observe: {
    label: "Observe",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  },
  avoid: {
    label: "Avoid",
    cls: "border-red-500/40 bg-red-500/10 text-red-400",
  },
};

function relDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function SubredditProfiles({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState("");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const profiles = subredditProfiles(source.config?.subreddits);
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.listening.overview.queryOptions());

  const evaluate = useMutation(
    trpc.listening.evaluateSubreddit.mutationOptions({
      onSuccess: async (_d, vars) => {
        await invalidate();
        toast.success(`Evaluated r/${vars.name}`);
      },
      onError: (e) => toast.error(e.message || "Evaluation failed"),
    }),
  );
  const save = useMutation(
    trpc.listening.setSubredditProfile.mutationOptions({
      onSuccess: () => void invalidate(),
      onError: (e) => toast.error(e.message || "Save failed"),
    }),
  );
  const remove = useMutation(
    trpc.listening.removeSubreddit.mutationOptions({
      onSuccess: () => void invalidate(),
      onError: (e) => toast.error(e.message || "Remove failed"),
    }),
  );

  const evaluating = (name: string) =>
    evaluate.isPending && evaluate.variables?.name === name;

  const evaluated = profiles.filter((p) => p.evaluatedAt).length;

  const addAndEvaluate = () => {
    const name = adding.replace(/^\/?r\//i, "").trim();
    if (!name) return;
    evaluate.mutate({ sourceId: source.id, name });
    setAdding("");
  };

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium"
      >
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
        Subreddit profiles — {evaluated}/{profiles.length} evaluated
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addAndEvaluate();
              }}
              placeholder="Add a subreddit (e.g. AirBnBHosts)"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              onClick={addAndEvaluate}
              disabled={!adding.trim() || evaluate.isPending}
            >
              <Sparkles className="size-3.5" />
              Add &amp; evaluate
            </Button>
          </div>

          {profiles.length === 0 ? (
            <p className="text-muted-foreground/70 text-xs">
              No subreddits configured yet.
            </p>
          ) : (
            profiles.map((p) => (
              <SubredditCard
                key={p.name}
                sourceId={source.id}
                profile={p}
                evaluating={evaluating(p.name)}
                onEvaluate={() =>
                  evaluate.mutate({ sourceId: source.id, name: p.name })
                }
                onSave={(patch) =>
                  save.mutate({ sourceId: source.id, profile: patch })
                }
                onRemove={() =>
                  remove.mutate({ sourceId: source.id, name: p.name })
                }
                saving={save.isPending}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SubredditCard({
  profile: p,
  evaluating,
  onEvaluate,
  onSave,
  onRemove,
  saving,
}: {
  sourceId: string;
  profile: SubredditProfile;
  evaluating: boolean;
  onEvaluate: () => void;
  onSave: (profile: SubredditProfile) => void;
  onRemove: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [stance, setStance] = useState<SubredditStance | undefined>(p.stance);
  const [voiceNotes, setVoiceNotes] = useState(p.voiceNotes ?? "");
  const [signalNotes, setSignalNotes] = useState(p.signalNotes ?? "");

  const stanceMeta = p.stance ? STANCE_META[p.stance] : null;

  const saveEdits = () => {
    onSave({
      name: p.name,
      stance,
      voiceNotes: voiceNotes.trim() || undefined,
      signalNotes: signalNotes.trim() || undefined,
    });
    setEditing(false);
  };

  return (
    <div className="bg-background/40 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">r/{p.name}</span>
        {stanceMeta && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              stanceMeta.cls,
            )}
          >
            {stanceMeta.label}
          </span>
        )}
        {(p.riskFlags ?? []).map((f) => (
          <span
            key={f}
            className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]"
          >
            {f}
          </span>
        ))}
        {typeof p.subscribers === "number" && (
          <span className="text-muted-foreground/70 text-[10px] tabular-nums">
            {Intl.NumberFormat(undefined, { notation: "compact" }).format(
              p.subscribers,
            )}{" "}
            members
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEvaluate}
            disabled={evaluating}
            title={p.evaluatedAt ? "Re-evaluate with AI" : "Evaluate with AI"}
          >
            {evaluating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {p.evaluatedAt ? "Re-evaluate" : "Evaluate"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`Remove r/${p.name}?`)) onRemove();
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </span>
      </div>

      {p.cultureSummary && (
        <p className="text-muted-foreground mt-1.5 text-xs">{p.cultureSummary}</p>
      )}
      {p.sanctionedPath && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">Sanctioned path: </span>
          {p.sanctionedPath}
        </p>
      )}
      {!editing && (p.voiceNotes ?? p.signalNotes) && (
        <div className="text-muted-foreground/90 mt-1.5 space-y-0.5 text-xs italic">
          {p.voiceNotes && <p>Voice: {p.voiceNotes}</p>}
          {p.signalNotes && <p>Signal: {p.signalNotes}</p>}
        </div>
      )}
      {p.evaluatedAt && (
        <p className="text-muted-foreground/60 mt-1.5 text-[10px]">
          Evaluated {relDate(p.evaluatedAt)}
          {p.evaluatedModel ? ` · ${p.evaluatedModel}` : ""}
        </p>
      )}

      {editing && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Stance</Label>
            <Select
              value={stance ?? ""}
              onValueChange={(v) => setStance(v as SubredditStance)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No stance set" />
              </SelectTrigger>
              <SelectContent>
                {SUBREDDIT_STANCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STANCE_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Voice notes (this sub)</Label>
            <Textarea
              value={voiceNotes}
              onChange={(e) => setVoiceNotes(e.target.value)}
              rows={2}
              className="text-xs"
              placeholder="How a reply should sound here, layered on the brand voice."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Signal notes (this sub)</Label>
            <Textarea
              value={signalNotes}
              onChange={(e) => setSignalNotes(e.target.value)}
              rows={2}
              className="text-xs"
              placeholder="What counts as a worth-engaging post here."
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdits} disabled={saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
