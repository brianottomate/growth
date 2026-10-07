"use client";
import { MapPin, Sparkles } from "lucide-react";
import { useWorkspaceMutation } from "./useWorkspaceMutation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ContextHomes,
  type ContextHome,
} from "@/components/brand/ContextHomes";
import type { BrandMarkets } from "@/lib/markets";
import { orpc } from "@/orpc/client";
import { ShapeBrandButton } from "./ShapeBrandButton";
import { DirectionPhrases } from "./CreativeDirection";

export function DestinationsCard({
  brandId,
  brandName,
  markets,
  towns,
  homes = [],
}: {
  brandId: string;
  brandName: string;
  markets: BrandMarkets | null;
  towns: { town: string; homes: number }[];
  homes?: ContextHome[];
}) {
  const write = useWorkspaceMutation(
    orpc.brand.draftMarkets.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );
  const list = markets?.markets ?? [];
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MapPin className="size-4 text-muted-foreground" />
          Destinations
        </h2>
        <div className="flex gap-2">
          {!list.length && (
            <Button
              size="sm"
              variant="outline"
              loading={write.isPending}
              disabled={!towns.length}
              onClick={() => write.mutate({ brandId })}
            >
              <Sparkles className="size-3.5" />
              Define destinations
            </Button>
          )}
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
          description={
            write.isPending
              ? "Reading the homes and towns…"
              : "Define guest destinations from your imported homes, then shape the grouping in chat."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
          {list.map((market) => {
            const included = homes.filter(
              (home) =>
                home.city &&
                market.towns.some(
                  (town) => town.toLowerCase() === home.city!.toLowerCase(),
                ),
            );
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
                  values={market.draws ?? []}
                />
                {!!market.seasons?.length && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      Seasons & occasions
                    </h4>
                    {market.seasons.map((season) => (
                      <div
                        key={season.name}
                        className="rounded-lg bg-muted px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{season.name}</span>
                        <span className="block text-muted-foreground">
                          {season.when}
                        </span>
                        {season.note && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {season.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <DirectionPhrases
                  title="Suggested guest origins"
                  values={market.feederCities ?? []}
                />
                {market.gettingThere && (
                  <p className="text-sm text-muted-foreground">
                    {market.gettingThere}
                  </p>
                )}
                {market.notes && (
                  <p className="text-sm leading-relaxed">{market.notes}</p>
                )}
                <ContextHomes homes={included} label="Included homes" />
                {!!market.feederCities?.length && (
                  <p className="text-xs text-muted-foreground">
                    {market.evidenceNote ||
                      "Guest origins are planning suggestions, not measured booking origins."}
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
