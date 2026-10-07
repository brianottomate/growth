"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button";
import { AdFormatFilter } from "@/components/ad-format-filter";
import { AD_FORMATS, type AdFormat } from "@/lib/ad-format";
import {
  adReviewStatus,
  usePreviewReviewStatus,
  useReviewPreview,
} from "@/components/review/ReviewPreview";

const AD_TYPES = AD_FORMATS.map((format) => format.id);

type Group = {
  id: AdFormat;
  label: string;
  ads: { id: string; name: string; status: string; node: React.ReactNode }[];
};

/** Independent status and type filters over one stable list of ads. */
export function AdIdeaGroups({ groups }: { groups: Group[] }) {
  const reviewPreview = useReviewPreview();
  const previewStatus = usePreviewReviewStatus();
  const statusOf = (ad: Group["ads"][number]) =>
    reviewPreview ? previewStatus(ad.name) : adReviewStatus(ad.status);
  const [{ filter, adType }, setFilters] = useQueryStates({
    filter: parseAsStringLiteral([
      "all",
      "draft",
      "ready",
      "approved",
    ]).withDefault("all"),
    adType: parseAsStringLiteral(AD_TYPES),
  });
  const all = groups.flatMap((group) => group.ads);
  const approved = all.filter((ad) => statusOf(ad) === "approved").length;
  const filteredGroups = groups.map((group) => ({
    ...group,
    ads: group.ads.filter((ad) => filter === "all" || statusOf(ad) === filter),
  }));

  const shown = filteredGroups
    .filter((group) => adType === null || group.id === adType)
    .flatMap((group) => group.ads);

  return (
    <>
      <div
        aria-label="Ad review status"
        className="flex w-fit max-w-full flex-wrap rounded-lg border p-0.5 text-sm"
      >
        {(["all", "draft", "ready", "approved"] as const).map((key) => (
          <Button
            key={key}
            variant={filter === key ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={filter === key}
            onClick={() => setFilters({ filter: key })}
          >
            {key === "draft"
              ? `Draft ${all.filter((ad) => statusOf(ad) === "draft").length}`
              : key === "ready"
                ? `Ready ${all.filter((ad) => statusOf(ad) === "ready").length}`
                : key === "approved"
                  ? `Approved ${approved}`
                  : `All ${all.length}`}
          </Button>
        ))}
      </div>
      <AdFormatFilter
        value={adType}
        onChange={(value) => setFilters({ adType: value })}
        formats={filteredGroups.map((group) => ({
          id: group.id,
          label: group.label,
          count: group.ads.length,
        }))}
      />
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-sm text-muted-foreground">
          <p>No ads match these filters.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFilters({ filter: "all", adType: null })}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((ad) => (
            <div key={ad.id} className="min-w-0">
              {ad.node}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
