import { expect, test } from "bun:test";
import {
  enrichCatalogAddresses,
  catalogAddressIssues,
  type CatalogAddress,
} from "./catalog-addresses";
import { catalogFeedCells, CATALOG_FEED_COLUMNS } from "./catalog-studio";
import { hotelFeedRows } from "./meta-hotel-feed";

test("warehouse enrichment joins exact string IDs and freezes addresses in feed cells", () => {
  const homes = ["703310677183303225", "703310677183303226"].map((id) => ({
    id,
    name: id,
    url: "https://example.com/home",
    imageUrl: "https://example.com/frozen.png",
  }));
  const address: CatalogAddress = {
    homeId: homes[0]!.id,
    streetAddress: "12 Main St",
    streetAddress2: "Unit 2",
    streetAddress3: null,
    city: "Town",
    state: "CA",
    postalCode: "00123",
    country: "US",
    latitude: 38.5,
    longitude: -122.7,
  };
  const enriched = enrichCatalogAddresses(homes, [address]);
  expect(enriched[1]?.streetAddress).toBeUndefined();
  const rows = hotelFeedRows(enriched, "Brand");
  const cells = Object.fromEntries(
    CATALOG_FEED_COLUMNS.map((key, index) => [
      key,
      catalogFeedCells(rows[0]!)[index],
    ]),
  );
  expect(cells.hotel_id).toBe("703310677183303225");
  expect(cells["address.addr1"]).toBe("12 Main St, Unit 2");
  expect(cells["address.postal_code"]).toBe("00123");
  expect(cells.latitude).toBe("38.5");
  expect(catalogAddressIssues(rows)).toHaveLength(1);
  address.streetAddress = "Changed later";
  expect(rows[0]?.streetAddress).toBe("12 Main St");
});

test("missing street stays blank and is flagged without discarding coordinates", () => {
  const [row] = hotelFeedRows(
    [
      {
        id: "1",
        name: "Casita",
        url: "https://example.com",
        imageUrl: "https://example.com/image",
        latitude: 23.03,
        longitude: -109.7,
        city: "Cabo",
        state: "BCS",
        country: "MX",
        postalCode: "23405",
        streetAddress: null,
      },
    ],
    "Brand",
  );
  expect(catalogAddressIssues([row!])).toEqual([
    "Casita: missing street address",
  ]);
  expect(catalogFeedCells(row!)[CATALOG_FEED_COLUMNS.indexOf("latitude")]).toBe(
    "23.03",
  );
});
