"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button";
import { ApprovedStamp } from "@/components/approved-stamp";

const AD_TYPES = [
  "all-homes",
  "statics",
  "home-carousels",
  "video",
  "text",
  "other",
] as const;

type Group = {
  id: string;
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
      <div
        role="group"
        aria-label="Ad types"
        className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 bg-background/95 px-1 py-2 backdrop-blur"
      >
        <Button
          variant={adType === null ? "secondary" : "outline"}
          size="sm"
          aria-pressed={adType === null}
          onClick={() => setFilters({ adType: null })}
        >
          All types · {statusCount}
        </Button>
        {filteredGroups.map((group) => (
          <Button
            key={group.id}
            variant={adType === group.id ? "secondary" : "outline"}
            size="sm"
            aria-pressed={adType === group.id}
            onClick={() =>
              setFilters({
                adType: AD_TYPES.find((type) => type === group.id) ?? null,
              })
            }
          >
            {group.label} · {group.ads.length}
          </Button>
        ))}
      </div>
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
