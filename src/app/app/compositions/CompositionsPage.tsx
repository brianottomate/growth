"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CompositionWorkbench } from "./CompositionWorkbench";

import type { BrandIdentity } from "@/server/db/brand-schema";

type Brand = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  brandIdentity: BrandIdentity | null;
};

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
  const changeBrand = (next: string) => {
    setBrandId(next);
    // Keep the URL saying which brand, so the page can be shared or reloaded.
    const params = new URLSearchParams(searchParams.toString());
    params.set("brandId", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Compositions</h1>
        <p className="text-muted-foreground text-sm">
          Turn library images and brand copy into finished publishing assets.
        </p>
      </div>
      <CompositionWorkbench
        brands={brands}
        brandId={brandId}
        onBrandChange={changeBrand}
      />
    </div>
  );
}
