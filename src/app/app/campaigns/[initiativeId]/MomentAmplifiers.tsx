"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Sparkles, X } from "lucide-react";

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
import { toast } from "@/components/ui/toast";
import { ChannelLogo } from "@/components/channel-logos";
import { useTRPC } from "@/trpc/react";

// planned → asked → confirmed → fulfilled (matches amplification_target.ask)
const ASKS = ["planned", "asked", "confirmed", "fulfilled"] as const;
type Ask = (typeof ASKS)[number];

const ASK_META: Record<Ask, { label: string; cls: string; dot: string }> = {
  planned: { label: "Planned", cls: "text-muted-foreground", dot: "bg-muted-foreground/40" },
  asked: { label: "Asked", cls: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  confirmed: { label: "Confirmed", cls: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  fulfilled: { label: "Fulfilled", cls: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
};

const TYPE_OPTIONS = [
  { value: "friend", label: "Friend of the company" },
  { value: "creator", label: "Creator" },
  { value: "investor", label: "Investor" },
  { value: "press", label: "Press" },
  { value: "partner", label: "Partner" },
  { value: "team", label: "Team" },
];

export function MomentAmplifiers({ momentId }: { momentId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery(
    trpc.amplifier.targetsForInitiative.queryOptions({
      initiativeId: momentId,
    }),
  );
  const targets = data?.targets;
  const posts = data?.posts ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries(
      trpc.amplifier.targetsForInitiative.queryOptions({
        initiativeId: momentId,
      }),
    );

  const setAsk = useMutation(
    trpc.amplifier.setTargetAsk.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to update status"),
    }),
  );
  const removeTarget = useMutation(
    trpc.amplifier.removeTarget.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to remove"),
    }),
  );

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Amplifiers · {targets?.length ?? 0}
        </h2>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />
          Add amplifier
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : !targets || targets.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          No one recruited yet. Add a friend-of-the-company, investor, or creator
          to boost this launch — they live in a shared org rolodex, so you can
          reuse them across brands.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {targets.map((t) => {
            const meta = ASK_META[(t.ask as Ask) ?? "planned"];
            return (
              <div
                key={t.id}
                className="bg-card hover:bg-accent/40 group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <span className="truncate text-sm font-medium">
                  {t.amplifier.name}
                </span>
                {t.amplifier.type && (
                  <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] capitalize">
                    {t.amplifier.type}
                  </span>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {(t.amplifier.handles ?? []).map((h) => (
                    <span
                      key={`${h.platform}:${h.handle}`}
                      className="text-muted-foreground flex items-center gap-1 text-[11px]"
                      title={`${h.platform}: @${h.handle}`}
                    >
                      <ChannelLogo platform={h.platform} className="size-3.5" />
                      <span className="truncate">@{h.handle}</span>
                    </span>
                  ))}
                </div>
                <SimpleSelect
                  size="sm"
                  className="w-32 shrink-0"
                  value={t.ask}
                  onValueChange={(ask) =>
                    setAsk.mutate({ targetId: t.id, ask: ask as Ask })
                  }
                  options={ASKS.map((a) => ({
                    value: a,
                    label: ASK_META[a].label,
                  }))}
                  aria-label="Recruitment status"
                />
                <span className={`flex shrink-0 items-center gap-1 text-[11px] ${meta.cls}`}>
                  <span className={`size-1.5 rounded-full ${meta.dot}`} />
                </span>
                <button
                  type="button"
                  aria-label="Remove amplifier"
                  onClick={() => removeTarget.mutate({ targetId: t.id })}
                  className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AddAmplifierDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        posts={posts}
        existingAmplifierIds={new Set((targets ?? []).map((t) => t.amplifierId))}
        onAdded={invalidate}
      />
    </section>
  );
}

type InitiativePost = {
  id: string;
  platform: string;
  title: string | null;
  scheduledAt: Date | string | null;
};

const postLabel = (post: InitiativePost) =>
  `${post.platform} · ${post.title ?? "Untitled"}${
    post.scheduledAt
      ? ` · ${new Date(post.scheduledAt).toLocaleDateString()}`
      : ""
  }`;

// ---- add / recruit dialog -------------------------------------------

function AddAmplifierDialog({
  open,
  onOpenChange,
  posts,
  existingAmplifierIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posts: InitiativePost[];
  existingAmplifierIds: Set<string>;
  onAdded: () => Promise<void> | void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pick" | "new">("pick");
  // Asks anchor to one platform post; default to the first of the launch.
  const [postId, setPostId] = useState<string>("");
  const selectedPostId = postId || posts[0]?.id || "";

  // ---- pick from the org rolodex ----
  const [q, setQ] = useState("");
  const { data: rolodex, isLoading } = useQuery({
    ...trpc.amplifier.list.queryOptions(),
    enabled: open,
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rolodex ?? []).filter((a) => !existingAmplifierIds.has(a.id));
    if (!needle) return list;
    return list.filter((a) => a.name.toLowerCase().includes(needle));
  }, [rolodex, q, existingAmplifierIds]);

  const addTarget = useMutation(
    trpc.amplifier.addTarget.mutationOptions({
      onSuccess: async () => {
        await onAdded();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to add amplifier"),
    }),
  );

  // ---- create a brand-new amplifier ----
  const [name, setName] = useState("");
  const [type, setType] = useState("friend");
  const [platform, setPlatform] = useState("x");
  const [handle, setHandle] = useState("");

  const createAndAdd = useMutation(
    trpc.amplifier.create.mutationOptions({
      onSuccess: async (amp) => {
        if (!amp || !selectedPostId) return;
        await queryClient.invalidateQueries(
          trpc.amplifier.list.queryOptions(),
        );
        addTarget.mutate({
          platformPostId: selectedPostId,
          amplifierId: amp.id,
        });
        setName("");
        setHandle("");
      },
      onError: (e) => toast.error(e.message || "Failed to create amplifier"),
    }),
  );

  const busy = addTarget.isPending || createAndAdd.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add amplifier</DialogTitle>
          <DialogDescription>
            Recruit someone to boost one post of this launch. Amplifiers are
            shared across the whole org — pick an existing one or create a new
            contact.
          </DialogDescription>
        </DialogHeader>

        {posts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This launch has no posts yet — create content first, then recruit
            amplification for the post that matters.
          </p>
        ) : (
          <SimpleSelect
            value={selectedPostId}
            onValueChange={setPostId}
            options={posts.map((post) => ({
              value: post.id,
              label: postLabel(post),
            }))}
            aria-label="Post to amplify"
          />
        )}

        <div className="bg-muted flex gap-1 rounded-lg p-1">
          {(["pick", "new"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                tab === t
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "pick" ? "From rolodex" : "New contact"}
            </button>
          ))}
        </div>

        {tab === "pick" ? (
          <>
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search amplifiers…"
                className="pl-8"
              />
            </div>
            <div className="-mx-1 max-h-72 overflow-y-auto px-1">
              {isLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground py-6 text-sm">
                  {q
                    ? "No matches."
                    : rolodex && rolodex.length > 0
                      ? "Everyone in the rolodex is already on this launch."
                      : "Rolodex is empty — create a new contact."}
                </p>
              ) : (
                <div className="flex flex-col">
                  {filtered.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={busy || !selectedPostId}
                      onClick={() =>
                        addTarget.mutate({
                          platformPostId: selectedPostId,
                          amplifierId: a.id,
                        })
                      }
                      className="hover:bg-accent/40 flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {a.name}
                      </span>
                      {a.type && (
                        <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] capitalize">
                          {a.type}
                        </span>
                      )}
                      <div className="flex shrink-0 items-center gap-1">
                        {(a.handles ?? []).map((h) => (
                          <ChannelLogo
                            key={`${h.platform}:${h.handle}`}
                            platform={h.platform}
                            className="size-3.5"
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. David Ternyak)"
              autoFocus
            />
            <div className="flex gap-2">
              <SimpleSelect
                className="w-36"
                value={type}
                onValueChange={setType}
                options={TYPE_OPTIONS}
                aria-label="Amplifier type"
              />
              <SimpleSelect
                className="w-32"
                value={platform}
                onValueChange={setPlatform}
                options={[
                  { value: "x", label: "X" },
                  { value: "linkedin", label: "LinkedIn" },
                  { value: "instagram", label: "Instagram" },
                  { value: "youtube", label: "YouTube" },
                  { value: "tiktok", label: "TikTok" },
                ]}
                aria-label="Platform"
              />
              <div className="relative flex-1">
                <span className="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 text-sm">
                  @
                </span>
                <Input
                  value={handle}
                  onChange={(e) =>
                    setHandle(e.target.value.replace(/^@/, ""))
                  }
                  placeholder="handle"
                  className="pl-6"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              You can auto-discover their other handles later from the rolodex.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          {tab === "new" && (
            <Button
              onClick={() =>
                createAndAdd.mutate({
                  name: name.trim(),
                  type,
                  handles: handle.trim()
                    ? [{ platform, handle: handle.trim() }]
                    : [],
                })
              }
              disabled={!name.trim() || busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Create &amp; recruit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
