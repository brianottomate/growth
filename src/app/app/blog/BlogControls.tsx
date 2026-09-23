"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { BrandFilterSelect } from "@/components/brand-filter-select";
import { SocialPreviewSelect } from "@/components/social-preview-select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export function BlogControls({
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
  const selected = brands.find((brand) => brand.slug === selectedBrandSlug);
  const sync = useMutation(
    orpc.blog.sync.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Synced ${result.articles} blog articles`);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

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
            : "Choose one brand before syncing its blog"
        }
      >
        <RefreshCw className="size-3.5" />
        {sync.isPending
          ? "Syncing…"
          : selectedBrandSlug
            ? "Sync published blog"
            : "Choose brand to sync"}
      </Button>
    </div>
  );
}
