"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/** Two Google Search text ideas from the landing page, on demand. */
export function WriteSearchAdsButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const write = useMutation(
    orpc.ads.writeGoogleTextAds.mutationOptions({
      onSuccess: ({ created }) => {
        toast.success(
          `Saved ${created} search draft${created === 1 ? "" : "s"} in Studio. Approve and add them to this campaign.`,
        );
        startTransition(() => router.refresh());
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={write.isPending || refreshing}
      onClick={() => write.mutate({ campaignId })}
    >
      <Search className="size-3.5" />
      {write.isPending ? "Writing…" : "Write search ads"}
    </Button>
  );
}
