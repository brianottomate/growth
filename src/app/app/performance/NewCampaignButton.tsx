"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/** Start with an empty campaign; its brief and delivery can be decided later. */
export function NewCampaignButton({ brandSlug }: { brandSlug: string }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const create = useMutation(
    orpc.ads.createDraft.mutationOptions({
      onSuccess: (result) => {
        toast.success("Campaign created");
        startTransition(() =>
          router.push(
            `/app/performance/clients/${brandSlug}/campaigns/${result.campaign.id}`,
          ),
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Button
      size="sm"
      shape="round"
      density="editorial"
      disabled={create.isPending || refreshing}
      loading={create.isPending || refreshing}
      onClick={() => create.mutate({ brandSlug })}
    >
      <Plus className="size-3" />
      New campaign
    </Button>
  );
}
