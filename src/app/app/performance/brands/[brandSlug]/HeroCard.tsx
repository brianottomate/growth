"use client";

import Link from "next/link";
import { Image } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ShapeBrandButton } from "./ShapeBrandButton";

import { HeroHomePicker, type HeroOption } from "./HeroHomePicker";

type Hero = {
  name: string;
  imageUrl: string;
  /** From the hero home's row; absent for a library photo picked alone. */
  place?: string | null;
  facts?: string;
  photos?: string[];
  photoCount?: number;
  href?: string;
};

/**
 * The brand's hero: the one home (and photo) that stands for the brand, with
 * the previews drawn from it underneath, so a new hero redraws them in view.
 * Empty until an operator or the agent chooses one; nothing is picked on
 * anyone's behalf.
 */
export function HeroCard({
  brandId,
  brandName,
  hero,
  options,
  heroUrl,
  children,
}: {
  brandId: string;
  brandName: string;
  /** What the previews draw now, or null when no hero is chosen. */
  hero: Hero | null;
  options: HeroOption[];
  /** The hero home's listing URL, to mark it in the picker. */
  heroUrl: string | null;
  /** Drawn from the hero, under it: the brand previews. */
  children?: React.ReactNode;
}) {
  const more = hero?.photoCount
    ? hero.photoCount - 1 - (hero.photos?.length ?? 0)
    : 0;
  const actions = (primary = false) => (
    <>
      <HeroHomePicker
        brandId={brandId}
        options={options}
        featuredUrl={heroUrl}
        label={hero ? "Change hero" : "Choose hero"}
        primary={primary}
      />
      <ShapeBrandButton
        brandId={brandId}
        brandName={brandName}
        section="hero home and preview photo"
      />
    </>
  );
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Hero home</h2>
          <p className="text-xs text-muted-foreground">
            The home that stands for the brand. The previews draw from it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">{actions()}</div>
      </div>
      {hero ? (
        <div className="flex flex-wrap items-start gap-4">
          {/* oxlint-disable-next-line nextjs/no-img-element */}
          <img
            src={hero.imageUrl}
            alt={hero.name}
            className="aspect-[4/3] w-56 shrink-0 rounded-lg border object-cover"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">{hero.name}</p>
              {hero.href ? (
                <Link
                  href={hero.href}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Edit home
                </Link>
              ) : null}
            </div>
            {hero.place || hero.facts ? (
              <p className="text-xs text-muted-foreground">
                {[hero.facts, hero.place].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {hero.photos?.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {hero.photos.map((url) => (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt=""
                    loading="lazy"
                    className="size-14 rounded-md border object-cover"
                  />
                ))}
                {more > 0 ? (
                  <span className="grid size-14 grid-cols-1 place-items-center rounded-md bg-muted text-[11px] text-muted-foreground">
                    +{more}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Image}
          title="Put a real home behind the brand"
          description={
            options.length
              ? "Choose a representative home and photo to save as the source for brand previews, or Shape which home should lead."
              : "Add homes with photos before choosing a hero. Shape can help decide what the previews should express."
          }
          actions={actions(true)}
        />
      )}
      {children}
    </section>
  );
}
