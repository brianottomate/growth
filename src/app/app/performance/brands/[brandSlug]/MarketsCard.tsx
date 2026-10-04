"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MapPin, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { BrandMarkets, Market } from "@/lib/markets";
import { orpc } from "@/orpc/client";
import { MarketDetails } from "./brand-content";
import { EmptyState } from "@/components/ui/empty-state";
import { ShapeBrandButton } from "./ShapeBrandButton";

/**
 * Where the brand's homes are, as guests think of it. Drafted by AI from the
 * homes' towns and listings and used straight away; the operator edits or
 * redrafts to overwrite. Only the label and towns change a card; the rest is
 * context for the prompts.
 */
export function MarketsCard({
  brandId,
  brandName,
  markets,
  towns,
}: {
  brandId: string;
  brandName: string;
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

  const actions = (primary = false) => (
    <>
      {list.length ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDraft(markets?.markets ?? [])}
        >
          Edit
        </Button>
      ) : (
        <Button
          size="sm"
          variant={primary ? "default" : "outline"}
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
        section="home destinations"
      />
    </>
  );
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold">Destinations</h2>
        <div className="flex flex-wrap items-center gap-2">
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
            actions()
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Group the brand’s home locations into destinations that inform copy and
        campaign targeting.
      </p>
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
              <MarketDetails market={market} homes={homesIn(market)} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          icon={MapPin}
          title="Group homes into guest destinations"
          description={
            towns.length
              ? "Define and save destinations from the brand’s homes, or Shape how nearby destinations should be grouped."
              : "Add homes with their towns first, then define the brand’s destinations."
          }
          actions={actions(true)}
        />
      )}
    </section>
  );
}
