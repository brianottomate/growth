"use client";

import {
  campaignPath,
  type CampaignWorkspace,
} from "@/lib/campaign-navigation";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";

/**
 * The unlinked→first-party mapping: attach this platform campaign to a
 * campaign,
 * or mint one by name. Shown as quiet text when already linked — relinking
 * is rare and unlinking is a chat job.
 */
export function CampaignLink({
  brandId,
  brandSlug,
  workspace = "brand",
  platformCampaignId,
  campaign,
}: {
  brandId: string;
  brandSlug: string;
  workspace?: CampaignWorkspace;
  platformCampaignId: string;
  campaign: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const options = useQuery(
    orpc.ads.campaigns.queryOptions({ input: { brandId }, enabled: open }),
  );
  const link = useMutation(
    orpc.ads.attachPlatformCampaign.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setNewName("");
        router.refresh();
      },
    }),
  );

  if (campaign) {
    return (
      <span className="text-sm text-muted-foreground">
        Campaign:{" "}
        <Link
          href={campaignPath(brandSlug, campaign.id, workspace)}
          className="text-foreground hover:underline"
        >
          {campaign.name}
        </Link>
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
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-secondary/30 p-2">
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
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
      <span className="text-xs text-muted-foreground">or</span>
      <Input
        value={newName}
        onChange={(event) => setNewName(event.target.value)}
        placeholder="New campaign name"
        textSize="xs"
        className="h-8 w-44"
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
