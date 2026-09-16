import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import type { AdCreativeContent } from "@/server/db/ads-schema";
import { listAdSet } from "@/server/services/ad-set.service";
import { brandListings } from "@/server/services/wanderos-listings.service";
import { adFormatOf, AD_FORMAT_LABEL } from "@/lib/performance-ads";
import { coverage, resolveMatrix } from "@/lib/ad-placements";

import { SectionLabel } from "../../../../_components";
import { brandAvatarUrl, loadPerformanceBrand } from "../../_data";
import {
  PlacementMatrix,
  type MatrixAd,
  type MatrixHome,
} from "./PlacementMatrix";

export const metadata: Metadata = { title: "Matrix · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The confidence matrix: every home a row group, every placement a column,
 * every cell a live render of the base creative unless a decision was made on
 * it. Loaded from `?homes=` like the ads handoff. Reads renders; writes only
 * happen on an explicit override or freeze.
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

  const groups = new Map<string, MatrixHome>();
  for (const ad of ads) {
    const content = ad.content as AdCreativeContent;
    if (!Array.isArray(content.media) || content.media.length === 0) continue;
    const homeKey = ad.home?.externalId ?? ad.homeId ?? "unbound";
    if (wanted.size > 0 && !wanted.has(homeKey)) continue;

    const resolved = resolveMatrix({ content, placements: ad.placements });
    const matrixAd: MatrixAd = {
      id: ad.id,
      name: ad.name,
      format: AD_FORMAT_LABEL[adFormatOf(content)],
      base: {
        headline: content.headline,
        body: content.body,
        callToAction: content.callToAction ?? null,
      },
      photoOnly: content.photoOnly ?? false,
      coverage: coverage(resolved),
      cells: resolved.map((cell) => ({
        key: cell.key,
        label: cell.spec.label,
        shortLabel: cell.spec.shortLabel,
        surface: cell.spec.surface,
        crop: cell.spec.crop,
        state: cell.state,
        fitIssues: cell.fit.issues,
        frozenAt: cell.frozenAt,
        copy: {
          headline: cell.copy.headline,
          body: cell.copy.body,
          callToAction: cell.copy.callToAction,
        },
        cards: cell.cards.map((card) => ({
          url: card.url,
          thumbnail: card.thumbnail,
          type: card.type,
        })),
      })),
    };

    const group = groups.get(homeKey);
    if (group) group.ads.push(matrixAd);
    else {
      groups.set(homeKey, {
        key: homeKey,
        name: ad.home?.name ?? "Not bound to a home",
        ads: [matrixAd],
      });
    }
  }

  const homes = [...groups.values()];

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
          brandName={brand.name}
          brandLogo={avatarUrl}
        />
      )}
    </div>
  );
}
