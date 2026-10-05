"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button";
import { AdFormatFilter } from "@/components/ad-format-filter";
import { AD_FORMATS, type AdFormat } from "@/lib/ad-format";
import { ApprovedStamp } from "@/components/approved-stamp";

const AD_TYPES = AD_FORMATS.map((format) => format.id);

type Group = {
  id: AdFormat;
  label: string;
  ads: { id: string; approved: boolean; node: React.ReactNode }[];
};

/** Independent status and type filters over one stable list of ads. */
export function AdIdeaGroups({ groups }: { groups: Group[] }) {
  const [{ filter, adType }, setFilters] = useQueryStates({
    filter: parseAsStringLiteral(["all", "review", "approved"]).withDefault(
      "all",
    ),
    adType: parseAsStringLiteral(AD_TYPES),
  });
  const all = groups.flatMap((group) => group.ads);
  const approved = all.filter((ad) => ad.approved).length;
  const filteredGroups = groups.map((group) => ({
    ...group,
    ads: group.ads.filter((ad) =>
      filter === "all" ? true : ad.approved === (filter === "approved"),
    ),
  }));
  const statusCount = filteredGroups.reduce(
    (count, group) => count + group.ads.length,
    0,
  );
  const shown = filteredGroups
    .filter((group) => adType === null || group.id === adType)
    .flatMap((group) => group.ads);

  return (
    <>
      <div
        aria-label="Ad review status"
        className="flex w-fit max-w-full flex-wrap rounded-lg border p-0.5 text-sm"
      >
        {(["all", "review", "approved"] as const).map((key) => (
          <Button
            key={key}
            variant={filter === key ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={filter === key}
            onClick={() => setFilters({ filter: key })}
          >
            {key === "review"
              ? `Needs review ${all.length - approved}`
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
          {filter === "review" && statusCount === 0 ? (
            <>
              <ApprovedStamp className="scale-150" />
              <p className="pt-2">All {all.length} approved</p>
            </>
          ) : (
            <p>No ads match these filters.</p>
          )}
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
