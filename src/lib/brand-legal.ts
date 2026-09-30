import type { BrandLegalIdentity } from "@/server/db/brand-schema";

/** "Wander.com, Inc. · 200 Academy Drive, Suite 200 · Austin, TX 78704" */
export function legalAddressLine(legal: BrandLegalIdentity | null | undefined) {
  const address = legal?.address;
  if (!address?.line1) return null;
  const street = [address.line1, address.line2].filter(Boolean).join(", ");
  const place = [
    address.city,
    [address.region, address.postalCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const country =
    address.country && address.country !== "US" ? address.country : null;
  return [legal?.legalName, street, place, country].filter(Boolean).join(" · ");
}
