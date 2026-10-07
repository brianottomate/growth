"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/compound/combobox";
import { Input } from "@/components/ui/input";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { adFormat } from "@/lib/ad-format";
import { adTypeLabel, toggleAdSelection } from "@/lib/ad-collection-groups";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

export function SendToCampaign({
  brandId,
  brandSlug,
}: {
  brandId: string;
  brandSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [name, setName] = useState("");
  const creating = campaignId === "new";
  const campaigns = useQuery(
    orpc.ads.campaigns.queryOptions({
      input: { brandId, availableForAds: true },
      enabled: open,
    }),
  );
  const ads = useQuery(
    orpc.ads.brandAds.queryOptions({ input: { brandId }, enabled: open }),
  );
  const available = (ads.data ?? []).filter(
    (ad) =>
      ad.status === "approved" &&
      !ad.campaignId &&
      adFormat(ad.content) !== "catalog",
  );
  const selected = picked.filter((id) => available.some((ad) => ad.id === id));
  const visible = available.filter((ad) =>
    `${ad.name} ${ad.home?.name ?? ""} ${adTypeLabel(ad)}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const send = useWorkspaceMutation(
    orpc.ads.attachAdSet.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        setPicked([]);
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
    <SimpleDialog
      open={open}
      onOpenChange={(next) => {
        if (send.isPending) return;
        setOpen(next);
        if (next) {
          setPicked([]);
          setSearch("");
          setCampaignId("");
          setName("");
          send.reset();
          void ads.refetch();
          void campaigns.refetch();
        }
      }}
      title="Send to campaign"
      description="Choose approved, unassigned ads and a campaign."
      size="lg"
      scrollable
      className="flex max-h-[90dvh] flex-col"
      trigger={
        <Button size="sm" variant="outline">
          Send to campaign
        </Button>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {selected.length} selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={send.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !selected.length ||
                ads.isPending ||
                ads.isError ||
                (creating
                  ? !name.trim()
                  : !campaignId || campaigns.isPending || campaigns.isError) ||
                send.isPending
              }
              loading={send.isPending}
              onClick={() =>
                send.mutate({
                  brandId,
                  adIds: selected,
                  ...(creating
                    ? { newCampaignName: name.trim() }
                    : { campaignId }),
                })
              }
            >
              {send.isPending
                ? "Preparing ads…"
                : creating
                  ? "Create campaign and send"
                  : "Send ads"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Campaign</p>
          <Combobox
            ariaLabel="Destination campaign"
            value={campaignId}
            onValueChange={setCampaignId}
            placeholder={
              campaigns.isPending
                ? "Loading campaigns…"
                : "Choose or create a campaign"
            }
            searchPlaceholder="Search campaigns…"
            disabled={send.isPending}
            options={[
              {
                value: "new",
                label: "Create new campaign",
                keywords: ["create new campaign"],
              },
              ...(campaigns.data ?? []).map((campaign) => ({
                value: campaign.id,
                label: campaignDisplayName(campaign.name),
                keywords: [campaignDisplayName(campaign.name)],
              })),
            ]}
          />
          {creating && (
            <Input
              aria-label="Campaign name"
              placeholder="Campaign name"
              value={name}
              maxLength={200}
              disabled={send.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          )}
          {campaigns.isError && !creating && (
            <p role="alert" className="text-sm">
              Could not load campaigns.{" "}
              <Button variant="link" onClick={() => void campaigns.refetch()}>
                Try again
              </Button>
            </p>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Ads</p>
          {ads.isPending ? (
            <p role="status" className="text-sm">
              Loading ads…
            </p>
          ) : ads.isError ? (
            <p role="alert" className="text-sm">
              Could not load ads.{" "}
              <Button variant="link" onClick={() => void ads.refetch()}>
                Try again
              </Button>
            </p>
          ) : !available.length ? (
            <p className="text-sm text-muted-foreground">
              No approved, unassigned ads available. Approve an ad in Studio to
              send it to a campaign.
            </p>
          ) : (
            <>
              <Input
                aria-label="Search ads to send"
                placeholder="Search ads or homes"
                value={search}
                disabled={send.isPending}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {visible.length} available
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={send.isPending || !visible.length}
                  onClick={() =>
                    setPicked(
                      toggleAdSelection(
                        selected,
                        visible.map((ad) => ad.id),
                      ),
                    )
                  }
                >
                  {visible.length > 0 &&
                  visible.every((ad) => selected.includes(ad.id))
                    ? "Deselect visible"
                    : "Select visible"}
                </Button>
              </div>
              <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                {visible.map((ad) => {
                  const photo =
                    "media" in ad.content
                      ? ad.content.media.find((item) => item.type === "image")
                          ?.url
                      : null;
                  return (
                    <li key={ad.id}>
                      <label className="flex cursor-pointer items-center gap-3 p-3">
                        <Checkbox
                          disabled={send.isPending}
                          checked={selected.includes(ad.id)}
                          onCheckedChange={() =>
                            setPicked(toggleAdSelection(selected, [ad.id]))
                          }
                        />
                        {photo && (
                          <img
                            src={photo}
                            alt=""
                            className="size-12 shrink-0 rounded-md object-cover"
                          />
                        )}
                        <span className="min-w-0 text-sm break-words">
                          {ad.name}
                          <span className="block text-xs text-muted-foreground">
                            {adTypeLabel(ad)}
                            {ad.home?.name ? ` · ${ad.home.name}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {!visible.length && (
                <p className="text-sm text-muted-foreground">
                  No ads match this search.
                </p>
              )}
            </>
          )}
        </div>
        {send.error && (
          <p role="alert" className="text-sm">
            {send.error.message}
          </p>
        )}
      </div>
    </SimpleDialog>
  );
}
