"use client";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
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
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const review = useMutation(
    orpc.ads.previewAdditions.mutationOptions({
      onError: (error) => {
        if ("code" in error && error.code === "NOT_FOUND") {
          toast.error(error.message);
          router.refresh();
        }
      },
    }),
  );
  const publish = useMutation(
    orpc.ads.publishAdditions.mutationOptions({
      onSuccess: (result) => {
        for (const warning of result.warnings) toast.warning(warning);
        review.reset();
        setExpanded(false);
        router.refresh();
      },
      onError: (error) => {
        if ("code" in error && error.code === "NOT_FOUND")
          toast.error(error.message);
        // A failed attempt may have created some paused objects. Require a fresh
        // provider review before another attempt, including when a draft vanished.
        review.reset();
        router.refresh();
      },
    }),
  );
  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!group.externalId && <DeliveryGroupEditor group={group} />}
        <Button
          size="sm"
          variant="outline"
          disabled={review.isPending || publish.isPending}
          onClick={() => {
            review.reset();
            publish.reset();
            setExpanded(true);
            review.mutate({ deliveryGroupId: group.id });
          }}
        >
          {review.isPending ? "Checking Meta…" : "Review additions"}
        </Button>
      </div>
      {expanded && (
        <div
          className="space-y-3 rounded-lg border p-3 text-sm"
          aria-live="polite"
        >
          <p className="text-muted-foreground">
            Additions are created paused in this campaign. Current delivery and
            the campaign budget stay unchanged.
          </p>
          {review.isPending && (
            <p>Checking Meta and the campaign’s approved ads…</p>
          )}
          {review.error && (
            <p className="text-destructive">{review.error.message}</p>
          )}
          {review.data && (
            <>
              <p className="font-medium">
                {review.data.createsAdSet
                  ? "Create one paused ad set and add"
                  : "Add"}{" "}
                {review.data.ads.length} paused ads.
              </p>
              {review.data.ads.length > 0 && (
                <details>
                  <summary className="cursor-pointer">View ads</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {review.data.ads.map((ad) => (
                      <li key={ad.id}>{ad.name}</li>
                    ))}
                  </ul>
                </details>
              )}
              {review.data.blockers.length > 0 ? (
                <div className="space-y-1 text-destructive">
                  <p className="font-medium">Needs attention</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {review.data.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : review.data.ads.length > 0 ? (
                <Button
                  size="sm"
                  disabled={publish.isPending}
                  onClick={() =>
                    review.data &&
                    publish.mutate({
                      deliveryGroupId: group.id,
                      reviewToken: review.data.reviewToken,
                    })
                  }
                >
                  {publish.isPending
                    ? "Publishing…"
                    : "Publish additions paused"}
                </Button>
              ) : null}
            </>
          )}
          {publish.error && (
            <div className="space-y-1">
              <p className="text-destructive">{publish.error.message}</p>
              <p>Review additions again before publishing.</p>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={publish.isPending}
            onClick={() => setExpanded(false)}
          >
            Hide review
          </Button>
        </div>
      )}
    </div>
  );
}
