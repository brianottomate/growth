import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable, personaTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { brandListings } from "@/server/services/wanderos-listings.service";
import { listAdSet } from "@/server/services/ad-set.service";
import { DELIVERY_LABEL } from "@/lib/performance-stage";

import {
  loadPerformanceBrand,
  brandAvatarUrl,
} from "../brands/[brandSlug]/_data";
import { PipelineBoard } from "./PipelineBoard";
import { ClientWorkspace, type WorkspaceData } from "./ClientWorkspace";

export const metadata: Metadata = {
  title: "Client journey (real data) · Wander Performance",
};
export const dynamic = "force-dynamic";

/**
 * The prototype's shell, wired to the real desk. No fixtures: the pipeline is
 * the org's actual Performance brands by delivery stage, and a chosen brand's
 * workspace reads its live homes, ad set, catalog, and campaigns. Selection is
 * a URL param so the server can load only the brand in view.
 */
export default async function PerformancePrototypeRealPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand: brandSlug } = await searchParams;
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization ?? null;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  if (!brandSlug) {
    const desk = await loadPerformanceDesk(org.id);
    return (
      <PipelineBoard
        brands={desk.brands.map((brand) => ({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          website: brand.website,
          relationship: brand.relationship,
          business: brand.business,
          delivery: brand.delivery,
          deliveryLabel: DELIVERY_LABEL[brand.delivery],
          best: brand.best,
          budget: brand.campaigns.reduce((sum, c) => sum + c.budget, 0) || null,
          spend: brand.campaigns.reduce((sum, c) => sum + c.spend, 0) || null,
          adCount: brand.campaigns.reduce((sum, c) => sum + c.adCount, 0),
          hasMark: brand.hasMark,
        }))}
      />
    );
  }

  const { brand, deskBrand } = await loadPerformanceBrand(brandSlug);
  if (!brand) redirect("/app/performance/prototype");

  const [listings, avatarUrl, ads, personas] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    brandAvatarUrl(brand),
    listAdSet({ brandId: brand.id, orgId: org.id }),
    db.query.personaTable.findMany({
      where: and(
        eq(personaTable.brandId, brand.id),
        isNull(personaTable.deletedAt),
      ),
      columns: { id: true, name: true, demandGeography: true },
    }),
  ]);
  const homes = listings
    .filter((home) => home.imageUrl)
    .map((home) => ({
      id: home.id,
      name: home.name,
      imageUrl: home.imageUrl!,
      thumbUrl: home.thumbUrl ?? null,
      city: home.city ?? null,
      state: home.state ?? null,
      bedrooms: home.bedrooms ?? null,
      bathrooms: home.bathrooms ?? null,
      guests: home.guests ?? null,
      rating: home.rating ?? null,
    }));

  // The picked set the ad wall is keyed on, so the workspace leads on the homes
  // this client actually chose, falling back to the first with a photo.
  const boundExternalIds = new Set(
    ads.flatMap((ad) => (ad.home?.externalId ? [ad.home.externalId] : [])),
  );
  const starting = homes.filter((home) => boundExternalIds.has(home.id));

  const data: WorkspaceData = {
    brand: {
      id: brand.id,
      name: brand.name,
      slug: brand.slug ?? brand.id,
      website: brand.website,
      avatarUrl,
      delivery: deskBrand?.delivery ?? "not_started",
      deliveryLabel: DELIVERY_LABEL[deskBrand?.delivery ?? "not_started"],
    },
    budget: {
      monthly: deskBrand?.campaigns.reduce((s, c) => s + c.budget, 0) || null,
      spend: deskBrand?.campaigns.reduce((s, c) => s + c.spend, 0) || null,
    },
    campaigns: (deskBrand?.campaigns ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      budget: c.budget,
      spend: c.spend,
      adCount: c.adCount,
      platforms: c.platforms.map((p) => ({
        platform: p.platform,
        status: p.status,
      })),
    })),
    homes,
    starting: starting.length > 0 ? starting : homes.slice(0, 3),
    adCount: ads.length,
    marketCity: modeCity(homes),
    personas: personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      demandGeography: persona.demandGeography ?? null,
    })),
  };

  return <ClientWorkspace data={data} />;
}

/** The city most of this brand's homes sit in, for the market label. */
function modeCity(homes: { city: string | null; state: string | null }[]) {
  const counts = new Map<string, number>();
  for (const home of homes) {
    const label = [home.city, home.state].filter(Boolean).join(", ");
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = 0;
  for (const [label, count] of counts) {
    if (count > top) {
      top = count;
      best = label;
    }
  }
  return best;
}
