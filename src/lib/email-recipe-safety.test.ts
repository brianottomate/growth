import { expect, test } from "bun:test";
import {
  assertNoDemoContent,
  assertRecipeContext,
  unsupportedRecipeClaims,
} from "./email-recipe-safety";

// These failures would invent reservation facts or leak demo data into another brand.
test("recipe generation refuses missing facts, unsafe actions and cross-brand demo content", () => {
  const base = {
    brandId: "brand",
    template: "brian-booking-booking-receipt" as const,
  };
  expect(() => assertRecipeContext(base)).toThrow("verified context");
  expect(() =>
    assertRecipeContext({
      ...base,
      verifiedContext: {
        booking: "Confirmed booking",
        receipt: "Paid total",
        tripUrl: "javascript:alert(1)",
      },
    }),
  ).toThrow("HTTPS");
  expect(() =>
    assertRecipeContext({
      brandId: "brand",
      template: "brian-booking-browse-abandon",
      verifiedContext: { viewedHome: "A real home" },
    }),
  ).toThrow("homeIds");
  expect(() =>
    assertNoDemoContent("Book Hope Bay Cabin at bluewaterhaven.com"),
  ).toThrow("demo-brand");
  expect(() =>
    assertNoDemoContent("Enjoy [home A] for [verified amount]"),
  ).toThrow("demo-brand");
  assertRecipeContext({
    ...base,
    verifiedContext: {
      booking: "Verified reservation",
      receipt: "Verified paid line items",
      tripUrl: "https://example.com/trips/verified",
    },
  });
});

test("planning titles cannot supply opening hours or availability claims", () => {
  expect(unsupportedRecipeClaims("Weekend lifts open at 8am")).toHaveLength(1);
  expect(
    unsupportedRecipeClaims("Last chance: only 2 homes left"),
  ).toHaveLength(1);
  expect(
    unsupportedRecipeClaims("Lifts open at 8am", {
      event: "Verified resort operating hours: 8am",
    }),
  ).toHaveLength(0);
});
