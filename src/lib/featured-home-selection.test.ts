import { expect, test } from "bun:test";
import { featuredHomeAdditions } from "./featured-home-selection";

test("ranked recommendations add new homes in order without replacing selections", () => {
  expect(featuredHomeAdditions(["B", "A", "B", "C"], ["A"])).toEqual([
    "B",
    "C",
  ]);
});
test("the featured set stays within capacity", () => {
  expect(featuredHomeAdditions(["C", "D"], ["A", "B"], 3)).toEqual(["C"]);
  expect(featuredHomeAdditions(["C"], ["A", "B"], 2)).toEqual([]);
});
