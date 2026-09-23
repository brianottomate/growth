import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

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

  return <CatalogCards brandId={brand.id} />;
}
