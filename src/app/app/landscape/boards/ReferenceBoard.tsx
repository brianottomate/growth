"use client";
/* oxlint-disable nextjs/no-img-element -- reference previews use imported social and workspace media URLs */
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import {
  type BoardDetail,
  type BoardProposal,
  boardProposalSchema,
} from "@/lib/reference-board";

type Proposal = BoardDetail["proposals"][number];
function BoardEditor({
  board,
  close,
}: {
  board: BoardDetail["board"];
  close: () => void;
}) {
  const [name, setName] = useState(board.name);
  const [brief, setBrief] = useState(board.brief);
  const client = useQueryClient();
  const save = useMutation(
    orpc.referenceBoard.save.mutationOptions({
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: orpc.referenceBoard.key() });
        close();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          id: board.id,
          brandId: board.brandId,
          name,
          brief,
          archived: board.archived,
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        Name
        <Input
          required
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Brief
        <Textarea
          rows={7}
          maxLength={12000}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Who is this for, and what should the work achieve?"
        />
      </label>
      <Button type="submit" disabled={save.isPending}>
        Save board
      </Button>
    </form>
  );
}
function ProposalEditor({
  data,
  initial,
  close,
}: {
  data: BoardDetail;
  initial?: Proposal;
  close: () => void;
}) {
  const [value, setValue] = useState<BoardProposal>(
    initial?.document ?? {
      kind: "content",
      title: "",
      hook: "",
      copy: "",
      visualDirection: "",
      cta: "",
      rationale: "",
      referenceIds: data.references.filter((r) => r.view).map((r) => r.id),
    },
  );
  const client = useQueryClient();
  const save = useMutation(
    orpc.referenceBoard.saveProposal.mutationOptions({
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: orpc.referenceBoard.key() });
        close();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const fields = [
    ["title", "Working title", 200],
    ["hook", "Hook / headline", 300],
    ["copy", "Copy direction / ad body", 5000],
    ["visualDirection", "Visual direction", 5000],
    ["cta", "Call to action", 60],
    ["rationale", "Why this fits the brand", 5000],
  ] as const;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = boardProposalSchema.safeParse(value);
        if (!parsed.success) {
          toast.error(
            parsed.error.issues[0]?.message ?? "Check the proposal fields.",
          );
          return;
        }
        save.mutate({
          boardId: data.board.id,
          id: initial?.id,
          document: parsed.data,
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        Draft destination
        <SimpleSelect
          value={value.kind}
          onValueChange={(kind) =>
            setValue({ ...value, kind: kind === "ad" ? "ad" : "content" })
          }
          options={[
            { value: "content", label: "Content idea" },
            { value: "ad", label: "Ad studio" },
          ]}
        />
      </label>
      {fields.map(([field, label, max]) => (
        <label key={field} className="block space-y-1 text-sm">
          {label}
          {max <= 300 ? (
            <Input
              required={field === "title"}
              maxLength={max}
              value={value[field]}
              onChange={(e) => setValue({ ...value, [field]: e.target.value })}
            />
          ) : (
            <Textarea
              maxLength={max}
              rows={3}
              value={value[field]}
              onChange={(e) => setValue({ ...value, [field]: e.target.value })}
            />
          )}
        </label>
      ))}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">References used</legend>
        {data.references.map((r, i) => (
          <label key={r.id} className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={value.referenceIds.includes(r.id)}
              disabled={!r.view && !value.referenceIds.includes(r.id)}
              onChange={(e) =>
                setValue({
                  ...value,
                  referenceIds: e.target.checked
                    ? [...value.referenceIds, r.id]
                    : value.referenceIds.filter((id) => id !== r.id),
                })
              }
            />
            {i + 1}. {r.view?.title ?? "Unavailable reference"}
          </label>
        ))}
        {value.referenceIds
          .filter((id) => !data.references.some((r) => r.id === id))
          .map((id) => (
            <label key={id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked
                onChange={() =>
                  setValue({
                    ...value,
                    referenceIds: value.referenceIds.filter((x) => x !== id),
                  })
                }
              />
              Removed reference · uncheck to continue
            </label>
          ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Saving keeps this proposal on the board. Accept a saved proposal to
        create its local draft.
      </p>
      <Button type="submit" disabled={save.isPending}>
        Save proposal
      </Button>
    </form>
  );
}
function ReferenceNote({
  reference,
  boardId,
  disabled,
}: {
  reference: BoardDetail["references"][number];
  boardId: string;
  disabled: boolean;
}) {
  const [editedNote, setNote] = useState<string | null>(null);
  const note = editedNote ?? reference.note;
  const client = useQueryClient();
  const save = useMutation(
    orpc.referenceBoard.editReferences.mutationOptions({
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: orpc.referenceBoard.key() });
        setNote(null);
        toast.success("Note saved");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ boardId, entries: [{ id: reference.id, note }] });
      }}
    >
      <Textarea
        aria-label={`Note for ${reference.view?.title ?? "unavailable reference"}`}
        maxLength={5000}
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled || save.isPending || note === reference.note}
      >
        Save note
      </Button>
    </form>
  );
}
function MediaPicker({
  board,
  close,
}: {
  board: BoardDetail["board"];
  close: () => void;
}) {
  const query = useQuery(
    orpc.referenceBoard.media.queryOptions({
      input: { brandId: board.brandId },
    }),
  );
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  const client = useQueryClient();
  const add = useMutation(
    orpc.referenceBoard.addReference.mutationOptions({
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: orpc.referenceBoard.key() });
        close();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <div className="space-y-4">
      {query.error && <p role="alert">{query.error.message}</p>}
      <label className="block space-y-1 text-sm">
        Approved media
        <SimpleSelect
          value={id}
          onValueChange={setId}
          placeholder="Choose media"
          options={(query.data?.assets ?? []).map((a) => ({
            value: a.id,
            label: a.title,
          }))}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Note
        <Textarea
          maxLength={5000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <Button
        disabled={!id || add.isPending}
        onClick={() =>
          add.mutate({ boardId: board.id, source: { kind: "media", id }, note })
        }
      >
        Add reference
      </Button>
      {query.data && !query.data.assets.length && (
        <p className="text-sm text-muted-foreground">
          This brand has no approved media yet. Add media in its library or save
          an imported post from Landscape.
        </p>
      )}
    </div>
  );
}
export function ReferenceBoard({ id }: { id: string }) {
  const query = useQuery(
    orpc.referenceBoard.get.queryOptions({ input: { id } }),
  );
  const client = useQueryClient();
  const [editor, setEditor] = useState<"board" | "media" | "proposal" | null>(
    null,
  );
  const [editing, setEditing] = useState<Proposal | undefined>();
  const [review, setReview] = useState<Proposal | null>(null);
  const invalidate = () =>
    client.invalidateQueries({ queryKey: orpc.referenceBoard.key() });
  const save = useMutation(
    orpc.referenceBoard.save.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );
  const editRefs = useMutation(
    orpc.referenceBoard.editReferences.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );
  const accept = useMutation(
    orpc.referenceBoard.acceptProposal.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setReview(null);
        toast.success("Local draft created");
      },
      onError: async (e) => {
        toast.error(e.message);
        await invalidate();
        setReview(null);
      },
    }),
  );
  const data = query.data;
  if (!data)
    return (
      <div className="p-6" role={query.error ? "alert" : undefined}>
        {query.error?.message ?? "Loading reference board…"}
      </div>
    );
  const { board } = data;
  function move(index: number, delta: number) {
    if (!data) return;
    const entries = data.references.map((r) => ({ id: r.id }));
    [entries[index], entries[index + delta]] = [
      entries[index + delta]!,
      entries[index]!,
    ];
    editRefs.mutate({ boardId: id, entries, reorder: true });
  }
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 @xl:p-6">
      <Link
        href="/app/landscape/boards"
        className="text-sm text-muted-foreground underline"
      >
        All reference boards
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {board.brandName}
            {board.archived ? " · Archived" : ""}
          </p>
          <h1 className="text-2xl font-semibold break-words">{board.name}</h1>
          <p className="mt-2 max-w-3xl text-sm whitespace-pre-wrap">
            {board.brief ||
              "Add a brief to explain what this board should inspire."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditor("board")}>
            Edit brief
          </Button>
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate({ ...board, archived: !board.archived })}
          >
            {board.archived ? "Restore board" : "Archive"}
          </Button>
        </div>
      </header>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">
            References{" "}
            <span className="text-muted-foreground">
              {data.references.length}
            </span>
          </h2>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/app/landscape">Browse posts</Link>
            </Button>
            <Button
              variant="outline"
              disabled={board.archived}
              onClick={() => setEditor("media")}
            >
              Add brand media
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {data.references.map((r, i) => (
            <article
              key={r.id}
              className="min-w-0 overflow-hidden rounded-xl border bg-card"
            >
              {r.view?.imageUrl && (
                <img
                  src={r.view.imageUrl}
                  alt={r.view.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full bg-muted object-contain"
                />
              )}
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Reference {i + 1}
                    </p>
                    <h3 className="font-medium">
                      {r.view?.title ?? "Source unavailable"}
                    </h3>
                  </div>
                  {r.view?.url && (
                    <a
                      href={r.view.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open source"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
                {r.view?.text && (
                  <p className="line-clamp-5 text-sm whitespace-pre-wrap text-muted-foreground">
                    {r.view.text}
                  </p>
                )}
                {!r.view && (
                  <p className="text-sm text-muted-foreground">
                    The source was removed or is no longer visible to this
                    workspace.
                  </p>
                )}
                <ReferenceNote
                  reference={r}
                  boardId={id}
                  disabled={board.archived}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move reference earlier"
                    disabled={board.archived || editRefs.isPending || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move reference later"
                    disabled={
                      board.archived ||
                      editRefs.isPending ||
                      i === data.references.length - 1
                    }
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={board.archived || editRefs.isPending}
                    onClick={() =>
                      editRefs.mutate({
                        boardId: id,
                        entries: [],
                        removeId: r.id,
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!data.references.length && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Save an imported post from Landscape or add a reference from this
            brand’s media library.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Proposals</h2>
            <p className="text-sm text-muted-foreground">
              Write a direction here or ask the assistant to shape one from
              these references.
            </p>
          </div>
          <Button
            disabled={board.archived}
            onClick={() => {
              setEditing(undefined);
              setEditor("proposal");
            }}
          >
            New proposal
          </Button>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2">
          {data.proposals.map((p) => (
            <article
              key={p.id}
              className="space-y-3 rounded-xl border bg-card p-5"
            >
              <p className="text-xs text-muted-foreground">
                {p.document.kind === "ad" ? "Ad studio" : "Content idea"} ·{" "}
                {p.acceptedAt ? "Accepted" : "Proposal"}
              </p>
              <h3 className="text-lg font-medium">{p.document.title}</h3>
              <ProposalBody proposal={p} references={data.references} />
              <div className="flex flex-wrap gap-2">
                {p.acceptedAt ? (
                  p.draftUrl ? (
                    <Button asChild variant="outline">
                      <Link href={p.draftUrl}>Open draft</Link>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      The accepted draft is no longer available.
                    </p>
                  )
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={board.archived}
                      onClick={() => {
                        setEditing(p);
                        setEditor("proposal");
                      }}
                    >
                      Edit proposal
                    </Button>
                    <Button
                      disabled={board.archived || accept.isPending}
                      onClick={() => setReview(p)}
                    >
                      Review and accept
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editor === "board"
                ? "Edit board"
                : editor === "media"
                  ? "Add brand media"
                  : "Shape a proposal"}
            </DialogTitle>
            <DialogDescription>
              {board.brandName} · {board.name}
            </DialogDescription>
          </DialogHeader>
          {editor === "board" && (
            <BoardEditor board={board} close={() => setEditor(null)} />
          )}
          {editor === "media" && (
            <MediaPicker board={board} close={() => setEditor(null)} />
          )}
          {editor === "proposal" && (
            <ProposalEditor
              data={data}
              initial={editing}
              close={() => setEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !accept.isPending) setReview(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Accept {review?.document.title}</DialogTitle>
            <DialogDescription>
              Create one{" "}
              {review?.document.kind === "ad"
                ? "ad shell in Ad studio"
                : "content idea"}{" "}
              for {board.brandName}. You can continue editing it there.
              Reference media stays on this board.
            </DialogDescription>
          </DialogHeader>
          {review && (
            <>
              <ProposalBody proposal={review} references={data.references} />
              <Button
                disabled={accept.isPending}
                onClick={() =>
                  accept.mutate({
                    boardId: id,
                    id: review.id,
                    reviewed: review.document,
                  })
                }
              >
                Accept and create draft
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ProposalBody({
  proposal,
  references,
}: {
  proposal: Proposal;
  references: BoardDetail["references"];
}) {
  const d = proposal.document;
  return (
    <div className="space-y-3 text-sm">
      {d.hook && <p className="font-medium">{d.hook}</p>}
      {d.copy && <p className="whitespace-pre-wrap">{d.copy}</p>}
      {d.visualDirection && (
        <div>
          <p className="font-medium">Visual direction</p>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {d.visualDirection}
          </p>
        </div>
      )}
      {d.cta && <p>CTA: {d.cta}</p>}
      {d.rationale && (
        <p className="whitespace-pre-wrap text-muted-foreground">
          {d.rationale}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        References:{" "}
        {d.referenceIds.length
          ? d.referenceIds
              .map((id) => {
                const index = references.findIndex((r) => r.id === id);
                return index >= 0
                  ? `${index + 1}${references[index]?.view ? "" : " (unavailable)"}`
                  : "removed";
              })
              .join(", ")
          : "None selected"}
      </p>
    </div>
  );
}
