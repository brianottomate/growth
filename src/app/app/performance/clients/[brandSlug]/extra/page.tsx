import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ClientPageActivity } from "../ClientPageActivity";
import { loadPerformanceBrand } from "../_data";

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
      <ClientPageActivity brandId={brand.id} orgId={org.id} />
    </div>
  );
}
