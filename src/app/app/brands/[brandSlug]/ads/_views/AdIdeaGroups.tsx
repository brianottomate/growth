"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { ApprovedStamp } from "@/components/approved-stamp";

type Group = {
  id: string;
  label: string;
  ads: { id: string; approved: boolean; node: React.ReactNode }[];
};

/** The ads by type, with the catalog's All / Needs review / Approved switch. */
export function AdIdeaGroups({ groups }: { groups: Group[] }) {
  const [filter, setFilter] = useQueryState(
    "filter",
    parseAsStringLiteral(["all", "review", "approved"]).withDefault("all"),
  );
  const all = groups.flatMap((group) => group.ads);
  const approved = all.filter((ad) => ad.approved).length;
  const shown = groups
    .map((group) => ({
      ...group,
      ads: group.ads.filter((ad) =>
        filter === "all" ? true : ad.approved === (filter === "approved"),
      ),
    }))
    .filter((group) => group.ads.length > 0);
  return (
    <>
      <div className="flex w-fit rounded-lg border p-0.5 text-sm">
        {(["all", "review", "approved"] as const).map((key) => (
          <Button
            key={key}
            variant={filter === key ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {key === "review"
              ? `Needs review ${all.length - approved}`
              : key === "approved"
                ? `Approved ${approved}`
                : "All"}
          </Button>
        ))}
      </div>
      {shown.length === 0 &&
        (filter === "review" ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10">
            <ApprovedStamp className="scale-150" />
            <p className="pt-2 text-sm text-muted-foreground">
              All {all.length} approved
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground">
            <p>Nothing approved yet</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilter("review")}
            >
              Review {all.length - approved}
            </Button>
          </div>
        ))}
      {shown.length > 0 && (
        <nav
          aria-label="Ad types"
          className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 bg-background/95 px-1 py-2 backdrop-blur"
        >
          {shown.map((group) => (
            <a
              key={group.id}
              href={`#ads-${group.id}`}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {group.label}{" "}
              <span className="tabular-nums">· {group.ads.length}</span>
            </a>
          ))}
        </nav>
      )}
      {shown.map((group) => (
        <section
          key={group.id}
          id={`ads-${group.id}`}
          aria-labelledby={`ads-${group.id}-heading`}
          className="scroll-mt-14 space-y-3"
        >
          <h3
            id={`ads-${group.id}-heading`}
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {group.label} · {group.ads.length}
          </h3>
          {group.ads.map((ad) => (
            <div key={ad.id}>{ad.node}</div>
          ))}
        </section>
      ))}
    </>
  );
}
