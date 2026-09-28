"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { BrandMarkets, Market } from "@/lib/markets";
import { orpc } from "@/orpc/client";

/**
 * Where the brand's homes are, as guests think of it. Drafted by AI from the
 * homes' towns and listings and used straight away; the operator edits or
 * redrafts to overwrite. Only the label and towns change a card; the rest is
 * context for the prompts.
 */
export function MarketsCard({
  brandId,
  markets,
  towns,
}: {
  brandId: string;
  markets: BrandMarkets | null;
  /** Every town the brand's homes are in, with how many homes. */
  towns: { town: string; homes: number }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Market[] | null>(null);
  const list = draft ?? markets?.markets ?? [];

  const save = useMutation(
    orpc.brand.setMarkets.mutationOptions({
      onSuccess: () => {
        setDraft(null);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const write = useMutation(
    orpc.brand.draftMarkets.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const homesIn = (market: Market) =>
    towns
      .filter((t) =>
        market.towns.some((m) => m.toLowerCase() === t.town.toLowerCase()),
      )
      .reduce((sum, t) => sum + t.homes, 0);
  const edit = (index: number, patch: Partial<Market>) =>
    setDraft(list.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold">Markets</h2>
        <div className="flex items-center gap-2">
          {draft ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                loading={save.isPending}
                onClick={() => save.mutate({ brandId, markets: draft })}
              >
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                loading={write.isPending}
                onClick={() => write.mutate({ brandId })}
              >
                <Sparkles className="size-3.5" />
                {markets ? "Redraft" : "Draft"}
              </Button>
              {markets ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft(markets.markets)}
                >
                  Edit
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {list.length ? (
        <div className="space-y-4">
          {list.map((market, index) => (
            <div key={market.id} className="space-y-1.5 text-sm">
              {draft ? (
                <Input
                  aria-label="Market label"
                  value={market.label}
                  maxLength={40}
                  onChange={(e) => edit(index, { label: e.target.value })}
                />
              ) : (
                <p className="font-medium">{market.label}</p>
              )}
              <p className="text-muted-foreground">
                {market.towns.join(", ")} · {homesIn(market)} homes
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
                  {market.seasons
                    .map((s) => `${s.name} (${s.when})`)
                    .join(", ")}
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
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Draft the markets from this brand&rsquo;s homes.
        </p>
      )}
    </section>
  );
}
