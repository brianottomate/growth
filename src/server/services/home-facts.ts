import type { WanderOsListing } from "@/server/clients/wanderos-site.client";

/** "3 bedrooms · 2 baths · 8 guests", from whatever the feed gave us. */
export function homeFacts(listing: WanderOsListing): string {
  const count = (n: number | undefined, one: string, many: string) =>
    n ? `${n} ${n === 1 ? one : many}` : null;
  return [
    count(listing.bedrooms, "bedroom", "bedrooms"),
    count(listing.bathrooms, "bath", "baths"),
    count(listing.guests, "guest", "guests"),
  ]
    .filter(Boolean)
    .join(" · ");
}
