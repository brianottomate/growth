"use client";

import { parseAsString, useQueryState } from "nuqs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_BRANDS = "__all_brands__";

export function BrandFilterSelect({
  brands,
  className = "w-[210px]",
}: {
  brands: { slug: string; name: string }[];
  className?: string;
}) {
  const [brandSlug, setBrandSlug] = useQueryState(
    "brand",
    parseAsString.withOptions({
      history: "push",
      shallow: false,
      scroll: false,
      clearOnDefault: true,
    }),
  );

  return (
    <Select
      value={brandSlug ?? ALL_BRANDS}
      onValueChange={(value) =>
        void setBrandSlug(value === ALL_BRANDS ? null : value)
      }
    >
      <SelectTrigger className={className} aria-label="Filter by brand">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_BRANDS}>All brands</SelectItem>
        {brands.map((brand) => (
          <SelectItem key={brand.slug} value={brand.slug}>
            {brand.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
