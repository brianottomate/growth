"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/** Proposes audiences from the brand's evidence and adds them to the campaign. */
export function SuggestAudiencesButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const suggest = useMutation(
    orpc.ads.suggestCampaignAudiences.mutationOptions(),
  );
  const link = useMutation(orpc.ads.linkAudience.mutationOptions());
  const add = useMutation(orpc.ads.addAudience.mutationOptions());
  const busy =
    suggest.isPending || add.isPending || link.isPending || refreshing;

  const run = async () => {
    try {
      const { suggestions } = await suggest.mutateAsync({ campaignId });
      for (const s of suggestions) {
        const audience = await add.mutateAsync({
          campaignId,
          name: s.name,
          ageMin: s.ageMin,
          ageMax: s.ageMax,
          countries: s.countries.length ? s.countries : undefined,
          states: s.states.length ? s.states : undefined,
          regions: s.regions.length ? s.regions : undefined,
          cities: s.cities.length ? s.cities : undefined,
        });
        if (s.platformAudienceId)
          await link.mutateAsync({
            platformAudienceId: s.platformAudienceId,
            audienceId: audience.id,
          });
      }
      if (!suggestions.length) toast.info("No new audience to suggest");
      else
        toast.success(
          suggestions.length === 1
            ? `Added ${suggestions[0]!.name}`
            : `Added ${suggestions.length} audiences`,
        );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
    startTransition(() => router.refresh());
  };

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => void run()}
    >
      <Sparkles className="size-3.5" />
      {busy ? "Suggesting…" : "Suggest audiences"}
    </Button>
  );
}
