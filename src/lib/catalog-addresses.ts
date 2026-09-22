import type { CatalogHome } from "./catalog-studio";
import type { HotelFeedRow } from "./meta-hotel-feed";

export type CatalogAddress = {
  homeId: string;
  streetAddress: string | null;
  streetAddress2: string | null;
  streetAddress3: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function enrichCatalogAddresses(
  homes: CatalogHome[],
  addresses: CatalogAddress[],
): CatalogHome[] {
  const byId = new Map(addresses.map((address) => [address.homeId, address]));
  return homes.map((home) => {
    const address = byId.get(home.id);
    if (!address) return { ...home };
    const { homeId: _homeId, ...fields } = address;
    return { ...home, ...fields };
  });
}

export function catalogAddressIssues(rows: HotelFeedRow[]) {
  return rows.flatMap((row) => {
    const missing = [
      !row.streetAddress && "street address",
      !row.city && "city",
      !row.region && "region",
      !row.postalCode && "postal code",
      !row.country && "country",
      row.latitude == null && "latitude",
      row.longitude == null && "longitude",
    ].filter(Boolean);
    const invalid =
      row.latitude != null &&
      row.longitude != null &&
      (!Number.isFinite(row.latitude) ||
        !Number.isFinite(row.longitude) ||
        Math.abs(row.latitude) > 90 ||
        Math.abs(row.longitude) > 180 ||
        (row.latitude === 0 && row.longitude === 0));
    return missing.length || invalid
      ? [
          `${row.title}: ${[missing.length ? `missing ${missing.join(", ")}` : null, invalid ? "invalid coordinates" : null].filter(Boolean).join("; ")}`,
        ]
      : [];
  });
}
