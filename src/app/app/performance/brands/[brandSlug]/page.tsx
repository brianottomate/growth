import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ExternalLink } from "lucide-react";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { BrandBrandingCard } from "@/app/app/brands/[brandSlug]/BrandBrandingCard";
import { cn } from "@/components/ui/lib/utils";
import { listMedia } from "@/server/services/media.service";
import { brandListings } from "@/server/services/wanderos-listings.service";

import { BrandLogo, panel, SectionLabel } from "../../_components";

export const metadata: Metadata = { title: "Brand · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The simple brand page for the Performance desk: what the site told us about
 * the brand, the homes on their WanderOS site, and what is in their library.
 * The full brand page keeps everything else.
 */
export default async function PerformanceBrandPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      website: true,
      relationship: true,
      brandIdentity: true,
      brandMark: true,
    },
  });
  if (!brand) notFound();

  const [homes, media] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    listMedia({ brandId: brand.id, kind: "image" }),
  ]);
  const images = media
    .filter((asset) => asset.status === "ready" && (asset.thumbnailUrl ?? asset.url))
    .slice(0, 18);
  const withPhoto = homes.filter((home) => home.imageUrl);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogo brand={brand} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{brand.name}</h2>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium capitalize">
              {brand.relationship}
            </span>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
            {brand.website ? (
              <a href={brand.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {brand.website.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            ) : null}
            <Link href={`/app/brands/${brand.slug ?? brand.id}`} className="hover:underline">
              Full brand page
            </Link>
            <Link href={`/app/brands/${brand.slug ?? brand.id}/ads`} className="hover:underline">
              Campaigns
            </Link>
          </div>
        </div>
      </div>

      <BrandBrandingCard
        brandId={brand.id}
        logo={brand.logo}
        identity={brand.brandIdentity ?? null}
        website={brand.website}
      />

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Homes{withPhoto.length ? ` · ${homes.length}` : ""}</SectionLabel>
          {brand.website ? (
            <a href={brand.website} target="_blank" rel="noreferrer" className="text-[11.5px] text-sky-300 hover:underline">
              Their site
            </a>
          ) : null}
        </div>
        {homes.length === 0 ? (
          <p className={cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs")}>
            {brand.website ? "Not a WanderOS site, so there is no listing feed to read." : "No website on record."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 @xl:grid-cols-3 @4xl:grid-cols-6">
            {withPhoto.slice(0, 12).map((home) => (
              <li key={home.id} className={cn(panel, "group")}>
                <a href={home.url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={home.thumbUrl ?? home.imageUrl!}
                    alt={home.name}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-opacity group-hover:opacity-90"
                  />
                  <div className="px-2.5 py-2">
                    <p className="truncate text-xs font-semibold">{home.name}</p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      {[
                        home.bedrooms ? `${home.bedrooms} bd` : null,
                        home.guests ? `${home.guests} guests` : null,
                        [home.city, home.state].filter(Boolean).join(", ") || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
        {withPhoto.length > 12 ? (
          <p className="text-muted-foreground text-[11px]">{withPhoto.length - 12} more on their site.</p>
        ) : null}
      </section>

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Media library{media.length ? ` · ${media.length}` : ""}</SectionLabel>
          <div className="flex items-center gap-3 text-[11.5px]">
            <Link href={`/app/compositions?brandId=${encodeURIComponent(brand.id)}`} className="text-sky-300 hover:underline">
              Studio
            </Link>
            <Link href={`/app/media?brand=${encodeURIComponent(brand.slug ?? brand.id)}`} className="text-sky-300 hover:underline">
              Open library
            </Link>
          </div>
        </div>
        {images.length === 0 ? (
          <p className={cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs")}>Nothing in the library yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 @xl:grid-cols-6 @4xl:grid-cols-9">
            {images.map((asset) => (
              <li key={asset.id} className="bg-muted aspect-square overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.thumbnailUrl ?? asset.url!}
                  alt={asset.alt ?? asset.title ?? ""}
                  loading="lazy"
                  className="size-full object-cover"
                  title={asset.title ?? asset.filename ?? undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
