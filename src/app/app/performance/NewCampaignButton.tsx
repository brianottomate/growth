"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

/** Start with an empty campaign; its brief and delivery can be decided later. */
export function NewCampaignButton({ brandId }: { brandId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const create = useMutation(
    trpc.ads.createDraft.mutationOptions({
      onSuccess: (result) => {
        toast.success("Campaign created");
        startTransition(() => router.push(result.path));
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
      onClick={() => create.mutate({ brandId })}
    >
      <Plus className="size-3" />
      New campaign
    </Button>
  );
}
