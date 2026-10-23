"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DeliveryGroupEditor } from "./DeliveryGroupEditor";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";

export function MetaAdditions({
  group,
}: {
  group: {
    id: string;
    name: string;
    externalId: string | null;
    configuration: DeliveryGroupConfiguration | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const review = useMutation(orpc.ads.previewAdditions.mutationOptions());
  const publish = useMutation(
    orpc.ads.publishAdditions.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!group.externalId && <DeliveryGroupEditor group={group} />}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          review.reset();
          publish.reset();
          setOpen(true);
          review.mutate({ deliveryGroupId: group.id });
        }}
      >
        Review additions
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add to {group.name}</DialogTitle>
            <DialogDescription>
              New ads and ad sets are created paused in the existing campaign.
              Current delivery and the campaign budget stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {review.isPending && (
            <p className="text-sm text-muted-foreground">
              Checking Meta and the campaign’s approved ads…
            </p>
          )}
          {review.error && (
            <p className="text-sm text-destructive">{review.error.message}</p>
          )}
          {review.data && (
            <div className="space-y-3">
              <p className="text-sm">
                {review.data.createsAdSet
                  ? "Create one paused ad set and add"
                  : "Add"}{" "}
                {review.data.ads.length} paused ads:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {review.data.ads.map((ad) => (
                  <li key={ad.id}>{ad.name}</li>
                ))}
              </ul>
              {review.data.blockers.length > 0 && (
                <div className="rounded-lg border border-destructive/30 p-3 text-sm">
                  <p className="font-medium">Needs attention</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {review.data.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {publish.error && (
            <p className="text-sm text-destructive">{publish.error.message}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={publish.isPending}
            >
              Close
            </Button>
            <Button
              disabled={
                !review.data ||
                review.data.blockers.length > 0 ||
                publish.isPending
              }
              onClick={() =>
                review.data &&
                publish.mutate({
                  deliveryGroupId: group.id,
                  reviewToken: review.data.reviewToken,
                })
              }
            >
              {publish.isPending ? "Publishing…" : "Publish additions paused"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
