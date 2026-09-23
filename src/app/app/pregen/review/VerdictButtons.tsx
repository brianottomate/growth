"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/orpc/client";

type Verdict = "send_worthy" | "regenerate" | "skip";

const VERDICTS: { verdict: Verdict; label: string; active: string }[] = [
  {
    verdict: "send_worthy",
    label: "Send-worthy",
    active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  {
    verdict: "regenerate",
    label: "Regenerate",
    active: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  },
  {
    verdict: "skip",
    label: "Skip",
    active: "border-foreground/40 bg-foreground/10 text-foreground",
  },
];

/**
 * The verdict on one built site, cast from the page that shows it.
 *
 * `regenerate` and `skip` are both refusals but say opposite things about the
 * prospect: regenerate is worth another build, skip is stop spending builds
 * here. Collapsing them loses the only signal that tells a rebuild queue from
 * a dead end.
 */
export function VerdictButtons({
  buildId,
  initial,
}: {
  buildId: string;
  initial: Verdict | null;
}) {
  // Held locally rather than refetched: this page is a stack of ten heavy
  // iframes, and a router refresh under the reviewer would reload every one of
  // them to redraw three buttons.
  const [verdict, setVerdict] = useState<Verdict | null>(initial);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation(
    orpc.leads.setPregenVerdict.mutationOptions({
      onError: (mutationError) => {
        setError(mutationError.message);
        setVerdict(initial);
      },
    }),
  );

  function cast(next: Verdict) {
    // Clicking the cast verdict clears it, so a mis-click leaves nothing behind
    // rather than needing a fourth "unjudged" state.
    const value = verdict === next ? null : next;
    setError(null);
    setVerdict(value);
    mutation.mutate({ buildId, verdict: value });
  }

  return (
    <span className="flex items-center gap-1.5">
      {VERDICTS.map((option) => (
        <button
          key={option.verdict}
          type="button"
          onClick={() => cast(option.verdict)}
          aria-pressed={verdict === option.verdict}
          className={`rounded border px-2 py-0.5 text-xs transition-colors ${
            verdict === option.verdict
              ? option.active
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </span>
  );
}
