"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

/**
 * Adopt one platform campaign under a first-party campaign — the bridge
 * between things born in Ads Manager and things growth knows about. Attaching
 * two platform campaigns to the same campaign is just doing this twice, which
 * is why there is no multi-select here.
 */
export function AttachCampaign({
  brandId,
  platformCampaignId,
  suggestedName,
}: {
  brandId: string;
  platformCampaignId: string;
  suggestedName: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggestedName);

  const options = useQuery(
    trpc.ads.campaigns.queryOptions({ brandId }, { enabled: open }),
  );
  const attach = useMutation(
    trpc.ads.attachPlatformCampaign.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        if (result.path) router.push(result.path);
        else router.refresh();
      },
    }),
  );

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        onClick={() => setOpen(true)}
      >
        <Link2 className="size-3.5" />
        Attach
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface-secondary/30 mt-2 flex flex-wrap items-center gap-2 rounded-md border p-2">
      <select
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        disabled={attach.isPending || options.isPending}
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            attach.mutate({
              platformCampaignId,
              campaignId: event.target.value,
            });
          }
        }}
      >
        <option value="" disabled>
          {options.isPending ? "Loading…" : "Attach to an existing campaign"}
        </option>
        {(options.data ?? []).map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground text-xs">or</span>
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="New campaign name"
        className="h-8 w-56 text-xs"
      />
      <Button
        size="sm"
        className="h-8"
        disabled={!name.trim() || attach.isPending}
        loading={attach.isPending}
        onClick={() =>
          attach.mutate({ platformCampaignId, newCampaignName: name.trim() })
        }
      >
        Create &amp; attach
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
      {attach.error && (
        <p className="w-full text-xs text-red-300">{attach.error.message}</p>
      )}
    </div>
  );
}
