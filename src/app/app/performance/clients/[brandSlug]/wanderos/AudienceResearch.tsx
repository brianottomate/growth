"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/orpc/client";

export function AudienceResearch({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [context, setContext] = useState("");
  const [includeBookings, setIncludeBookings] = useState(false);
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set());
  const read = useMutation(
    orpc.persona.wanderOsContext.mutationOptions({
      onSuccess: (result) => setContext(result.context),
    }),
  );
  const suggest = useMutation(
    orpc.persona.suggest.mutationOptions({
      onSuccess: () => setSavedNames(new Set()),
    }),
  );
  const create = useMutation(
    orpc.persona.create.mutationOptions({
      onSuccess: (_result, input) => {
        setSavedNames((saved) => new Set([...saved, input.name]));
        router.refresh();
      },
    }),
  );
  const error = read.error ?? suggest.error ?? create.error;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold">Audience research</h2>
      <p className="text-sm text-muted-foreground">
        Prepare property and booking evidence as optional input to general
        persona suggestions. Review the proposals before saving them. Delivery
        targeting stays in platform plans.
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includeBookings}
          onChange={(e) => setIncludeBookings(e.target.checked)}
        />{" "}
        Include aggregate booking evidence
      </label>
      <Button
        size="sm"
        variant="outline"
        loading={read.isPending}
        onClick={() => read.mutate({ brandId, includeBookings })}
      >
        Prepare research context
      </Button>
      {context && (
        <>
          <Textarea
            rows={5}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            aria-label="Research context"
          />
          <Button
            size="sm"
            loading={suggest.isPending}
            onClick={() => suggest.mutate({ brandId, context })}
          >
            Suggest personas from this context
          </Button>
        </>
      )}
      {suggest.data?.suggestions.map((proposal, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">{proposal.name}</p>
          <p className="text-xs">
            {proposal.profile?.motivation ?? proposal.description}
          </p>
          <p className="text-xs text-muted-foreground">
            {proposal.profile?.evidenceNote}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={create.isPending || savedNames.has(proposal.name)}
            onClick={() => create.mutate({ brandId, ...proposal })}
          >
            {savedNames.has(proposal.name) ? "Saved" : "Save persona"}
          </Button>
        </div>
      ))}
      {suggest.data && !suggest.data.suggestions.length && (
        <p className="text-xs text-muted-foreground">
          No additional personas supported by this context.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </section>
  );
}
