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
