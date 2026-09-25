import { expect, test } from "bun:test";
import { brandWideAmenities, hasEmDash } from "./catalog-copy";

const cabin = (...amenities: string[]) => ({ amenities });

test("amenities on nearly every home are the brand's", () => {
  const homes = [
    cabin("Hot tub", "Pool outdoor", "Sauna"),
    cabin("Hot tub", "Pool outdoor", "Pool table"),
    cabin("Hot tub", "Pool outdoor"),
    cabin("hot tub ", "Pool outdoor", "Fire pit"),
    cabin("Hot tub", "Fire pit"),
  ];
  expect(brandWideAmenities(homes)).toEqual(["Hot tub", "Pool outdoor"]);
});

test("a small catalog has no brand-wide amenities", () => {
  expect(brandWideAmenities([cabin("Hot tub"), cabin("Hot tub")])).toEqual([]);
});

test("a label listed twice on one home counts once", () => {
  const homes = [
    cabin("Sauna", "Sauna", "Sauna", "Sauna", "Sauna"),
    cabin(),
    cabin(),
    cabin(),
    cabin(),
  ];
  expect(brandWideAmenities(homes)).toEqual([]);
});

test("em dashes are caught, hyphens and en dashes are not", () => {
  expect(hasEmDash("Hot tub — fire pit")).toBe(true);
  expect(hasEmDash("A-frame with a hot tub")).toBe(false);
  expect(hasEmDash("Sleeps 4–6")).toBe(false);
});
