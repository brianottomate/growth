import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { HomeError, loadBrandHome } from "@/server/services/homes.service";

import { SectionLabel } from "../../../../_components";
import {
  brandAvatarUrl,
  brandTabHref,
  loadPerformanceBrand,
} from "../../_data";

import { HomeWorkbench } from "./HomeWorkbench";

export const metadata: Metadata = { title: "Home · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * One home, deep enough to work on: its photos, the creatives they make in
 * every size, its own carousel and its listing card. Opening this page is
 * what puts the home on the record, so the URL works the first time.
 */
export default async function PerformanceHomePage({
  params,
}: {
  params: Promise<{ brandSlug: string; propertyId: string }>;
}) {
  const { brandSlug, propertyId } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const loaded = await loadBrandHome({
    brandSlug,
    propertyId,
    orgId: org.id,
  }).catch((error: unknown) => {
    if (error instanceof HomeError && error.status === 404) return null;
    throw error;
  });
  if (!loaded) notFound();

  const avatarUrl = await brandAvatarUrl(brand);
  const slug = brand.slug ?? brand.id;
  const { home } = loaded;
  const place = [home.city, home.state].filter(Boolean).join(", ");
  const facts = [
    home.bedrooms ? `${home.bedrooms} bd` : null,
    home.bathrooms ? `${home.bathrooms} ba` : null,
    home.guests ? `sleeps ${home.guests}` : null,
    home.nightlyFrom
      ? `from $${home.nightlyFrom.toLocaleString("en-US")}/night`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <SectionLabel>
            <Link
              href={brandTabHref(slug, "homes")}
              className="hover:underline"
            >
              Homes
            </Link>
          </SectionLabel>
          <h3 className="text-base font-semibold tracking-tight">
            {home.name}
          </h3>
          {home.offFeed ? (
            <span className="text-[11px] text-amber-300">
              No longer on their feed
            </span>
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
          {place ? <span>{place}</span> : null}
          {facts.length > 0 ? <span>{facts.join(" · ")}</span> : null}
          <a
            href={home.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            Their listing
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <HomeWorkbench
        home={home}
        brandId={brand.id}
        brandSlug={slug}
        brandName={brand.name}
        brandLogo={avatarUrl}
      />
    </div>
  );
}
