import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brandListings } from "@/server/services/wanderos-listings.service";
import { listAdSet } from "@/server/services/ad-set.service";

import { brandAvatarUrl, loadPerformanceBrand } from "../_data";

import { CreativePanel } from "../../../CreativePanel";
import { loadLaunchWorkspace } from "../../../load-launch-workspace";
import { MAX_SET_HOMES } from "@/lib/performance-ads";

import { AdPreviewsWorkspace, type WorkspaceHome } from "./AdPreviewsWorkspace";
import { ReviewInChatButton } from "../ReviewInChatButton";
import type { StudioIdea } from "./StudioIdeas";

export const metadata: Metadata = {
  title: "Ad studio · Wander Performance",
};
export const dynamic = "force-dynamic";

/**
 * The client's ad studio: every idea with no campaign yet, filed under the
 * home it is about. A set can be drawn from a pick of homes (carried in
 * `?homes=` so a link opens on it) or from a count, and any idea can be made
 * by hand and filled by upload.
 */
export default async function PerformanceBrandAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ homes?: string; focus?: string; view?: string }>;
}) {
  const [{ brandSlug }, query] = await Promise.all([params, searchParams]);
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const studioBase = `/app/performance/brands/${brand.slug ?? brand.id}/ads`;
  const views = (
    <nav
      aria-label="Ad studio views"
      className="mb-5 inline-flex rounded-lg border bg-muted/40 p-1"
    >
      {[
        { id: "ideas", label: "Ad ideas" },
        { id: "preview", label: "Property preview" },
      ].map((item) => (
        <Link
          key={item.id}
          href={`${studioBase}?view=${item.id}`}
          aria-current={
            (
              query.view === "preview"
                ? item.id === "preview"
                : item.id === "ideas"
            )
              ? "page"
              : undefined
          }
          className={`rounded-md px-3 py-2 text-xs font-medium ${(query.view === "preview" ? item.id === "preview" : item.id === "ideas") ? "bg-background shadow-xs" : "text-muted-foreground"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
  if (query.view === "preview") {
    const workspace = await loadLaunchWorkspace({ brand, deskBrand });
    return (
      <div>
        {views}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Property creative preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare homes and formats before building ads. Previews do not
            create or publish ads.
          </p>
        </div>
        <CreativePanel brandId={brand.id} homes={workspace.homes} />
      </div>
    );
  }

  const [listings, avatarUrl, drafted] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    brandAvatarUrl(brand),
    listAdSet({ brandId: brand.id, orgId: org.id }),
  ]);
  const ideas: StudioIdea[] = drafted.flatMap((ad) =>
    "media" in ad.content
      ? [
          {
            id: ad.id,
            name: ad.name,
            content: ad.content,
            status: ad.status,
            updatedAt: ad.updatedAt.toISOString(),
            homeId: ad.homeId,
            home: ad.home
              ? {
                  name: ad.home.name,
                  url: ad.home.url,
                  externalId: ad.home.externalId,
                }
              : null,
          },
        ]
      : [],
  );
  const homes: WorkspaceHome[] = listings
    .filter((home) => home.imageUrl)
    .map((home) => ({
      id: home.id,
      name: home.name,
      url: home.url,
      imageUrl: home.imageUrl!,
      thumbUrl: home.thumbUrl ?? null,
      city: home.city ?? null,
      state: home.state ?? null,
      country: home.country ?? null,
      bedrooms: home.bedrooms ?? null,
      bathrooms: home.bathrooms ?? null,
      guests: home.guests ?? null,
      rating: home.rating ?? null,
      nightlyFrom: home.nightlyFrom ?? null,
    }));
  const withoutPhoto = listings.length - homes.length;

  // The URL's ids if the link carries them, else the homes the drafted set was
  // actually built from, else nothing. Never a guess: a set picked for them
  // reads exactly like one they picked, and disagrees with the set below.
  const ids = new Set(homes.map((home) => home.id));
  const fromUrl = (query.homes ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => ids.has(id));
  const fromSet = [
    ...new Set(
      drafted.flatMap((ad) =>
        ad.home?.externalId && ids.has(ad.home.externalId)
          ? [ad.home.externalId]
          : [],
      ),
    ),
  ];
  // A per-home link (`?focus=`) opens on one home: scroll to it if it is drawn,
  // and pre-tick it *on top of* the set already drawn so a rebuild draws it
  // without dropping the rest. `buildAdSet` replaces the whole set, so pre-
  // ticking only the focused home would silently wipe the others.
  const focusHomeId = (query.focus ?? "").trim();
  const focused = focusHomeId && ids.has(focusHomeId) ? focusHomeId : null;
  const initialPicked = (
    focused
      ? [...new Set([...fromSet, focused])]
      : fromUrl.length > 0
        ? fromUrl
        : fromSet
  ).slice(0, MAX_SET_HOMES);

  // Where approved ads can go. Only a campaign nothing has been pushed for
  // can still take ads; a live one is Meta's to edit.
  const campaigns = (deskBrand?.campaigns ?? [])
    .filter((campaign) =>
      campaign.platforms.every((row) => row.status === "draft"),
    )
    .map((campaign) => ({ id: campaign.id, name: campaign.name }));

  const slug = brand.slug ?? brand.id;

  return (
    <>
      {views}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Ad studio · {ideas.length}</h1>
        <div className="flex items-center gap-3">
          {drafted.length > 0 ? (
            <ReviewInChatButton
              brandId={brand.id}
              brandName={brand.name}
              surface="ads"
            />
          ) : null}
          <Link
            className="text-sm underline"
            href={`/app/performance/brands/${slug}/campaigns`}
          >
            View campaign ads
          </Link>
        </div>
      </div>
      <AdPreviewsWorkspace
        brandId={brand.id}
        brandSlug={slug}
        brandName={brand.name}
        brandLogo={avatarUrl}
        homes={homes}
        withoutPhoto={withoutPhoto}
        initialPicked={initialPicked}
        ideas={ideas}
        campaigns={campaigns}
        hasSite={listings.length > 0}
        website={brand.website}
        focusHomeId={focused}
      />
    </>
  );
}
