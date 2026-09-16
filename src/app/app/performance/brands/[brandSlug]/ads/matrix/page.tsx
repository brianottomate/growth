import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { listAdSet } from "@/server/services/ad-set.service";
import { brandListings } from "@/server/services/wanderos-listings.service";

import { SectionLabel } from "../../../../_components";
import { brandAvatarUrl, loadPerformanceBrand } from "../../_data";
import { PlacementMatrix } from "./PlacementMatrix";
import { toMatrixHomes } from "./build";

export const metadata: Metadata = { title: "Matrix · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The confidence matrix, full width: every home a row group, every placement a
 * column, every cell a live render of the base creative unless a decision was
 * made on it. Loaded from `?homes=` like the ads handoff. The Ads tab renders
 * the same matrix inline; this is the room-to-breathe view a per-home link
 * opens on.
 */
export default async function PlacementMatrixPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ homes?: string }>;
}) {
  const [{ brandSlug }, query] = await Promise.all([params, searchParams]);
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const [listings, avatarUrl, ads] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    brandAvatarUrl(brand),
    listAdSet({ brandId: brand.id, orgId: org.id }),
  ]);

  const wanted = new Set(
    (query.homes ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const homes = toMatrixHomes(ads, wanted);

  return (
    // Break out of the centered max-w-5xl column so all placements have room
    // (the app layout's scroll div is the @container).
    <div className="mx-[calc(((100cqw-min(100cqw,64rem))/2+2rem)*-1)] space-y-4 px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>
          Matrix{homes.length ? ` · ${homes.length} homes` : ""}
        </SectionLabel>
        <span className="text-[11px] text-muted-foreground">
          {listings.length > 0
            ? "Every placement of every ad. A cell renders the base until you override or freeze it."
            : "No WanderOS feed on this brand."}
        </span>
      </div>
      {homes.length === 0 ? (
        <p className="rounded-2xl border bg-card px-4 py-10 text-center text-xs text-muted-foreground">
          No ads yet. Build a set on the Ads tab, then the matrix fills in.
        </p>
      ) : (
        <PlacementMatrix
          homes={homes}
          brandId={brand.id}
          brandName={brand.name}
          brandLogo={avatarUrl}
        />
      )}
    </div>
  );
}
