"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

/**
 * The unlinked→first-party mapping: attach this campaign to an initiative,
 * or mint one by name. Shown as quiet text when already linked — relinking
 * is rare and unlinking is a chat job.
 */
export function InitiativeLink({
  brandId,
  platformCampaignId,
  initiative,
}: {
  brandId: string;
  platformCampaignId: string;
  initiative: { id: string; name: string } | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const options = useQuery(
    trpc.ads.campaigns.queryOptions({ brandId }, { enabled: open }),
  );
  const link = useMutation(
    trpc.ads.attachPlatformCampaign.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setNewName("");
        router.refresh();
      },
    }),
  );

  if (initiative) {
    return (
      <span className="text-muted-foreground text-sm">
        Campaign: <span className="text-foreground">{initiative.name}</span>
      </span>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Link2 className="size-3.5" />
        Attach to a campaign
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface-secondary/30 flex flex-wrap items-center gap-2 rounded-md border p-2">
      <select
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        disabled={link.isPending || options.isPending}
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            link.mutate({ platformCampaignId, campaignId: event.target.value });
          }
        }}
      >
        <option value="" disabled>
          {options.isPending ? "Loading…" : "Pick a campaign"}
        </option>
        {(options.data ?? []).map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground text-xs">or</span>
      <Input
        value={newName}
        onChange={(event) => setNewName(event.target.value)}
        placeholder="New campaign name"
        className="h-8 w-44 text-xs"
      />
      <Button
        size="sm"
        className="h-8"
        disabled={!newName.trim() || link.isPending}
        loading={link.isPending}
        onClick={() =>
          link.mutate({ platformCampaignId, newCampaignName: newName.trim() })
        }
      >
        Create & link
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
      {link.error && (
        <p className="w-full text-xs text-red-300">{link.error.message}</p>
      )}
    </div>
  );
}
