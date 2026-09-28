import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { homeTable } from "@/server/db/schema";

import { loadPerformanceBrand } from "../_data";
import { CatalogCards } from "./CatalogCards";

export const metadata: Metadata = { title: "Catalog · Wander Performance" };
export const dynamic = "force-dynamic";

/** The client's catalog ads: one card per home, exported to the library. */
export default async function PerformanceBrandCatalogPage({
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

  const hero = brand.featuredListingUrl
    ? await db.query.homeTable.findFirst({
        where: and(
          eq(homeTable.brandId, brand.id),
          eq(homeTable.url, brand.featuredListingUrl),
          isNull(homeTable.deletedAt),
        ),
        columns: { externalId: true },
      })
    : null;
  return (
    <CatalogCards
      brandId={brand.id}
      brandName={brand.name}
      heroHomeId={hero?.externalId ?? null}
    />
  );
}
