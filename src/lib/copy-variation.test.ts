import { expect, test } from "bun:test";
import { sameCopyHook } from "./copy-variation";

test("regeneration cannot count punctuation and casing changes as a new hook", () => {
  expect(
    sameCopyHook(
      "River-view loft in Louisville, KY",
      "RIVER VIEW loft in Louisville KY!",
    ),
  ).toBe(true);
  expect(
    sameCopyHook("River-view loft", "A gathering place above Main Street"),
  ).toBe(false);
  expect(sameCopyHook("", "")).toBe(false);
});
