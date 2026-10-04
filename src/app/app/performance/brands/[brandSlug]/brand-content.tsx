import type { Market } from "@/lib/markets";

/** Presentation shared by the workspace and its local fixtures. */
export function BrandStoryContent({ story }: { story: string }) {
  return <p className="text-sm whitespace-pre-line">{story}</p>;
}

export function MarketDetails({
  market,
  homes,
}: {
  market: Market;
  homes: number;
}) {
  return (
    <>
      <p className="text-muted-foreground">
        {market.towns.join(", ")} · {homes} homes
      </p>
      {market.draws?.length ? (
        <p>
          <span className="text-muted-foreground">Draws </span>
          {market.draws.join(", ")}
        </p>
      ) : null}
      {market.seasons?.length ? (
        <p>
          <span className="text-muted-foreground">Seasons </span>
          {market.seasons.map((s) => `${s.name} (${s.when})`).join(", ")}
        </p>
      ) : null}
      {market.feederCities?.length ? (
        <p>
          <span className="text-muted-foreground">Guests from </span>
          {market.feederCities.join(", ")}
        </p>
      ) : null}
      {market.notes ? (
        <p className="text-muted-foreground">{market.notes}</p>
      ) : null}
    </>
  );
}
