"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { BrandFilterSelect } from "@/components/brand-filter-select";
import { SocialPreviewSelect } from "@/components/social-preview-select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

export function WebsiteControls({
  brands,
  selectedBrandSlug,
}: {
  brands: {
    id: string;
    slug: string;
    name: string;
    website: string | null;
  }[];
  selectedBrandSlug: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const sync = useMutation(
    trpc.website.sync.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Mapped ${result.discovered.toLocaleString()} sitemap pages`,
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const selected = brands.find((brand) => brand.slug === selectedBrandSlug);

  return (
    <div className="flex items-center gap-2">
      <SocialPreviewSelect />
      <BrandFilterSelect
        brands={brands.map((brand) => ({
          slug: brand.slug,
          name: brand.name,
        }))}
      />
      <Button
        size="sm"
        onClick={() => selected && sync.mutate({ brandId: selected.id })}
        loading={sync.isPending}
        disabled={!selected?.website || !selectedBrandSlug}
        title={
          selectedBrandSlug
            ? undefined
            : "Choose one brand before syncing its sitemap"
        }
      >
        <RefreshCw className="size-3.5" />
        {sync.isPending ? "Syncing…" : "Sync sitemap"}
      </Button>
    </div>
  );
}
