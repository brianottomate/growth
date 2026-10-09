import { expect, test } from "bun:test";
import { studioHomeListing } from "./studio-homes";

const saved = {
  id: "home_manual",
  source: "manual" as const,
  externalId: "manual_123",
  name: "A manually added home",
  url: "https://example.com/home",
  city: null,
  state: null,
  country: null,
  bedrooms: null,
  bathrooms: null,
  guests: null,
  rating: null,
  nightlyFrom: null,
  heroSourceUrl: null,
  featured: false,
  carousel: [],
  galleryCache: [
    {
      url: "https://example.com/photo.jpg",
      thumbUrl: "https://example.com/thumb.jpg",
    },
  ],
};

test("manual homes retain saved identity and photos in Ad studio", () => {
  const listing = studioHomeListing(saved);
  expect(listing.id).toBe("manual_123");
  expect(listing.homeId).toBe("home_manual");
  expect(listing.source).toBe("manual");
  expect(listing.imageUrl).toBe(saved.galleryCache[0]!.url);
  expect(listing.thumbUrl).toBe(saved.galleryCache[0]!.thumbUrl);
  expect(listing.bedrooms).toBeUndefined();
});

test("an operator's hero wins over the gallery's first photo", () => {
  const hero = "https://example.com/chosen.jpg";
  expect(studioHomeListing({ ...saved, heroSourceUrl: hero }).imageUrl).toBe(
    hero,
  );
});

test("homes without photos remain without photos instead of becoming build candidates", () => {
  expect(
    studioHomeListing({ ...saved, galleryCache: null }).imageUrl,
  ).toBeUndefined();
});
