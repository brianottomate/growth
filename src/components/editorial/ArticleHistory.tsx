"use client";
import { articleMarkdown } from "@/lib/article-markdown";
import type { CreativeDocument } from "@/lib/creative-document";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Streamdown } from "streamdown";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

const sourceLabels: Record<string, string> = {
  baseline: "Release snapshot",
  before_edit: "Before an edit",
  before_accept: "Before accepting a candidate",
  before_restore: "Before a restore",
  before_pull: "Before CMS import",
  before_push: "Before CMS transfer",
  generated: "Generated candidate",
  editorial_review: "Editorial acceptance",
};
export function ArticleHistory({
  documentId,
  disabled,
  current,
}: {
  documentId: string;
  disabled: boolean;
  current: Extract<CreativeDocument, { type: "article" }>;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState("");
  const client = useQueryClient();
  const history = useQuery(
    orpc.creativeWork.articleHistory.queryOptions({
      input: { documentId, beforeRevisionId: cursor },
    }),
  );
  const revision = useQuery(
    orpc.creativeWork.articleRevision.queryOptions({
      input: { documentId, revisionId: selected },
      enabled: open && !!selected,
    }),
  );
  const refreshed = async () => {
    await client.invalidateQueries({ queryKey: orpc.creativeWork.key() });
    setOpen(false);
  };
  const accept = useMutation(
    orpc.creativeWork.acceptArticle.mutationOptions({
      onSuccess: async (result) => {
        await refreshed();
        toast.success(
          result.applied
            ? "Candidate applied to draft"
            : "This candidate was already accepted",
        );
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const restore = useMutation(
    orpc.creativeWork.restoreArticle.mutationOptions({
      onSuccess: async () => {
        await refreshed();
        toast.success("Snapshot restored. The previous draft is in history.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const dismiss = useMutation(
    orpc.creativeWork.dismissArticle.mutationOptions({
      onSuccess: refreshed,
      onError: (e) => toast.error(e.message),
    }),
  );
  const acceptCurrent = useMutation(
    orpc.creativeWork.acceptCurrentArticle.mutationOptions({
      onSuccess: async () => {
        await refreshed();
        toast.success("Saved article accepted");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const busy =
    disabled ||
    acceptCurrent.isPending ||
    accept.isPending ||
    restore.isPending ||
    dismiss.isPending;
  const pending =
    history.data?.revisions.filter((r) => r.status === "candidate") ?? [];
  const data = revision.data;
  function downloadMarkdown() {
    const { markdown, filename } = articleMarkdown(current);
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setOpen(true)}>
          History and candidates
          {pending.length ? ` (${pending.length} to review)` : ""}
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={downloadMarkdown}>
          Download Markdown
        </Button>
        {pending.length > 0 && (
          <p className="text-sm text-muted-foreground">
            A generated candidate is ready for review.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {history.data?.acceptance ? (
          <p className="text-sm text-muted-foreground">
            Saved draft accepted{" "}
            {new Date(history.data.acceptance.acceptedAt).toLocaleString()}.
            Editing creates a new draft for review.
          </p>
        ) : (
          <Button
            variant="outline"
            disabled={busy || !current.content.bodyMarkdown.trim()}
            onClick={() =>
              acceptCurrent.mutate({ documentId, reviewed: current })
            }
          >
            Accept saved draft
          </Button>
        )}
      </div>
      {history.error && (
        <p className="text-sm" role="alert">
          {history.error.message}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!accept.isPending && !restore.isPending && !dismiss.isPending)
            setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Article history</DialogTitle>
            <DialogDescription>
              Review a candidate or restore a prior snapshot. Applying one saves
              the current draft in history. CMS publishing is a separate action.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[15rem_1fr]">
            <div className="space-y-2">
              {history.data?.revisions.map((r) => (
                <article key={r.id} className="space-y-1 rounded-lg border p-3">
                  <p className="truncate text-sm font-medium">
                    {r.title || "Untitled article"}
                  </p>
                  <p className="text-xs">
                    {sourceLabels[r.source] ?? r.source} · {r.status}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                  <Button
                    variant={selected === r.id ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setSelected(r.id)}
                  >
                    View snapshot
                  </Button>
                </article>
              ))}
              {history.data && !history.data.revisions.length && (
                <p className="text-sm text-muted-foreground">
                  Prior drafts will appear after an edit, import or generation.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {cursor && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCursor(undefined)}
                  >
                    Latest snapshots
                  </Button>
                )}
                {history.data?.nextCursor && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setCursor(history.data.nextCursor ?? undefined)
                    }
                  >
                    Older snapshots
                  </Button>
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-4">
              {revision.error && <p role="alert">{revision.error.message}</p>}
              {!selected && (
                <p className="text-sm text-muted-foreground">
                  Choose a snapshot to inspect it.
                </p>
              )}
              {selected && revision.isPending && <p>Loading snapshot…</p>}
              {data && (
                <>
                  <header>
                    <h3 className="text-xl font-semibold">
                      {data.document.content.title || "Untitled article"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      /{data.document.content.slug} ·{" "}
                      {data.document.content.authorName}
                    </p>
                    <p className="mt-2 text-sm">
                      {data.document.content.description}
                    </p>
                  </header>
                  {data.document.content.review && (
                    <div className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">
                        Editorial review: {data.document.content.review.verdict}
                      </p>
                      <ul className="list-disc space-y-1 pl-5">
                        {data.document.content.review.findings.map(
                          (finding, i) => (
                            <li key={i}>{finding}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none">
                    <Streamdown>
                      {data.document.content.bodyMarkdown ||
                        "This snapshot has an empty body."}
                    </Streamdown>
                  </div>
                  <details className="rounded-lg border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Brief and media
                    </summary>
                    <dl className="mt-3 space-y-3">
                      {(
                        [
                          ["Purpose", data.document.brief.purpose],
                          ["Audience", data.document.brief.audience],
                          ["Direction", data.document.brief.direction],
                          ["Call to action", data.document.brief.cta],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <dt className="font-medium">{label}</dt>
                          <dd className="whitespace-pre-wrap text-muted-foreground">
                            {value || "None recorded"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 font-medium">Verified facts</p>
                    <ul className="list-disc pl-5">
                      {data.document.brief.facts.map((fact, i) => (
                        <li key={i}>
                          {fact.claim}
                          {fact.sourceUrl && (
                            <span className="block text-xs break-all text-muted-foreground">
                              {fact.sourceUrl}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 whitespace-pre-wrap">
                      {data.document.brief.constraints.join("\n")}
                    </p>
                    <p className="mt-3">
                      {data.document.brief.assets.length} media references
                      {data.document.content.heroAssetId
                        ? " · Hero image selected"
                        : ""}
                    </p>
                  </details>
                  {disabled && (
                    <p className="text-sm text-muted-foreground">
                      Save your edits and wait for the current operation before
                      applying a snapshot.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {data.status === "candidate" ? (
                      <>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            accept.mutate({ documentId, revisionId: data.id })
                          }
                        >
                          Use this candidate
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            dismiss.mutate({ documentId, revisionId: data.id })
                          }
                        >
                          Dismiss candidate
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          restore.mutate({ documentId, revisionId: data.id })
                        }
                      >
                        Restore this snapshot
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
