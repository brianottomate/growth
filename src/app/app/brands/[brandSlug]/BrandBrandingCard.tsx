"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Palette, RefreshCw, Sparkles } from "lucide-react";

import {
  BrandingPanel,
  BrandIdentityAssets,
} from "@/components/brand/BrandingPanel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { BrandIdentity, BrandMark } from "@/server/db/brand-schema";
import { orpc } from "@/orpc/client";
import { ShapeBrandButton } from "@/app/app/performance/clients/[brandSlug]/ShapeBrandButton";
import { BrandPreviewCard } from "@/app/app/performance/clients/[brandSlug]/BrandPreviewCard";
import {
  BrandPreviewImagePicker,
  type PreviewImageOption,
} from "@/components/brand/BrandPreviewImagePicker";
import { BrandMarkCard } from "./BrandMarkCard";

export function BrandBrandingCard({
  brandId,
  brandName,
  logo,
  identity,
  website,
  mark,
  variants,
  photo,
  logoOnCreatives = true,
  previewImages = [],
}: {
  brandId: string;
  brandName: string;
  logo: string | null;
  identity: BrandIdentity | null;
  website: string | null;
  mark: BrandMark | null;
  variants: { color: string; white: string; dark: string } | null;
  photo: string | null;
  logoOnCreatives?: boolean;
  previewImages?: PreviewImageOption[];
}) {
  const router = useRouter();
  const enrich = useMutation(
    orpc.brand.enrich.mutationOptions({
      onSuccess: () => {
        toast.success("Identity refreshed");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const create = useMutation({
    mutationFn: async () => {
      if (!identity?.extractedAt && website)
        await orpc.brand.enrich.call({ brandId });
      return orpc.brand.suggestMark.call({ brandId });
    },
    onSuccess: () => {
      toast.success("Brand mark created");
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      router.refresh();
    },
  });
  const settings = useMutation(
    orpc.brand.setPerformanceSettings.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const busy = create.isPending || enrich.isPending;
  const actions = (primary = false) => (
    <>
      {!mark && (
        <Button
          size="sm"
          variant={primary ? "default" : "outline"}
          disabled={busy}
          onClick={() => create.mutate()}
        >
          <Sparkles className="size-3.5" />
          {create.isPending ? "Creating mark…" : "Create mark"}
        </Button>
      )}
      <ShapeBrandButton
        brandId={brandId}
        brandName={brandName}
        section="creative mark"
      />
    </>
  );
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-col items-start justify-between gap-3 @lg:flex-row">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Palette
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          Brand identity
        </h2>
        <BrandPreviewImagePicker brandId={brandId} images={previewImages} />
      </div>
      <BrandIdentityAssets
        identity={identity}
        logo={logo}
        previewImage={photo}
        large
      />
      <BrandPreviewCard
        previewCopy={mark?.previewCopy}
        brandId={brandId}
        brandName={brandName}
        identity={identity}
        previewHome={
          photo
            ? {
                name: brandName,
                imageUrl: photo,
                place: null,
                facts: null,
                rating: null,
                source: "brand",
              }
            : null
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <h3 className="text-sm font-medium">Creative mark</h3>
          <div className="flex flex-wrap items-center gap-3">
            {mark && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  aria-label="Use on new ads and catalog cards"
                  checked={logoOnCreatives}
                  disabled={settings.isPending || busy}
                  onCheckedChange={(checked) =>
                    settings.mutate({
                      brandId,
                      patch: { logoOnCreatives: checked },
                    })
                  }
                />
                Use on creatives
              </label>
            )}
            {actions()}
          </div>
        </div>
        {mark && variants ? (
          <BrandMarkCard variants={variants} photo={photo} />
        ) : (
          <EmptyState
            compact
            icon={Palette}
            title="Make the brand recognizable"
            description="Create a mark for ads and catalog cards from the brand’s logo, colors and fonts."
            actions={actions(true)}
          />
        )}
      </BrandPreviewCard>
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Details
        </summary>
        <div className="space-y-4 pt-4">
          <BrandingPanel identity={identity} logo={logo} hideImages hideFonts />
          <Button
            variant="outline"
            size="sm"
            disabled={!website || busy}
            onClick={() => enrich.mutate({ brandId })}
          >
            <RefreshCw
              className={`size-3.5 ${enrich.isPending ? "animate-spin" : ""}`}
            />
            {enrich.isPending ? "Reading website…" : "Refresh from website"}
          </Button>
        </div>
      </details>
    </section>
  );
}
