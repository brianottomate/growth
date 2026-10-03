import "server-only";
import {
  fetchMarketplaceListing,
  marketplaceRef,
} from "@/server/clients/wander-marketplace.client";

export type BlogPropertyMedia = {
  href: string;
  listingId: string;
  name: string;
  image: string;
  alt: string;
  source: string;
  fetchedAt: string;
  rating: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  location: string | null;
};

/** Resolve exact article links; never use a similar home's photo as a fallback. */
export async function resolveBlogPropertyMedia(hrefs: string[]) {
  const properties: BlogPropertyMedia[] = [];
  const missing: { href: string; reason: string }[] = [];
  const unique = [...new Set(hrefs)];
  for (let i = 0; i < unique.length; i += 4) {
    await Promise.all(
      unique.slice(i, i + 4).map(async (href) => {
        const ref = marketplaceRef(href);
        if (!ref) {
          missing.push({ href, reason: "Not a Wander property link" });
          return;
        }
        try {
          const listing = await fetchMarketplaceListing(ref);
          if (!listing?.coverUrl || listing.slug !== ref) {
            missing.push({
              href,
              reason: "Exact listing or cover unavailable",
            });
            return;
          }
          properties.push({
            href,
            listingId: listing.id,
            name: listing.name,
            image:
              listing.photos.find((photo) => photo.url === listing.coverUrl)
                ?.thumbUrl ?? listing.coverUrl,
            alt: `${listing.name} listing cover`,
            source: `https://api.wander.com/guest-api/listings/v2/${encodeURIComponent(ref)}`,
            fetchedAt: new Date().toISOString(),
            rating: listing.rating ? Math.round(listing.rating * 5) / 10 : null,
            bedrooms: listing.bedrooms,
            bathrooms: listing.bathrooms,
            location:
              [listing.city, listing.state].filter(Boolean).join(", ") || null,
          });
        } catch (error) {
          missing.push({
            href,
            reason:
              error instanceof Error ? error.message : "Listing lookup failed",
          });
        }
      }),
    );
  }
  return {
    version: "wander-marketplace-media/v2",
    properties: properties.sort((a, b) => a.href.localeCompare(b.href)),
    missing: missing.sort((a, b) => a.href.localeCompare(b.href)),
  };
}
