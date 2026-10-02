import { expect, test } from "bun:test";
import { adCopyChatSection } from "./ad-copy-chat";
import { catalogHomeSection } from "./catalog-home";
import {
  ideaContextActionOutputSchema,
  catalogHomeFactsActionOutputSchema,
} from "../capabilities/outputs/ads";
import { defaultIdeaRecipe } from "@/lib/ad-idea-studio";

const copy = {
  headline: "Your river-view weekend",
  body: "Stay together in Louisville",
  description: "Sleeps 14",
  linkUrl: "",
  callToAction: "Book now",
};
const card = {
  id: "card_1",
  mode: "compose" as const,
  source: { url: "https://example.com/photo.jpg" },
  recipe: defaultIdeaRecipe("hero_static"),
  overrides: {},
  copy: { headline: "The river-view loft", description: "Six bedrooms" },
};

test("chat proposes complete sets before saving and uses the chosen words with current versions", () => {
  const prompt = adCopyChatSection({
    adId: "ad_1",
    copyRules: "Use listing facts",
    snapshot: { copy },
  });
  expect(prompt).toContain("four or five numbered");
  expect(prompt).toContain(
    "Do not save or reopen an ad merely because chat was opened",
  );
  expect(prompt).toContain("apply that option directly with adsWrite.saveIdea");
  expect(prompt).toContain("current document and updatedAt");
  expect(prompt).toContain("Sleeps 14");
  const catalog = catalogHomeSection({
    homeName: "Loft",
    homeId: "listing_1",
    brandName: "Hollyhock",
    brandId: "brand_1",
    heroPhotoNumber: 1,
    card: null,
    place: null,
    listing: { description: null },
    siblings: [],
    brandWide: [],
    existingCopy: { copy },
    copyPrompt: "Production template guidance",
  });
  expect(catalog).toContain("four or five numbered");
  expect(catalog).toContain(
    "apply those exact chosen words with adsWrite.editCatalogCard",
  );
  expect(catalog).toContain("Production template guidance");
  expect(catalog).toContain("Sleeps 14");
});

test("MCP context preserves captions, placement descriptions and individual carousel card text", () => {
  const snapshot = {
    campaignId: "campaign_1",
    campaignName: "Weekend",
    brand: {
      id: "brand_1",
      name: "Hollyhock",
      story: "Gather together",
      voice: null,
    },
    ad: {
      id: "ad_1",
      name: "Loft",
      updatedAt: "2026-10-01T12:00:00.000Z",
      approved: false,
      document: {
        role: "hero_static",
        shapes: ["square"],
        copy,
        copyOverrides: { story: copy },
        cards: [card],
      },
    },
    copyRules: "Facts only",
    homes: [
      {
        id: "home_1",
        name: "Loft",
        url: "https://example.com",
        market: null,
        existingCopy: null,
      },
    ],
    images: [],
  };
  const parsed = ideaContextActionOutputSchema.parse(snapshot);
  expect(parsed.ad.document.copy.description).toBe("Sleeps 14");
  expect(parsed.ad.document.copyOverrides.story?.description).toBe("Sleeps 14");
  expect(parsed.ad.document.cards[0]?.copy?.headline).toBe(
    "The river-view loft",
  );
  const catalog = catalogHomeFactsActionOutputSchema.parse({
    brand: {
      id: "brand_1",
      name: "Hollyhock",
      story: "Gather together",
      voice: null,
    },
    homes: [
      {
        homeId: "listing_1",
        name: "Loft",
        url: "https://example.com",
        headline: "River-view loft",
        card: null,
        existingCopy: {
          listingId: "listing_1",
          catalog: {
            headline: "River-view loft",
            subtitle: null,
            pills: null,
            templateId: null,
          },
          ads: [
            {
              adId: "ad_1",
              campaignId: "campaign_1",
              name: "Loft",
              copy,
              copyOverrides: { story: copy },
              cards: [card],
            },
          ],
        },
        market: null,
        copyRules: "Production template guidance",
        bedrooms: 6,
        bathrooms: 4,
        guests: 14,
        petsAllowed: null,
        amenities: [],
        description: null,
        locationDescription: null,
      },
    ],
    unknown: [],
  });
  expect(catalog.homes[0]?.existingCopy?.ads[0]?.copy.description).toBe(
    "Sleeps 14",
  );
});

test("copy chat discusses one ad without changing its artwork", () => {
  const prompt = adCopyChatSection({
    adId: "ad_1",
    snapshot: { copy },
    copyRules: "Facts only",
    copyOnly: true,
  });
  expect(prompt).toContain("two or three numbered");
  expect(prompt).toContain("Keep pictures, overlay image text");
  expect(prompt).toContain("Do not save merely because chat was opened");
  expect(prompt).not.toContain("proactively offer four or five");
});
