"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/react";

/**
 * Build a static and a carousel from the client's own homes.
 *
 * An experiment sitting next to the hand-built path rather than replacing it.
 * Everything it makes is a draft: a rendered card in our media library and an
 * ad row on this campaign, with the push still deciding what runs.
 */
export function DraftFromHomesButton({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const draft = useMutation(
    trpc.ads.draftAdsFromHomes.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={draft.isPending}
        onClick={() => draft.mutate({ campaignId })}
      >
        <Sparkles className="size-3.5" />
        {draft.isPending
          ? "Rendering their homes…"
          : "Draft ads from their homes"}
      </Button>
      {draft.error && (
        <p className="max-w-sm text-right text-xs text-red-300">
          {draft.error.message}
        </p>
      )}
      {draft.data && (
        <div className="max-w-sm text-right">
          <p className="text-muted-foreground text-xs">
            Drafted {draft.data.adIds.length} ad
            {draft.data.adIds.length === 1 ? "" : "s"} from{" "}
            {draft.data.homesUsed.length} home
            {draft.data.homesUsed.length === 1 ? "" : "s"}
            {draft.data.feedRows.length > 0 &&
              ` · ${draft.data.feedRows.length} catalog rows ready`}
          </p>
          {draft.data.notes.map((note) => (
            <p key={note} className="text-muted-foreground text-[11px]">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
