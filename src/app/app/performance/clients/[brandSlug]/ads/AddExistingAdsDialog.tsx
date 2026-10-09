"use client";

import {
  adHomeContext,
  adTypeLabel,
  groupCollectionAds,
  toggleAdSelection,
  type AdGrouping,
} from "@/lib/ad-collection-groups";
import { Input } from "@/components/ui/input";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { destinationLabel } from "@/lib/ad-preview-links";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

/** Attach selected brand ads; creative and approval keep their existing state. */
export function AddExistingAdsDialog({
  brandId,
  campaignId,
  studioHref,
  draftPreviewAction,
}: {
  brandId: string;
  campaignId: string;
  studioHref?: string;
  draftPreviewAction?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [grouping, setGrouping] = useState<AdGrouping>("home");
  const homes = useQuery({
    ...orpc.homeGroups.context.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const ads = useQuery({
    ...orpc.ads.brandAds.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const available = (ads.data ?? []).filter(
    (ad) => !ad.campaignId && ad.status === "approved",
  );
  const selected = picked.filter((id) => available.some((ad) => ad.id === id));
  const visible = available.filter((ad) =>
    `${ad.name} ${adHomeContext(ad, homes.data?.homes).label} ${adTypeLabel(ad)}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const groups = groupCollectionAds(visible, grouping, homes.data?.homes);
  const assigned = (ads.data ?? []).filter((ad) => ad.campaignId).length;
  const attach = useWorkspaceMutation(
    orpc.ads.attachAdSet.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Added ${result.attached} ads to this campaign`);
        setPicked([]);
        setOpen(false);
        void ads.refetch();
      },
    }),
  );
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(next) => {
        if (!attach.isPending) {
          setOpen(next);
          if (next) {
            setPicked([]);
            setSearch("");
            void ads.refetch();
          }
        }
      }}
      title="Add ads"
      size="lg"
      scrollable
      className="flex max-h-[90dvh] flex-col"
      trigger={
        <Button size="sm" variant="outline">
          Add ads
        </Button>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {selected.length} selected
            {selected.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={attach.isPending}
                onClick={() => setPicked([])}
              >
                Clear selection
              </Button>
            )}
          </span>
          <Button
            size="sm"
            disabled={!selected.length || ads.isPending || ads.isError}
            loading={attach.isPending}
            onClick={() =>
              attach.mutate({ brandId, campaignId, adIds: selected })
            }
          >
            {attach.isPending
              ? "Preparing ads…"
              : `Add ${selected.length || "selected"} ads`}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {(studioHref || draftPreviewAction) && (
          <div className="space-y-3 border-b pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {studioHref && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={studioHref}>Create in Studio</Link>
                </Button>
              )}
              {draftPreviewAction}
            </div>
            <p className="text-xs text-muted-foreground">
              Add approved ads for publishing, or preview Studio drafts while
              planning.
            </p>
          </div>
        )}
        {ads.isPending ? (
          <p role="status">Loading brand ads…</p>
        ) : ads.isError ? (
          <p role="alert">
            Could not load ads.{" "}
            <Button variant="link" onClick={() => void ads.refetch()}>
              Try again
            </Button>
          </p>
        ) : available.length ? (
          <div className="space-y-3">
            <Input
              aria-label="Search available ads"
              placeholder="Search ads or homes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div
              role="group"
              aria-label="Group available ads"
              className="flex flex-wrap gap-1"
            >
              {(["home", "type"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={grouping === value ? "secondary" : "ghost"}
                  aria-pressed={grouping === value}
                  onClick={() => setGrouping(value)}
                >
                  {value === "home" ? "By home" : "By ad type"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {visible.length} of {available.length} unassigned ads
              {assigned > 0
                ? ` · ${assigned} already assigned and unavailable`
                : ""}
            </p>
            <div className="max-h-96 space-y-3 overflow-auto">
              {groups.map((group) => {
                const ids = group.ads.map((ad) => ad.id);
                const allPicked = ids.every((id) => selected.includes(id));
                return (
                  <section key={group.key} className="rounded-lg border">
                    <div className="flex items-center justify-between gap-2 bg-muted/40 p-3">
                      <h3 className="min-w-0 text-sm font-medium">
                        {group.label}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          · {ids.length} ad{ids.length === 1 ? "" : "s"}
                        </span>
                      </h3>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={attach.isPending}
                        onClick={() =>
                          setPicked(toggleAdSelection(selected, ids))
                        }
                      >
                        {allPicked ? "Deselect group" : "Select group"}
                      </Button>
                    </div>
                    <ul className="divide-y">
                      {group.ads.map((ad) => {
                        const home = adHomeContext(ad, homes.data?.homes);
                        const preview =
                          "media" in ad.content
                            ? ad.content.media.find(
                                (media) => media.type === "image",
                              )?.url
                            : null;
                        const photo = home.photo ?? preview;
                        return (
                          <li key={ad.id} className="p-3">
                            <label className="flex items-start gap-3 text-sm">
                              <input
                                type="checkbox"
                                disabled={attach.isPending}
                                checked={selected.includes(ad.id)}
                                onChange={() =>
                                  setPicked(
                                    toggleAdSelection(selected, [ad.id]),
                                  )
                                }
                              />
                              {photo && (
                                <img
                                  src={photo}
                                  alt=""
                                  className="size-14 shrink-0 rounded-md object-cover"
                                />
                              )}
                              <span className="min-w-0 break-words">
                                {ad.name}
                                <span className="block text-xs font-medium">
                                  {home.label}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {adTypeLabel(ad)} ·{" "}
                                  {ad.status === "approved"
                                    ? "Approved"
                                    : "Draft"}{" "}
                                  · Unassigned
                                  {"media" in ad.content &&
                                  !ad.content.media.length &&
                                  !ad.content.ideaStudio?.document.cards.length
                                    ? " · Needs creative"
                                    : ""}
                                </span>
                                <span className="block text-xs break-all text-muted-foreground">
                                  {ad.content.linkUrl
                                    ? `Destination: ${destinationLabel(ad.content.linkUrl)}`
                                    : "No ad-specific destination"}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {!visible.length && (
                <p className="text-sm text-muted-foreground">
                  No ads match this search.{" "}
                  <Button variant="link" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No unassigned ads available.
          </p>
        )}
      </div>
    </SimpleDialog>
  );
}
