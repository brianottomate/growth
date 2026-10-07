"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { PLANNABLE_AD_PLATFORMS } from "@/lib/ad-platforms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/** Create a local platform draft; account, budget and delivery are reviewed separately. */
export function PlanPlatformButton({
  campaignId,
  planned,
  primary = false,
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  planned: string[];
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const router = useRouter();
  const plan = useMutation(
    orpc.ads.planPlatform.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        startTransition(() => router.refresh());
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const remaining = PLANNABLE_AD_PLATFORMS.filter(
    (platform) => !planned.includes(platform),
  );
  if (!remaining.length) return null;
  return (
    <>
      {!planned.includes("meta_ads") && (
        <Button
          size="sm"
          variant={primary ? "default" : "outline"}
          disabled={plan.isPending || refreshing}
          onClick={() => plan.mutate({ campaignId, platform: "meta_ads" })}
        >
          <ChannelLogo platform="meta_ads" className="size-4" />
          Create Meta plan
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={plan.isPending || refreshing}
        onClick={() => setOpen(true)}
      >
        <Radio className="size-3.5" />
        Add platform
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!plan.isPending) setOpen(value);
        }}
      >
        <DialogContent className="gap-4 pb-6">
          <DialogHeader className="px-0 pt-4 md:pt-0 [&_*]:text-left">
            <DialogTitle>Add platform</DialogTitle>
            <DialogDescription>
              Add a platform to prepare its budget and delivery settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {remaining.map((platform) => (
              <Button
                key={platform}
                className="h-12 justify-start"
                variant="outline"
                disabled={plan.isPending}
                onClick={() => plan.mutate({ campaignId, platform })}
              >
                <ChannelLogo platform={platform} className="size-4" />
                {platformLabel(platform)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
