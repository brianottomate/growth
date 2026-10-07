"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

export function SendToCampaign({
  brandId,
  brandSlug,
  adIds,
  onSent,
}: {
  brandId: string;
  brandSlug: string;
  adIds: string[];
  onSent: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new" | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [name, setName] = useState("");
  const campaigns = useQuery(
    orpc.ads.campaigns.queryOptions({
      input: { brandId, availableForAds: true },
      enabled: mode === "existing",
    }),
  );
  const send = useWorkspaceMutation(
    orpc.ads.attachAdSet.mutationOptions({
      onSuccess: (result) => {
        setMode(null);
        onSent();
        toast.success(
          `Sent ${result.attached} ${result.attached === 1 ? "ad" : "ads"} to ${result.campaignName}`,
        );
        router.push(
          `/app/performance/clients/${brandSlug}/campaigns/${result.campaignId}`,
        );
      },
    }),
  );
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!adIds.length}
        onClick={() => setMode("existing")}
      >
        Send to campaign
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!adIds.length}
        onClick={() => setMode("new")}
      >
        Create campaign from selection
      </Button>
      <SimpleDialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !send.isPending) setMode(null);
        }}
        title={
          mode === "new" ? "Create campaign from selection" : "Send to campaign"
        }
        footer={
          <Button
            disabled={
              !adIds.length ||
              (mode === "new" ? !name.trim() : !campaignId) ||
              send.isPending
            }
            loading={send.isPending}
            onClick={() =>
              send.mutate({
                brandId,
                adIds,
                ...(mode === "new"
                  ? { newCampaignName: name.trim() }
                  : { campaignId }),
              })
            }
          >
            {send.isPending
              ? "Preparing ads…"
              : mode === "new"
                ? "Create campaign"
                : "Send ads"}
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {adIds.length} approved {adIds.length === 1 ? "ad" : "ads"}.
            Compositions will be exported before joining the campaign.
          </p>
          {mode === "new" ? (
            <Input
              aria-label="Campaign name"
              placeholder="Campaign name"
              value={name}
              maxLength={200}
              disabled={send.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          ) : (
            <select
              aria-label="Campaign"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              disabled={campaigns.isPending || send.isPending}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">
                {campaigns.isPending
                  ? "Loading campaigns…"
                  : "Choose a campaign"}
              </option>
              {(campaigns.data ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaignDisplayName(campaign.name)}
                </option>
              ))}
            </select>
          )}
          {campaigns.isError && mode === "existing" && (
            <p role="alert" className="text-sm">
              Could not load campaigns.{" "}
              <Button variant="link" onClick={() => void campaigns.refetch()}>
                Try again
              </Button>
            </p>
          )}
          {send.error && (
            <p role="alert" className="text-sm">
              {send.error.message}
            </p>
          )}
        </div>
      </SimpleDialog>
    </>
  );
}
