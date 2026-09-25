"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CompositionWorkbench } from "./CompositionWorkbench";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  type CompositionFormatId,
  type CompositionTemplateId,
} from "@/lib/compositions";
import type { BrandIdentity } from "@/server/db/brand-schema";

type Brand = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  brandIdentity: BrandIdentity | null;
};

/** A blueprint id from the URL, or nothing: an unknown id is ignored, not an error. */
function templateFromParam(value: string | null): CompositionTemplateId | null {
  return COMPOSITION_TEMPLATES.some((template) => template.id === value)
    ? (value as CompositionTemplateId)
    : null;
}

function formatFromParam(value: string | null): CompositionFormatId | null {
  return COMPOSITION_FORMATS.some((format) => format.id === value)
    ? (value as CompositionFormatId)
    : null;
}

/** Only paths inside the app can be a way back; anything else is dropped. */
function backFromParam(value: string | null) {
  return value?.startsWith("/app/") ? value : null;
}

export function CompositionsPage({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // A link from a brand's page lands on that brand; otherwise Wander, or
  // whichever brand comes first.
  const requested = searchParams.get("brandId");
  const preferredBrand =
    brands.find((brand) => brand.id === requested) ??
    brands.find((brand) => brand.name.toLowerCase() === "wander") ??
    brands[0]!;
  const [brandId, setBrandId] = useState(preferredBrand.id);
  // A card handed over from the library or an ad: reopen it with the form
  // filled in, and when it came from an ad, offer to put the new render back.
  const openAssetId = searchParams.get("asset");
  const adId = searchParams.get("adId");
  const cardIndex = searchParams.get("card");
  const replaceTarget =
    adId && cardIndex !== null && /^\d+$/.test(cardIndex)
      ? { adId, index: Number(cardIndex), back: searchParams.get("back") }
      : null;
  // A link that arrives with a blueprint, canvas or photo already chosen:
  // the brand page opening the house card on one of their homes.
  const initialTemplateId = templateFromParam(searchParams.get("template"));
  const initialFormatId = formatFromParam(searchParams.get("format"));
  const initialSourceId = searchParams.get("source");
  // Copy a preview tile was drawn with, so the Studio opens on the same card.
  const initialTitle = searchParams.get("title");
  const initialCta = searchParams.get("cta");
  const initialEyebrow = searchParams.get("eyebrow");
  const initialSubtitle = searchParams.get("subtitle");
  const ratingParam = Number(searchParams.get("rating"));
  const initialRating =
    ratingParam >= 1 && ratingParam <= 5 ? ratingParam : null;
  // Designing an ad preview for the brand: freezing keeps the card on the
  // brand and goes back to its page.
  const adPreviewTarget =
    searchParams.get("adPreview") === "1" && !replaceTarget
      ? { back: backFromParam(searchParams.get("back")) }
      : null;
  const changeBrand = (next: string) => {
    setBrandId(next);
    // Keep the URL saying which brand, so the page can be shared or reloaded.
    const params = new URLSearchParams(searchParams.toString());
    params.set("brandId", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Compositions</h1>
      <CompositionWorkbench
        brands={brands}
        brandId={brandId}
        onBrandChange={changeBrand}
        openAssetId={openAssetId}
        replaceTarget={replaceTarget}
        initialTemplateId={initialTemplateId}
        initialFormatId={initialFormatId}
        initialSourceId={initialSourceId}
        initialTitle={initialTitle}
        initialCta={initialCta}
        initialEyebrow={initialEyebrow}
        initialSubtitle={initialSubtitle}
        initialRating={initialRating}
        adPreviewTarget={adPreviewTarget}
      />
    </div>
  );
}
