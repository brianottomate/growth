import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { NewslettersView } from "@/app/app/newsletters/NewslettersView";

import { loadPerformanceBrand } from "../_data";

export const metadata: Metadata = { title: "Email · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceBrandNewslettersPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ kind?: string; view?: string }>;
}) {
  const [{ brandSlug }, { kind, view }] = await Promise.all([
    params,
    searchParams,
  ]);
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const slug = brand.slug ?? brand.id;
  return (
    <NewslettersView
      brands={[{ id: brand.id, name: brand.name, slug: brand.slug }]}
      brand={{ id: brand.id, name: brand.name, slug: brand.slug }}
      basePath={`/app/performance/brands/${slug}/newsletters`}
      kindFilter={kind}
      view={view === "wall" || view === "read" ? view : "list"}
    />
  );
}
