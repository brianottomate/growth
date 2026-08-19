"use client";

import { useState } from "react";

import { CompositionWorkbench } from "./CompositionWorkbench";

type Brand = { id: string; name: string; logo: string | null };

export function CompositionsPage({ brands }: { brands: Brand[] }) {
  const preferredBrand =
    brands.find((brand) => brand.name.toLowerCase() === "wander") ?? brands[0]!;
  const [brandId, setBrandId] = useState(preferredBrand.id);

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
        onBrandChange={setBrandId}
      />
    </div>
  );
}
