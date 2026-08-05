"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";

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
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { useTRPC } from "@/trpc/react";
import type { AmplifierHandle } from "@/server/db/amplification-schema";

const TYPE_OPTIONS = [
  { value: "friend", label: "Friend of the company" },
  { value: "creator", label: "Creator" },
  { value: "investor", label: "Investor" },
  { value: "press", label: "Press" },
  { value: "partner", label: "Partner" },
  { value: "team", label: "Team" },
];

// Static guidance — the kinds of people worth recruiting. (These used to be
// AI-seeded as fake rolodex rows, but role buckets can't be handle-discovered,
// so they live as copy: a prompt for *who* to add as real named contacts.)
const SUGGESTIONS = [
  "Founder's network & friends-of-company (e.g. @dternyak)",
  "Lead + existing investors (Series A–C)",
  "Luxury travel press (Condé Nast Traveler, Skift, Travel + Leisure)",
  "Tech press (TechCrunch, Forbes)",
  "Tastemaker creators / power users (1M+ reach)",
  "Hotel & property partners, founders & key execs",
];

const PLATFORM_OPTIONS = [
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "threads", label: "Threads" },
];

type Amplifier = {
  id: string;
  name: string;
  type: string | null;
  handles: AmplifierHandle[] | null;
  notes: string | null;
  slackUserId: string | null;
};

export function AmplifierRolodex() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Amplifier | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: amplifiers, isLoading } = useQuery(
    trpc.amplifier.list.queryOptions(),
  );

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.amplifier.list.queryOptions());

  const discover = useMutation(
    trpc.amplifier.discoverHandles.mutationOptions({
      onSuccess: (r) => {
        void invalidate();
        toast.success(
          `Found ${r.handles.length} handle${r.handles.length === 1 ? "" : "s"}`,
        );
      },
      onError: (e) => toast.error(e.message || "Discovery failed"),
    }),
  );
  const remove = useMutation(
    trpc.amplifier.remove.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to remove"),
    }),
  );

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Amplifiers · {amplifiers?.length ?? 0}
          </h2>
          <p className="text-muted-foreground/80 mt-1 text-xs">
            Friends-of-the-company, investors, press &amp; creators you recruit
            to boost launches. Shared across every brand — recruit them onto a
            moment from a campaign.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          Add amplifier
        </Button>
      </div>

      <div className="border-border/60 bg-muted/30 text-muted-foreground mb-3 rounded-xl border border-dashed px-4 py-3 text-xs">
        <span className="text-foreground/80 font-medium">Worth adding</span> —
        recruit real named contacts, not roles (discovery only resolves actual
        people/accounts):
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          {SUGGESTIONS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : !amplifiers || amplifiers.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-2xl border p-5 text-sm shadow-sm">
          No amplifiers yet. Add the people who can repost for you — like a
          friend of the company who could retweet a launch.
        </div>
      ) : (
        <div className="bg-card divide-y rounded-2xl border shadow-sm">
          {amplifiers.map((a) => {
            const isDiscovering =
              discover.isPending && discover.variables?.amplifierId === a.id;
            return (
              <div
                key={a.id}
                className="group flex items-center gap-3 px-5 py-3.5"
              >
                <span className="shrink-0 text-sm font-semibold">{a.name}</span>
                {a.type && (
                  <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] capitalize">
                    {a.type}
                  </span>
                )}
                {a.slackUserId ? (
                  <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]">
                    Slack {a.slackUserId}
                  </span>
                ) : null}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {(a.handles ?? []).length === 0 ? (
                    <span className="text-muted-foreground/60 text-[11px] italic">
                      no handles
                    </span>
                  ) : (
                    (a.handles ?? []).map((h) => (
                      <span
                        key={`${h.platform}:${h.handle}`}
                        className="text-muted-foreground flex items-center gap-1 text-[11px]"
                        title={`${platformLabel(h.platform)}: @${h.handle}`}
                      >
                        <ChannelLogo
                          platform={h.platform}
                          className="size-3.5"
                        />
                        @{h.handle}
                      </span>
                    ))
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDiscovering}
                    onClick={() => discover.mutate({ amplifierId: a.id })}
                    title="Auto-discover social handles"
                  >
                    {isDiscovering ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    Discover
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        id: a.id,
                        name: a.name,
                        type: a.type,
                        handles: a.handles,
                        notes: a.notes,
                        slackUserId: a.slackUserId,
                      })
                    }
                    title="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate({ id: a.id })}
                    title="Remove"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AmplifierDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={invalidate}
      />
      <AmplifierDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ?? undefined}
        onSaved={invalidate}
      />
    </section>
  );
}

// ---- create / edit dialog -------------------------------------------

function AmplifierDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Amplifier;
  onSaved: () => Promise<void> | void;
}) {
  const trpc = useTRPC();
  const isEdit = !!initial;

  const [name, setName] = useState("");
  const [type, setType] = useState("creator");
  const [handles, setHandles] = useState<AmplifierHandle[]>([]);
  const [notes, setNotes] = useState("");
  const [slackUserId, setSlackUserId] = useState("");
  // draft row for adding a handle
  const [platform, setPlatform] = useState("x");
  const [handle, setHandle] = useState("");

  // Re-seed the form whenever the dialog opens (or switches target).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setType(initial?.type ?? "friend");
    setHandles(initial?.handles ?? []);
    setNotes(initial?.notes ?? "");
    setSlackUserId(initial?.slackUserId ?? "");
    setPlatform("x");
    setHandle("");
  }, [open, initial]);

  const onDone = async () => {
    await onSaved();
    onOpenChange(false);
  };

  const create = useMutation(
    trpc.amplifier.create.mutationOptions({
      onSuccess: onDone,
      onError: (e) => toast.error(e.message || "Failed to create"),
    }),
  );
  const update = useMutation(
    trpc.amplifier.update.mutationOptions({
      onSuccess: onDone,
      onError: (e) => toast.error(e.message || "Failed to save"),
    }),
  );
  const busy = create.isPending || update.isPending;

  function addHandle() {
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    if (handles.some((x) => x.platform === platform && x.handle === h)) {
      setHandle("");
      return;
    }
    setHandles([...handles, { platform, handle: h }]);
    setHandle("");
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isEdit && initial) {
      update.mutate({
        id: initial.id,
        name: trimmed,
        type,
        handles,
        notes,
        slackUserId: slackUserId.trim().toUpperCase() || null,
      });
    } else {
      create.mutate({
        name: trimmed,
        type,
        handles,
        notes: notes || undefined,
        slackUserId: slackUserId.trim().toUpperCase() || undefined,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit amplifier" : "Add amplifier"}
          </DialogTitle>
          <DialogDescription>
            A lightweight contact in the org rolodex — reusable across every
            brand and launch.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. David Ternyak)"
            autoFocus
          />
          <SimpleSelect
            className="w-40"
            value={type}
            onValueChange={setType}
            options={TYPE_OPTIONS}
            aria-label="Amplifier type"
          />

          {/* handle list */}
          {handles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {handles.map((h) => (
                <span
                  key={`${h.platform}:${h.handle}`}
                  className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                >
                  <ChannelLogo platform={h.platform} className="size-3.5" />@
                  {h.handle}
                  <button
                    type="button"
                    aria-label="Remove handle"
                    onClick={() =>
                      setHandles(
                        handles.filter(
                          (x) =>
                            !(
                              x.platform === h.platform && x.handle === h.handle
                            ),
                        ),
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* add-handle row */}
          <div className="flex gap-2">
            <SimpleSelect
              className="w-32"
              value={platform}
              onValueChange={setPlatform}
              options={PLATFORM_OPTIONS}
              aria-label="Platform"
            />
            <div className="relative flex-1">
              <span className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
                @
              </span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHandle();
                  }
                }}
                placeholder="handle"
                className="pl-6"
              />
            </div>
            <Button type="button" variant="outline" onClick={addHandle}>
              Add
            </Button>
          </div>

          <Input
            value={slackUserId}
            onChange={(event) =>
              setSlackUserId(event.target.value.toUpperCase())
            }
            placeholder="Slack member ID (for example U012ABCDEF)"
          />

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim() || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save" : "Add amplifier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
