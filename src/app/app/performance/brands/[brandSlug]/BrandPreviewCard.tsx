"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import {
  BrandFontPicker,
  brandFonts,
  type BrandFonts,
} from "@/components/brand/BrandFontPicker";
import {
  BrandPreviewStrip,
  type PreviewHome,
} from "@/components/brand/BrandPreviewStrip";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { BrandIdentity } from "@/server/db/brand-schema";
import { useTRPC } from "@/trpc/react";

import { HeroHomePicker, type HeroOption } from "./HeroHomePicker";

/**
 * Try the brand's fonts on live cards of one home before saving them. A
 * picked font is a draft until saved; saved fonts outlive a re-enrich until
 * reset to the site's.
 */
export function BrandPreviewCard({
  brandId,
  brandName,
  identity,
  previewHome,
  heroOptions,
  featuredUrl,
}: {
  brandId: string;
  brandName: string;
  identity: BrandIdentity | null;
  previewHome: PreviewHome | null;
  heroOptions: HeroOption[];
  featuredUrl: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const saved = brandFonts(identity);
  const [draft, setDraft] = useState<BrandFonts | null>(null);
  const fonts = draft ?? saved;
  const dirty =
    draft !== null &&
    (draft.heading !== saved.heading || draft.body !== saved.body);

  const setFonts = useMutation(
    trpc.brand.setFonts.mutationOptions({
      onSuccess: () => {
        setDraft(null);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold">Preview</h2>
        <div className="flex items-center gap-2">
          {dirty ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={setFonts.isPending}
                onClick={() => setDraft(null)}
              >
                Discard
              </Button>
              <Button
                size="sm"
                disabled={setFonts.isPending}
                onClick={() => setFonts.mutate({ id: brandId, ...fonts })}
              >
                Save fonts
              </Button>
            </>
          ) : identity?.fontsChosen ? (
            <Button
              size="sm"
              variant="outline"
              disabled={setFonts.isPending}
              onClick={() =>
                setFonts.mutate({ id: brandId, heading: null, body: null })
              }
            >
              Reset to site fonts
            </Button>
          ) : null}
        </div>
      </div>
      <div className="text-xs">
        <BrandFontPicker
          value={fonts}
          disabled={setFonts.isPending}
          onChange={setDraft}
        />
      </div>
      <BrandPreviewStrip
        brandId={brandId}
        brandName={brandName}
        home={previewHome}
        action={
          <HeroHomePicker
            brandId={brandId}
            options={heroOptions}
            featuredUrl={featuredUrl}
          />
        }
        fontFamily={
          dirty && fonts.heading !== saved.heading ? fonts.heading : null
        }
      />
    </section>
  );
}
