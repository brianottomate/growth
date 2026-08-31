"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { platformLabel } from "@/components/channel-logos";
import { useTRPC } from "@/trpc/react";

const PLATFORMS = ["meta_ads", "google_ads", "openai_ads"] as const;

/** Plan another platform: creates its local draft row, nothing more. */
export function PlanPlatformButton({
  campaignId,
  planned,
}: {
  campaignId: string;
  planned: string[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const plan = useMutation(
    trpc.ads.planPlatform.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  const remaining = PLATFORMS.filter(
    (platform) => !planned.includes(platform),
  );
  if (remaining.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" loading={plan.isPending}>
          <Plus className="size-3.5" />
          Plan a platform
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {remaining.map((platform) => (
          <DropdownMenuItem
            key={platform}
            onSelect={() => plan.mutate({ campaignId, platform })}
          >
            {platformLabel(platform)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
