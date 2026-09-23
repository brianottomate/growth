"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";

export type SuggestionLite = {
  id: string;
  platform: string;
  handle: string;
  profileUrl: string | null;
  confidence: number | null;
  verified: boolean | null;
  followerCount: number | null;
};

const followerFmt = new Intl.NumberFormat("en-US");

export function SuggestedChannels({
  brandId,
  suggestions,
  variant = "full",
}: {
  brandId: string;
  suggestions: SuggestionLite[];
  variant?: "full" | "action" | "results";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => router.refresh();

  const discoverM = useMutation(
    orpc.channelSuggestion.discover.mutationOptions({
      onSuccess: refresh,
      onError: (e) => setError(e.message),
    }),
  );
  const acceptM = useMutation(
    orpc.channelSuggestion.accept.mutationOptions({ onSuccess: refresh }),
  );
  const rejectM = useMutation(
    orpc.channelSuggestion.reject.mutationOptions({ onSuccess: refresh }),
  );

  const busyId = acceptM.isPending
    ? acceptM.variables?.id
    : rejectM.isPending
      ? rejectM.variables?.id
      : null;

  const discoverButton = (
    <Button
      variant="ghost"
      size="sm"
      tone="muted"
      onClick={() => {
        setError(null);
        discoverM.mutate({ brandId });
      }}
      loading={discoverM.isPending}
    >
      <Sparkles className="size-3.5" />
      {discoverM.isPending ? "Discovering…" : "Discover handles"}
    </Button>
  );

  if (variant === "action") {
    return (
      <div className="flex items-center gap-2">
        {discoverButton}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    );
  }

  if (variant === "results" && suggestions.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Suggested handles
          {suggestions.length > 0 && ` · ${suggestions.length}`}
        </span>
        {variant === "full" && discoverButton}
      </div>

      {error && <p className="mb-2 text-[11px] text-destructive">{error}</p>}

      {suggestions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {discoverM.isPending
            ? "Searching the web for profiles…"
            : "No pending suggestions. Run discovery to find this brand's social profiles."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {suggestions.map((s) => {
            const rowBusy = busyId === s.id;
            return (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
              >
                <ChannelLogo platform={s.platform} />
                <span className="flex flex-1 flex-col leading-tight">
                  <span className="text-xs font-medium">
                    {platformLabel(s.platform)}
                    {s.profileUrl ? (
                      <a
                        href={s.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 font-normal text-muted-foreground hover:text-foreground"
                      >
                        @{s.handle}
                      </a>
                    ) : (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        @{s.handle}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {s.confidence != null &&
                      `${Math.round(s.confidence * 100)}% confidence`}
                    {s.verified === true &&
                      s.followerCount != null &&
                      ` · ✓ ${followerFmt.format(s.followerCount)} followers`}
                    {s.verified === false && " · unverified"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  tone="muted-danger"
                  className="size-7"
                  title="Reject"
                  disabled={rowBusy}
                  onClick={() => rejectM.mutate({ id: s.id })}
                >
                  <X className="size-4" />
                </Button>
                <Button
                  size="sm"
                  className="h-7"
                  title="Accept — create channel"
                  loading={rowBusy && acceptM.isPending}
                  disabled={rowBusy}
                  onClick={() => acceptM.mutate({ id: s.id })}
                >
                  <Check className="size-3.5" />
                  Add
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
