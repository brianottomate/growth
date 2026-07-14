"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

export function ContentSuggestions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = trpc.contentSuggestion.pending.queryOptions();
  const { data, isLoading } = useQuery(query);
  const resolve = useMutation(
    trpc.contentSuggestion.resolve.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(query),
      onError: (error) => toast.error(error.message),
    }),
  );

  if (isLoading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading suggestions…
      </p>
    );
  }
  if (!data?.length) {
    return (
      <div className="bg-card text-muted-foreground rounded-xl border p-5 text-sm">
        No classification or amplification decisions are waiting.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((suggestion) => {
        const busy =
          resolve.isPending && resolve.variables?.id === suggestion.id;
        return (
          <article
            key={suggestion.id}
            className="bg-card rounded-xl border p-4"
          >
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold capitalize">
                    {suggestion.kind.replaceAll("_", " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {suggestion.brand?.name ?? "Brand"} ·{" "}
                    {suggestion.subjectPost?.platform}
                  </span>
                  {suggestion.confidence != null && (
                    <span className="text-muted-foreground">
                      {Math.round(suggestion.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-sm">
                  {suggestion.subjectPost?.text || "Post without text"}
                </p>
                {suggestion.reasoning && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {suggestion.reasoning}
                  </p>
                )}
                <pre className="bg-muted text-muted-foreground mt-3 overflow-x-auto rounded-lg p-2 text-[11px]">
                  {JSON.stringify(suggestion.proposed, null, 2)}
                </pre>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    resolve.mutate({ id: suggestion.id, accept: false })
                  }
                >
                  <X className="size-3.5" /> Reject
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    resolve.mutate({ id: suggestion.id, accept: true })
                  }
                >
                  <Check className="size-3.5" /> Accept
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
