"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/** One click prepares local audiences; platform delivery is a separate action. */
export function useSuggestedAudiences(campaignId: string) {
  const router = useRouter();
  const [phase, setPhase] = useState<"suggesting" | "saving" | null>(null);
  const working = phase !== null;
  const suggest = useMutation(
    orpc.ads.suggestCampaignAudiences.mutationOptions(),
  );
  const add = useMutation(orpc.ads.addAudience.mutationOptions());
  const busy = working || suggest.isPending || add.isPending;
  const run = async () => {
    if (busy) return;
    setPhase("suggesting");
    let saved = 0;
    try {
      const result = await suggest.mutateAsync({ campaignId });
      setPhase("saving");
      for (const s of result.suggestions) {
        await add.mutateAsync({
          campaignId,
          name: s.name,
          personaId: s.personaId ?? undefined,
          geography: s.geography,
          ageMin: s.ageMin,
          ageMax: s.ageMax,
          description: s.why,
        });
        saved++;
      }
      if (saved)
        toast.success(
          `Added ${saved} campaign audience${saved === 1 ? "" : "s"}`,
        );
      else toast.info("No additional audiences suggested");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not prepare audiences",
      );
      if (saved)
        toast.info(
          `${saved} audience${saved === 1 ? " was" : "s were"} saved before the error. Review them before trying again.`,
        );
    } finally {
      setPhase(null);
      router.refresh();
    }
  };
  return {
    busy,
    run,
    phase,
    label:
      phase === "saving"
        ? "Saving audiences…"
        : busy
          ? "Suggesting audiences…"
          : "Suggest audiences",
  };
}
export function SuggestAudiencesButton({ campaignId }: { campaignId: string }) {
  const { busy, run, label } = useSuggestedAudiences(campaignId);
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      onClick={() => void run()}
    >
      {!busy && <Sparkles className="size-3.5" />}
      {label}
    </Button>
  );
}
