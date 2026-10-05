import { BrandBrandingCard } from "@/app/app/brands/[brandSlug]/BrandBrandingCard";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { listAllBrandHomes } from "@/server/services/homes.service";

import { BrandStoryCard } from "../BrandStoryCard";
import { PersonaAudiences } from "../PersonaAudiences";
import { loadPersonaAudiences } from "@/server/services/persona-audience.service";
import { loadPerformanceBrand } from "../_data";
import { resolvePreviewHome } from "../_preview-home";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Globe } from "lucide-react";
import { PreparationAction } from "../PreparationAction";

export const metadata: Metadata = { title: "Setup · Wander Performance" };
export const dynamic = "force-dynamic";

/** Universal brand identity, story, personas and visual previews. */
export default async function PerformanceBrandSetupPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  if (
    !brand.websiteMeta?.scrapedAt &&
    !brand.brandIdentity &&
    !brand.logo &&
    !brand.brandMark
  ) {
    return (
      <section className="rounded-xl border p-6">
        <EmptyState
          icon={Globe}
          title={
            brand.website
              ? "Read the brand’s website"
              : "Add the brand’s website"
          }
          description="Collect the logo, colors, fonts, and brand information, and check whether the website uses WanderOS. Then prepare the brand’s story and personas."
          actions={
            brand.website ? (
              <PreparationAction
                brandId={brand.id}
                kind="website"
                label="Read website"
              />
            ) : (
              <ButtonLink
                href={`/app/performance/clients/${brand.slug ?? brand.id}/settings`}
              >
                Add website
              </ButtonLink>
            )
          }
        />
      </section>
    );
  }

  const [rows, audiences] = await Promise.all([
    listAllBrandHomes(brand.id),
    loadPersonaAudiences(brand.id),
  ]);
  const marks = brand.brandMark
    ? await db.query.mediaAssetTable.findMany({
        where: inArray(
          mediaAssetTable.id,
          Object.values(brand.brandMark.variants),
        ),
        columns: { id: true, url: true },
      })
    : [];
  const markUrl = (id: string) => marks.find((row) => row.id === id)?.url ?? "";
  const markVariants = brand.brandMark
    ? {
        color: markUrl(brand.brandMark.variants.color),
        white: markUrl(brand.brandMark.variants.white),
        dark: markUrl(brand.brandMark.variants.dark),
      }
    : null;

  const slug = brand.slug ?? brand.id;
  const previewHome = resolvePreviewHome({
    brandName: brand.name,
    featuredListingUrl: brand.featuredListingUrl,
    previewSourceUrl: brand.previewSourceUrl,
    homes: rows,
    ogImage:
      brand.brandIdentity?.raw?.images?.ogImage ??
      brand.websiteMeta?.ogImage ??
      null,
  });
  return (
    <div className="space-y-4">
      <BrandBrandingCard
        brandName={brand.name}
        brandId={brand.id}
        logo={brand.logo}
        identity={brand.brandIdentity ?? null}
        website={brand.website}
        mark={brand.brandMark ?? null}
        variants={markVariants}
        photo={previewHome?.imageUrl ?? null}
        previewImages={rows
          .filter((home) => home.heroSourceUrl)
          .map((home) => ({
            name: home.name,
            imageUrl: home.heroSourceUrl!,
            thumbUrl:
              home.galleryCache?.find(
                (photo) => photo.url === home.heroSourceUrl,
              )?.thumbUrl ?? home.heroSourceUrl!,
          }))}
        logoOnCreatives={brand.performanceSettings?.logoOnCreatives !== false}
      />
      <BrandStoryCard
        brandId={brand.id}
        brandName={brand.name}
        story={brand.story}
      />
      <section className="rounded-xl border p-4">
        <PersonaAudiences
          brand={{ id: brand.id, slug, name: brand.name }}
          personas={audiences.personas.map(({ persona, targets }) => ({
            id: persona.id,
            name: persona.name,
            description: persona.description,
            countries: persona.demandGeography?.countries ?? [],
            targets,
          }))}
          unassigned={audiences.unassigned}
        />
      </section>
    </div>
  );
}
