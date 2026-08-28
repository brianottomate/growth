"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/trpc/react";

type GoogleConfig = {
  campaignType?: "search" | "display";
  keywords?: string[];
  negativeKeywords?: string[];
  businessName?: string;
};

/**
 * Google needs two things the first-party campaign cannot express: a campaign
 * TYPE, which decides everything else, and keywords, without which a Search
 * campaign buys nothing. Kept beside the campaign rather than asked at push
 * time so the decision is reviewable before anyone spends.
 */
export function GoogleSettings({
  campaignId,
  config,
}: {
  campaignId: string;
  config: GoogleConfig | undefined;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [campaignType, setCampaignType] = useState<"search" | "display">(
    config?.campaignType ?? "search",
  );
  const [keywords, setKeywords] = useState((config?.keywords ?? []).join("\n"));
  const [negatives, setNegatives] = useState(
    (config?.negativeKeywords ?? []).join("\n"),
  );

  const save = useMutation(
    trpc.ads.setCampaignPlatformConfig.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );

  const lines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const configured = Boolean(config?.campaignType);
  const searchWithoutKeywords =
    config?.campaignType === "search" && (config.keywords ?? []).length === 0;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold">Google settings</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {configured
              ? `${config?.campaignType === "search" ? "Search" : "Display"} campaign${
                  config?.campaignType === "search"
                    ? ` · ${(config.keywords ?? []).length} keywords`
                    : ""
                }`
              : "Not set — Google needs a campaign type before it can be pushed."}
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {configured ? "Edit" : "Set up Google"}
          </Button>
        )}
      </div>

      {searchWithoutKeywords && !open && (
        <p className="text-xs text-amber-300">
          A Search campaign with no keywords buys nothing — add some before
          pushing.
        </p>
      )}

      {open && (
        <div className="border-border bg-surface-secondary/30 space-y-3 rounded-xl border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-type">Campaign type</Label>
            <select
              id="g-type"
              value={campaignType}
              onChange={(event) =>
                setCampaignType(event.target.value as "search" | "display")
              }
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs sm:w-56"
            >
              <option value="search">Search — buys keywords</option>
              <option value="display">Display — buys placements</option>
            </select>
          </div>

          {campaignType === "search" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-keywords">Keywords (one per line)</Label>
                <Textarea
                  id="g-keywords"
                  rows={4}
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder={"vacation rental pawleys island\nbeach house rental sc"}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-negatives">Negative keywords</Label>
                <Textarea
                  id="g-negatives"
                  rows={4}
                  value={negatives}
                  onChange={(event) => setNegatives(event.target.value)}
                  placeholder={"free\njobs"}
                  className="text-xs"
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Display uses the campaign&apos;s creative. Google needs a
              landscape and a square image; the first ad&apos;s creative is
              used for both until sized variants exist.
            </p>
          )}

          {save.error && (
            <p className="text-xs text-red-300">{save.error.message}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  campaignId,
                  google: {
                    campaignType,
                    keywords:
                      campaignType === "search" ? lines(keywords) : undefined,
                    negativeKeywords:
                      campaignType === "search" ? lines(negatives) : undefined,
                  },
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
