"use client";
import { MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { BrandMarkets } from "@/lib/markets";
import { ShapeBrandButton } from "./ShapeBrandButton";
import { DirectionPhrases } from "./CreativeDirection";

export function DestinationsCard({
  brandId,
  brandName,
  markets,
  towns,
}: {
  brandId: string;
  brandName: string;
  markets: BrandMarkets | null;
  towns: { town: string; homes: number }[];
}) {
  const list = markets?.markets ?? [];
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MapPin className="size-4 text-muted-foreground" />
          Destinations
        </h2>
        <div className="flex gap-2">
          <ShapeBrandButton
            brandId={brandId}
            brandName={brandName}
            section="destinations"
          />
        </div>
      </div>
      {!list.length ? (
        <EmptyState
          compact
          icon={MapPin}
          title="Where people come to stay"
          description="Shape guest destinations from your imported homes in chat."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
          {list.map((market) => {
            const count = towns
              .filter((t) =>
                market.towns.some(
                  (town) => town.toLowerCase() === t.town.toLowerCase(),
                ),
              )
              .reduce((sum, t) => sum + t.homes, 0);
            return (
              <article
                key={market.id}
                className="space-y-4 rounded-xl border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-medium">{market.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      {market.towns.join(" · ")} · {count} homes
                    </p>
                  </div>
                  <ShapeBrandButton
                    brandId={brandId}
                    brandName={brandName}
                    section="destination"
                    resource={{ id: market.id, name: market.label }}
                  />
                </div>
                <DirectionPhrases
                  title="Reasons to visit"
                  values={(market.draws ?? []).slice(0, 3)}
                />
                {!!market.seasons?.length && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      Seasons & occasions
                    </h4>
                    {market.seasons.slice(0, 2).map((season) => (
                      <div
                        key={season.name}
                        className="rounded-lg bg-muted px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{season.name}</span>
                        <span className="block text-muted-foreground">
                          {season.when}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <DirectionPhrases
                  title="Suggested origin cities"
                  values={(market.feederCities ?? []).slice(0, 3)}
                />
                {!!market.feederCities?.length && (
                  <p className="text-xs text-muted-foreground">
                    Suggested origins for planning.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
