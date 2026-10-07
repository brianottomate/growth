import { ClientPreviewLink } from "../ads/ClientPreviewLink";
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ClientPageActivity } from "../ClientPageActivity";
import { loadPerformanceBrand } from "../_data";
import { OnboardingEmailCard } from "./OnboardingEmailCard";

export const metadata: Metadata = { title: "Extra · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceBrandExtraPage({
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
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Extra</h2>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div>
          <h3 className="text-sm font-semibold">Client preview</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Share approved ads and a catalog export with your client.
          </p>
        </div>
        <ClientPreviewLink brandId={brand.id} />
      </section>
      <Suspense fallback={null}>
        <OnboardingEmailCard brandId={brand.id} orgId={org.id} />
      </Suspense>
      <ClientPageActivity brandId={brand.id} orgId={org.id} />
    </div>
  );
}
