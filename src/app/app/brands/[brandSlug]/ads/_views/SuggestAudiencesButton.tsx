"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import type { AudienceSuggestion } from "@/server/services/campaign-audience-suggestions.service";
/** Generation proposes; the operator reviews before local creation. */
export function useSuggestedAudiences(campaignId: string) {
  const router = useRouter();
  const [proposals, setProposals] = useState<AudienceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const suggest = useMutation(
    orpc.ads.suggestCampaignAudiences.mutationOptions(),
  );
  const link = useMutation(orpc.ads.linkAudience.mutationOptions());
  const add = useMutation(orpc.ads.addAudience.mutationOptions());
  const busy = suggest.isPending || add.isPending || link.isPending;
  const run = async () => {
    try {
      const result = await suggest.mutateAsync({ campaignId });
      setProposals(result.suggestions);
      setChosen(new Set(result.suggestions.map((_, i) => i)));
      if (result.suggestions.length) setOpen(true);
      else toast.info("No additional audiences suggested");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not suggest audiences",
      );
    }
  };
  const save = async () => {
    let saved = 0;
    try {
      for (const [i, s] of proposals.entries()) {
        if (!chosen.has(i)) continue;
        const audience = await add.mutateAsync({
          campaignId,
          name: s.name,
          personaId: s.personaId ?? undefined,
          description: s.why,
          homeIds: s.homeIds,
          ageMin: s.ageMin ?? undefined,
          ageMax: s.ageMax ?? undefined,
          countries: s.countries,
          states: s.states,
          regions: s.regions,
          cities: s.cities,
        });
        // Remove successful entries immediately so retry cannot create them twice.
        setChosen((previous) => {
          const next = new Set(previous);
          next.delete(i);
          return next;
        });
        saved++;
        if (s.platformAudienceId)
          await link.mutateAsync({
            platformAudienceId: s.platformAudienceId,
            audienceId: audience.id,
          });
      }
      setOpen(false);
      toast.success(
        `Added ${saved} campaign audience${saved === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save audience",
      );
    }
    router.refresh();
  };
  const review = (
    <SimpleDialog
      title="Review proposed campaign audiences"
      description="Personas and brand evidence inform these proposals. Saving creates local campaign audiences; it does not change Meta or start ads."
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value);
      }}
      footer={
        <Button disabled={busy || !chosen.size} onClick={() => void save()}>
          {busy ? "Saving…" : "Add selected audiences"}
        </Button>
      }
    >
      <div className="space-y-4">
        {proposals.map((proposal, i) => (
          <article key={i} className="space-y-2 rounded-lg border p-3">
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.has(i)}
                onChange={(e) =>
                  setChosen((previous) => {
                    const next = new Set(previous);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
              />
              <span>{proposal.name}</span>
            </label>
            <Input
              aria-label="Audience name"
              value={proposal.name}
              onChange={(e) =>
                setProposals((previous) =>
                  previous.map((p, j) =>
                    j === i ? { ...p, name: e.target.value } : p,
                  ),
                )
              }
            />
            <p className="text-xs text-muted-foreground">{proposal.why}</p>
            <p className="text-xs">
              {[
                ...proposal.countries,
                ...proposal.states,
                ...proposal.cities,
              ].join(", ") || "No geographic narrowing"}{" "}
              ·{" "}
              {proposal.ageMin == null && proposal.ageMax == null
                ? "No age narrowing"
                : `Ages ${proposal.ageMin ?? 13}–${proposal.ageMax ?? "65+"}`}
            </p>
            {proposal.homeIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {proposal.homeIds.length} relevant homes selected from brand
                evidence
              </p>
            )}
          </article>
        ))}
      </div>
    </SimpleDialog>
  );
  return { busy, run, review };
}
export function SuggestAudiencesButton({ campaignId }: { campaignId: string }) {
  const { busy, run, review } = useSuggestedAudiences(campaignId);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void run()}
      >
        <Sparkles className="size-3.5" />
        {busy ? "Suggesting…" : "Suggest audiences"}
      </Button>
      {review}
    </>
  );
}
