"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

/** Attach selected brand ads; creative and approval keep their existing state. */
export function AddExistingAdsDialog({
  brandId,
  campaignId,
  studioPath,
}: {
  brandId: string;
  campaignId: string;
  studioPath: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const ads = useQuery({
    ...orpc.ads.brandAds.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const available = (ads.data ?? []).filter((ad) => !ad.campaignId);
  const selected = picked.filter((id) => available.some((ad) => ad.id === id));
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
            void ads.refetch();
          }
        }
      }}
      title="Add existing ads"
      size="lg"
      trigger={
        <Button size="sm" variant="outline">
          Add existing ads
        </Button>
      }
      footer={
        <Button
          size="sm"
          disabled={!selected.length || ads.isPending || ads.isError}
          loading={attach.isPending}
          onClick={() =>
            attach.mutate({ brandId, campaignId, adIds: selected })
          }
        >
          Add {selected.length || "selected"} ads
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose unassigned ads from this brand’s Ad Studio. Drafts can be
          edited here and reviewed before delivery.
        </p>
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
          <ul className="max-h-96 divide-y overflow-auto rounded-lg border">
            {available.map((ad) => (
              <li key={ad.id} className="p-3">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    disabled={attach.isPending}
                    checked={selected.includes(ad.id)}
                    onChange={(event) =>
                      setPicked(
                        event.target.checked
                          ? [...selected, ad.id]
                          : selected.filter((id) => id !== ad.id),
                      )
                    }
                  />
                  <span>
                    {ad.name}
                    <span className="block text-xs text-muted-foreground">
                      {ad.type === "text" ? "Text" : "Creative"} ·{" "}
                      {ad.status === "approved" ? "Approved" : "Draft"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No unassigned ads are available. Create an ad here, or prepare a
            batch in Ad Studio.
          </p>
        )}
        <Link
          href={studioPath}
          className="text-sm underline underline-offset-4"
        >
          Open Ad Studio
        </Link>
      </div>
    </SimpleDialog>
  );
}
