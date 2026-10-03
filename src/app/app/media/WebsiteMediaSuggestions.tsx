"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
export function WebsiteMediaSuggestions({
  brandId,
  onUse,
  disabled = false,
  useLabel = "Use in pitch",
}: {
  brandId: string;
  onUse?: (url: string) => Promise<void> | void;
  disabled?: boolean;
  useLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const suggestions = useQuery(
    orpc.media.suggestions.queryOptions({ input: { brandId } }),
  );
  const discover = useMutation(
    orpc.media.discoverWebsiteImages.mutationOptions(),
  );
  const review = useMutation(orpc.media.reviewWebsiteImage.mutationOptions());
  const busy = disabled || discover.isPending || review.isPending;
  const refresh = async () => {
    await suggestions.refetch();
    await queryClient.invalidateQueries({ queryKey: orpc.media.list.key() });
  };
  const decide = async (
    mediaId: string,
    decision: "approve" | "reject",
    use = false,
  ) => {
    try {
      const result = await review.mutateAsync({ brandId, mediaId, decision });
      await refresh();
      if (use && result.url) await onUse?.(result.url);
      else
        toast.success(
          decision === "approve"
            ? "Image approved and saved to the library"
            : "Suggestion rejected",
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not review image");
    }
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            Suggested from their website
          </h3>
          <p className="text-xs text-muted-foreground">
            Review before use. Approval saves a hosted copy to the brand’s Pitch
            folder.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            try {
              const result = await discover.mutateAsync({ brandId });
              await refresh();
              toast.success(
                `${result.added} new suggestions from ${result.pages} page${result.pages === 1 ? "" : "s"}${result.failedPages ? ` (${result.failedPages} could not be read)` : ""}`,
              );
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Discovery failed");
            }
          }}
        >
          {discover.isPending ? "Finding photos…" : "Find website photos"}
        </Button>
      </div>
      {suggestions.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load suggestions.{" "}
          <button
            className="underline"
            onClick={() => void suggestions.refetch()}
          >
            Retry
          </button>
        </p>
      ) : suggestions.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading suggestions…</p>
      ) : !suggestions.data?.length ? (
        <p className="text-sm text-muted-foreground">
          No pending suggestions. Find photos on their website to get started.
        </p>
      ) : (
        <details
          open={expanded}
          onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Review {suggestions.data.length} suggested photos
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
            {suggestions.data.map((asset) => (
              <article
                key={asset.id}
                className="overflow-hidden rounded-lg border"
              >
                <img
                  src={asset.thumbnailUrl ?? ""}
                  alt="Website photo suggestion"
                  loading="lazy"
                  className="aspect-video w-full bg-muted object-cover"
                />
                <div className="space-y-2 p-3">
                  {asset.sourcePage && (
                    <a
                      href={asset.sourcePage}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs underline"
                    >
                      Source page ↗
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Suggested · external image
                  </p>
                  <a
                    href={asset.discoveredSourceUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs underline"
                  >
                    View original ↗
                  </a>
                  <div className="flex flex-wrap gap-2">
                    {onUse && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void decide(asset.id, "approve", true)}
                      >
                        {useLabel}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void decide(asset.id, "approve")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void decide(asset.id, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
