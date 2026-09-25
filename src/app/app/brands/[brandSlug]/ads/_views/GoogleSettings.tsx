"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/orpc/client";

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
  platformCampaignId,
  config,
  brandSlug,
  brandUrl,
  compact = false,
}: {
  /** The Google platform DRAFT row the settings live on. */
  platformCampaignId: string;
  config: GoogleConfig | undefined;
  brandSlug: string;
  brandUrl: string | null;
  /**
   * Inside a platform section the surrounding row already says which platform
   * this is and why it is blocked, so only the control is rendered.
   */
  compact?: boolean;
}) {
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
    orpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );

  // Read-only against Google: mines the brand's own site for terms and prices
  // them. The cost number is what the Google budget should be capped at —
  // beyond the point of owning the brand's terms, the money buys nothing.
  const research = useMutation(orpc.ads.researchKeywords.mutationOptions());
  const addKeyword = (keyword: string) =>
    setKeywords((current) =>
      lines(current).includes(keyword)
        ? current
        : [...lines(current), keyword].join("\n"),
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
      {compact ? (
        !open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {configured ? "Edit Google settings" : "Set up Google"}
          </Button>
        )
      ) : (
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold">Google settings</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {configured
                ? `${config?.campaignType === "search" ? "Search" : "Display"} campaign${
                    config?.campaignType === "search"
                      ? ` · ${(config.keywords ?? []).length} keywords`
                      : ""
                  }`
                : "Not set. Google needs a campaign type before it can be pushed."}
            </p>
          </div>
          {!open && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              {configured ? "Edit" : "Set up Google"}
            </Button>
          )}
        </div>
      )}

      {searchWithoutKeywords && !open && (
        <p className="text-xs text-amber-300">
          A Search campaign with no keywords buys nothing. Add some before
          pushing.
        </p>
      )}

      {open && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-secondary/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-type">Campaign type</Label>
            <select
              id="g-type"
              value={campaignType}
              onChange={(event) =>
                setCampaignType(event.target.value as "search" | "display")
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs @xl:w-56"
            >
              <option value="search">Search · buys keywords</option>
              <option value="display">Display · buys placements</option>
            </select>
          </div>

          {campaignType === "search" ? (
            <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-keywords">Keywords (one per line)</Label>
                <Textarea
                  id="g-keywords"
                  rows={4}
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder={
                    "vacation rental pawleys island\nbeach house rental sc"
                  }
                  textSize="xs"
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
                  textSize="xs"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Display uses the campaign&apos;s creative. Google needs a
              landscape and a square image; the first ad&apos;s creative is used
              for both until sized variants exist.
            </p>
          )}

          {campaignType === "search" && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">Keyword research</span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={research.isPending}
                  disabled={!brandUrl}
                  onClick={() =>
                    research.mutate({
                      brandSlug,
                      seedUrl: brandUrl ?? undefined,
                      estimateKeywords: lines(keywords).slice(0, 200),
                      countries: ["US"],
                    })
                  }
                >
                  <Search className="size-3.5" />
                  {brandUrl ? "Mine the brand site" : "No brand URL set"}
                </Button>
                {research.data && (
                  <span className="text-xs text-muted-foreground">
                    ~${research.data.monthlyCost.dollars.toLocaleString()}/mo to
                    buy these at{" "}
                    {Math.round(research.data.monthlyCost.ctrAssumption * 100)}%
                    CTR
                    {research.data.monthlyCost.unpriced > 0
                      ? ` · ${research.data.monthlyCost.unpriced} unpriced`
                      : ""}
                  </span>
                )}
              </div>
              {research.error && (
                <p className="text-xs text-red-300">{research.error.message}</p>
              )}
              {research.data && (
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[var(--card)] text-left text-muted-foreground">
                      <tr>
                        <th className="py-1 font-normal">Keyword</th>
                        <th className="py-1 text-right font-normal">
                          Searches/mo
                        </th>
                        <th className="py-1 text-right font-normal">Top bid</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...research.data.estimate, ...research.data.ideas]
                        .slice(0, 100)
                        .map((row) => (
                          <tr key={row.keyword} className="border-t">
                            <td className="py-1 pr-2">{row.keyword}</td>
                            <td className="py-1 text-right tabular-nums">
                              {row.avgMonthlySearches?.toLocaleString() ?? "—"}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {row.highTopOfPageBid != null
                                ? `$${row.highTopOfPageBid.toFixed(2)}`
                                : "—"}
                            </td>
                            <td className="py-1 pl-2 text-right">
                              <button
                                type="button"
                                onClick={() => addKeyword(row.keyword)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                add
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Searches are not clicks. The monthly figure assumes{" "}
                {Math.round(
                  (research.data?.monthlyCost.ctrAssumption ?? 0.35) * 100,
                )}
                % of searches become clicks, which is a planning input for the
                budget cap rather than a forecast.
              </p>
            </div>
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
                  platformCampaignId,
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
