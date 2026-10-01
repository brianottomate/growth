import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { HomeGroupsWorkspace } from "@/app/app/brands/[brandSlug]/homes/HomeGroupsWorkspace";
import { brandTabHref, loadPerformanceBrand } from "../_data";

export const metadata: Metadata = {
  title: "Homes & targets · Wander Performance",
};
export const dynamic = "force-dynamic";

export default async function PerformanceBookingPage({
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Homes & booking targets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable home groups for {brand.name}. Featured homes is your default
          selection.
        </p>
      </div>
      <HomeGroupsWorkspace
        brandId={brand.id}
        brandSlug={brandSlug}
        setupHref={`${brandTabHref(brandSlug, "setup")}#booking`}
      />
    </div>
  );
}
