"use client";

import { HeroHomePicker, type HeroOption } from "./HeroHomePicker";

/**
 * The brand's hero: the one home (and photo) that stands for the brand in
 * its previews. Empty until an operator or the agent chooses one; nothing is
 * picked on anyone's behalf.
 */
export function HeroCard({
  brandId,
  hero,
  options,
  heroUrl,
}: {
  brandId: string;
  /** What the previews draw now, or null when no hero is chosen. */
  hero: { name: string; imageUrl: string } | null;
  options: HeroOption[];
  /** The hero home's listing URL, to mark it in the picker. */
  heroUrl: string | null;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Hero</h2>
          <p className="text-xs text-muted-foreground">
            The home that stands for the brand. The previews below draw from it.
          </p>
        </div>
        <HeroHomePicker
          brandId={brandId}
          options={options}
          featuredUrl={heroUrl}
          label={hero ? "Change hero" : "Choose hero"}
        />
      </div>
      {hero ? (
        <div className="flex items-center gap-3">
          {/* oxlint-disable-next-line nextjs/no-img-element */}
          <img
            src={hero.imageUrl}
            alt={hero.name}
            className="aspect-[4/3] w-40 rounded-lg border object-cover"
          />
          <p className="text-sm font-medium">{hero.name}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No hero chosen yet.</p>
      )}
    </section>
  );
}
