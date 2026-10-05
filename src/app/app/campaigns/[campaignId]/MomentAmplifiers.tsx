"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Pencil, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ChannelLogo } from "@/components/channel-logos";
import {
  amplificationActionSchema,
  amplificationAskSchema,
  amplificationPlatformSchema,
} from "@/lib/amplification-plan";
import { amplificationTargetsOutputSchema } from "@/server/ai/capabilities/outputs/amplification";
import { orpc } from "@/orpc/client";

type Data = z.infer<typeof amplificationTargetsOutputSchema>;
type Target = Data["targets"][number];
type Scope =
  | { initiativeId: string; contentPostId?: never }
  | { contentPostId: string; initiativeId?: never };
const label = (value: string) =>
  value === "x"
    ? "X"
    : value === "linkedin"
      ? "LinkedIn"
      : value === "fulfilled"
        ? "Completed"
        : value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: label(value) }));

export function AmplificationSummary({
  contentPostId,
}: {
  contentPostId: string;
}) {
  const { data } = useQuery(
    orpc.amplifier.targets.queryOptions({ input: { contentPostId } }),
  );
  if (!data?.targets.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-t pt-2">
      {data.targets.map((t) => (
        <Link
          key={t.id}
          href={`/app/content/${contentPostId}#amplification`}
          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          title={`${t.amplifier.name} · ${label(t.actionKind)} · ${label(t.ask)}`}
        >
          <ChannelLogo platform={t.destinationPlatform} className="size-3" />
          {t.amplifier.name.split(" ")[0]} · {label(t.ask)}
        </Link>
      ))}
    </div>
  );
}

export function MomentAmplifiers({ momentId }: { momentId: string }) {
  return <AmplificationPanel scope={{ initiativeId: momentId }} />;
}

export function AmplificationPanel({ scope }: { scope: Scope }) {
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery(
    orpc.amplifier.targets.queryOptions({ input: scope }),
  );
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const refresh = () =>
    client.invalidateQueries({ queryKey: orpc.amplifier.key() });
  const remove = useMutation(
    orpc.amplifier.removeTarget.mutationOptions({
      onSuccess: refresh,
      onError: (e) => toast.error(e.message),
    }),
  );
  const update = useMutation(
    orpc.amplifier.updateTarget.mutationOptions({
      onSuccess: refresh,
      onError: (e) => toast.error(e.message),
    }),
  );
  const notify = useMutation(
    orpc.amplifier.notifyTarget.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("Slack request sent");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const targets = data?.targets ?? [];
  return (
    <section id="amplification" className="@container space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 @md:flex-row @md:items-center">
        <div>
          <h2 className="font-semibold">
            Team amplification{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {targets.length} actions
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Who is sharing, where, and what happens next.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add assignment
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        !targets.length && (
          <p className="text-sm text-muted-foreground">
            Plan a share or adaptation with a teammate or partner.
          </p>
        )
      )}
      {(data?.posts ?? [])
        .filter((p) => targets.some((t) => t.platformPostId === p.id))
        .map((post) => (
          <div key={post.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <ChannelLogo platform={post.platform} className="size-3.5" />
              <Link
                href={`/app/content/${post.contentPostId}`}
                className="hover:underline"
              >
                {post.title ?? "Source post"}
              </Link>
            </div>
            {targets
              .filter((t) => t.platformPostId === post.id)
              .map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-2.5 text-xs"
                >
                  <div className="w-full min-w-0 @md:w-auto @md:flex-1">
                    <span className="font-medium">{t.amplifier.name}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
                      <ChannelLogo
                        platform={t.destinationPlatform}
                        className="size-3.5"
                      />
                      {label(t.destinationPlatform)} · {label(t.actionKind)}
                      <span>
                        ·{" "}
                        {t.outputPlatformPostId
                          ? `${label(t.outputStatus ?? "draft")} output`
                          : t.amplifier.handoffPreference === "slack"
                            ? "Slack handoff"
                            : "Manual handoff"}
                      </span>
                    </div>
                  </div>
                  <SimpleSelect
                    className="w-28"
                    size="sm"
                    value={t.ask}
                    options={options(amplificationAskSchema.options)}
                    aria-label={`Status for ${t.amplifier.name} on ${label(t.destinationPlatform)}`}
                    disabled={update.isPending}
                    onValueChange={(ask) =>
                      update.mutate({
                        targetId: t.id,
                        ask: amplificationAskSchema.parse(ask),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${t.amplifier.name} assignment`}
                    onClick={() => setEditing(t)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {t.amplifier.handoffPreference === "slack" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        notify.isPending ||
                        t.slackStatus === "sent" ||
                        t.ask === "fulfilled"
                      }
                      onClick={() => notify.mutate({ targetId: t.id })}
                    >
                      <Send className="size-3.5" />
                      {t.slackStatus === "sent" ? "Sent" : "Notify"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${t.amplifier.name} assignment`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ targetId: t.id })}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
          </div>
        ))}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add amplification assignment</DialogTitle>
            <DialogDescription>
              Plan one action. Notifications and publishing happen separately.
            </DialogDescription>
          </DialogHeader>
          {adding && (
            <AddAssignment
              posts={data?.posts ?? []}
              done={async () => {
                await refresh();
                setAdding(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.amplifier.name}</DialogTitle>
            <DialogDescription>
              Coordinate this action and its output.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <AssignmentEditor
              key={editing.id}
              target={editing}
              done={async () => {
                await refresh();
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AddAssignment({
  posts,
  done,
}: {
  posts: Data["posts"];
  done: () => Promise<void>;
}) {
  const { data } = useQuery(orpc.amplifier.list.queryOptions({ input: {} }));
  const [postId, setPostId] = useState(posts[0]?.id ?? "");
  const [amplifierId, setAmplifierId] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("linkedin");
  const [action, setAction] = useState("repost");
  const [copy, setCopy] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const create = useMutation(orpc.amplifier.create.mutationOptions());
  const request = useMutation(orpc.amplifier.addTarget.mutationOptions());
  const [busy, setBusy] = useState(false);
  const source = posts.find((p) => p.id === postId);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          let id = amplifierId === "new" ? createdId : amplifierId;
          if (!id && amplifierId === "new") {
            id = (await create.mutateAsync({ name: name.trim() })).id;
            setCreatedId(id);
          }
          if (!id) throw new Error("Choose an amplifier");
          await request.mutateAsync({
            platformPostId: postId,
            amplifierId: id,
            destinationPlatform: amplificationPlatformSchema.parse(destination),
            actionKind: amplificationActionSchema.parse(action),
            draftText: copy || undefined,
          });
          await done();
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not save assignment",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-1 text-sm">
        Source post
        <SimpleSelect
          value={postId}
          options={posts.map((p) => ({
            value: p.id,
            label: `${label(p.platform)} · ${p.title ?? "Untitled"}`,
          }))}
          onValueChange={setPostId}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Amplifier
        <SimpleSelect
          value={amplifierId}
          placeholder="Choose contact"
          options={[
            ...(data?.amplifiers ?? []).map((a) => ({
              value: a.id,
              label: a.name,
            })),
            { value: "new", label: "New contact…" },
          ]}
          onValueChange={setAmplifierId}
        />
      </label>
      {amplifierId === "new" && (
        <Input
          placeholder="Contact name"
          value={name}
          disabled={!!createdId}
          onChange={(e) => setName(e.target.value)}
          required
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          Destination
          <SimpleSelect
            value={destination}
            options={options(amplificationPlatformSchema.options)}
            onValueChange={(v) => {
              setDestination(v);
              if (source?.platform !== v) setAction("adaptation");
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          Action
          <SimpleSelect
            value={action}
            options={options(amplificationActionSchema.options)}
            onValueChange={setAction}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        Suggested copy
        <Textarea
          value={copy}
          onChange={(e) => setCopy(e.target.value)}
          rows={3}
        />
      </label>
      <Button type="submit" disabled={busy || !postId || !amplifierId}>
        {busy ? "Saving…" : "Add assignment"}
      </Button>
    </form>
  );
}

function AssignmentEditor({
  target: t,
  done,
}: {
  target: Target;
  done: () => Promise<void>;
}) {
  const { data } = useQuery(orpc.amplifier.list.queryOptions({ input: {} }));
  const [copy, setCopy] = useState(t.draftText ?? "");
  const [notes, setNotes] = useState(t.notes ?? "");
  const [handoff, setHandoff] = useState(t.amplifier.handoffPreference);
  const [slack, setSlack] = useState(t.amplifier.slackUserId ?? "");
  const [brandId, setBrandId] = useState(t.amplifier.linkedBrandId ?? "none");
  const [busy, setBusy] = useState(false);
  const update = useMutation(orpc.amplifier.updateTarget.mutationOptions());
  const contact = useMutation(orpc.amplifier.update.mutationOptions());
  const output = useMutation(orpc.amplifier.createOutput.mutationOptions());
  const save = async (createOutput = false) => {
    if (busy) return;
    setBusy(true);
    try {
      if (
        handoff !== t.amplifier.handoffPreference ||
        slack !== (t.amplifier.slackUserId ?? "") ||
        brandId !== (t.amplifier.linkedBrandId ?? "none")
      )
        await contact.mutateAsync({
          id: t.amplifierId,
          handoffPreference: handoff,
          slackUserId: slack || null,
          linkedBrandId: brandId === "none" ? null : brandId,
        });
      await update.mutateAsync({
        targetId: t.id,
        notes,
        ...(copy !== (t.draftText ?? "")
          ? t.outputPlatformPostId
            ? { outputText: copy }
            : { draftText: copy }
          : {}),
      });
      if (createOutput) await output.mutateAsync({ targetId: t.id });
      await done();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save assignment",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-muted-foreground">
        {label(t.destinationPlatform)} · {label(t.actionKind)}
        {t.outputPlatformPostId
          ? ` · ${label(t.outputStatus ?? "draft")} under the linked personal brand`
          : ""}
      </p>
      <label className="block space-y-1 text-sm">
        {t.outputPlatformPostId ? "Output copy" : "Suggested copy"}
        <Textarea
          value={copy}
          onChange={(e) => setCopy(e.target.value)}
          rows={4}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Notes
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </label>
      <details className="space-y-3 rounded-lg border p-3">
        <summary className="cursor-pointer text-sm">
          Contact & personal brand
        </summary>
        <p className="text-xs text-muted-foreground">
          These settings apply to this contact across assignments.
        </p>
        <SimpleSelect
          aria-label="Handoff preference"
          value={handoff}
          options={[
            { value: "manual", label: "Manual handoff" },
            { value: "slack", label: "Slack handoff" },
          ]}
          onValueChange={(v) => setHandoff(v as "manual" | "slack")}
        />
        {handoff === "slack" && (
          <Input
            aria-label="Slack member ID"
            placeholder="Slack member ID (optional with a coordinator)"
            value={slack}
            onChange={(e) => setSlack(e.target.value)}
          />
        )}
        <label className="block space-y-1 text-sm">
          Personal brand
          <SimpleSelect
            value={brandId}
            disabled={!!t.outputPlatformPostId}
            options={[
              { value: "none", label: "Lightweight contact" },
              ...(data?.brands ?? []).map((b) => ({
                value: b.id,
                label: b.name,
              })),
            ]}
            onValueChange={setBrandId}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          A personal brand enables drafts and planning. Connecting an account is
          optional.
        </p>
        <Link href="/app/brands" className="text-xs underline">
          Manage personal brands
        </Link>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save"}
        </Button>
        {!t.outputPlatformPostId &&
          brandId !== "none" &&
          t.actionKind !== "comment" &&
          t.ask !== "fulfilled" && (
            <Button
              disabled={busy}
              variant="outline"
              type="button"
              onClick={() => void save(true)}
            >
              Create output draft
            </Button>
          )}
      </div>
    </form>
  );
}
