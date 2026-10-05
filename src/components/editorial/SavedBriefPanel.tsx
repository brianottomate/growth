"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { BriefFields } from "./BriefFields";
import type { CreativeBrief } from "@/lib/creative-document";

export function SavedBriefPanel({
  documentId,
  draftDirty,
  hasDraft,
  onProduced,
  onDirtyChange,
}: {
  documentId: string;
  draftDirty: boolean;
  hasDraft: boolean;
  onProduced: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const client = useQueryClient();
  const [brief, setBrief] = useState<CreativeBrief | null>(null);
  const options = orpc.creativeWork.document.queryOptions({
    input: { documentId },
  });
  const query = useQuery({
    ...options,
    refetchInterval: (q) =>
      ["queued", "running"].includes(q.state.data?.run?.status ?? "")
        ? 2000
        : false,
  });
  const refresh = () => client.invalidateQueries();
  useEffect(() => {
    const refreshFromChat = () => {
      void query.refetch();
    };
    window.addEventListener("growth:write", refreshFromChat);
    return () => window.removeEventListener("growth:write", refreshFromChat);
  }, [query.refetch]);
  const save = useMutation({
    mutationFn: async () => {
      const fresh = await query.refetch();
      if (!fresh.data || !brief) throw new Error("Brief is unavailable.");
      return orpc.creativeWork.saveDocument.call({
        documentId,
        document: { ...fresh.data.document, brief },
      });
    },
    onSuccess: async () => {
      setBrief(null);
      await refresh();
    },
  });
  const produce = useMutation(
    orpc.creativeWork.produceDocument.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onProduced();
      },
    }),
  );
  useEffect(() => {
    onDirtyChange(!!brief);
  }, [brief, onDirtyChange]);
  useEffect(() => {
    if (!brief) return;
    const fn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [brief]);
  if (!query.data)
    return (
      <p className="text-sm text-muted-foreground">
        {query.error?.message ?? "Loading brief…"}
      </p>
    );
  const running = ["queued", "running"].includes(query.data.run?.status ?? "");
  const busy = running || save.isPending || produce.isPending;
  return (
    <section className="space-y-6 rounded-xl border bg-card p-5 @2xl:p-6">
      <div>
        <h2 className="text-lg font-medium">Email brief</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shape the direction here or in chat. Saving the brief leaves your
          email unchanged. Writing from it updates the draft using this
          direction.
        </p>
      </div>
      <fieldset disabled={busy} inert={busy} className="disabled:opacity-60">
        <BriefFields
          brief={brief ?? query.data.document.brief}
          onChange={setBrief}
        />
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !brief} onClick={() => save.mutate()}>
          Save brief
        </Button>
        <Button
          variant="outline"
          disabled={busy || !!brief || draftDirty}
          onClick={() => produce.mutate({ documentId })}
        >
          {hasDraft ? "Regenerate from brief" : "Write from brief"}
        </Button>
      </div>
      {(brief || draftDirty) && (
        <p className="text-sm text-muted-foreground">
          Save your brief and draft changes before generating.
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          {running
            ? "Writing the email. Editing is locked until completion."
            : "Saving…"}
        </p>
      )}
      {(save.error || produce.error) && (
        <p role="alert" className="text-sm">
          {(save.error ?? produce.error)?.message}
        </p>
      )}
    </section>
  );
}
