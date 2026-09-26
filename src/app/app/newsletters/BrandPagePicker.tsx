"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Open one brand's newsletters page. */
export function BrandPagePicker({
  brands,
}: {
  brands: { slug: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <Select
      onValueChange={(slug) => router.push(`/app/brands/${slug}/newsletters`)}
    >
      <SelectTrigger className="w-[210px]" aria-label="Open a brand">
        <SelectValue placeholder="Open a brand" />
      </SelectTrigger>
      <SelectContent>
        {brands.map((brand) => (
          <SelectItem key={brand.slug} value={brand.slug}>
            {brand.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
