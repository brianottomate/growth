import { expect, test } from "bun:test";
import { audienceMapCoverage, audienceMapTarget } from "./audience-map";

test("broad US highlights every US state but not foreign countries", () => {
  const targets = [audienceMapTarget({ countries: ["US"] })];
  expect(audienceMapCoverage(targets, "us", "CO")).toBe("full");
  expect(audienceMapCoverage(targets, "us", "AK")).toBe("full");
  expect(audienceMapCoverage(targets, "world", "US")).toBe("full");
  expect(audienceMapCoverage(targets, "world", "CA")).toBe("none");
});
test("Colorado saved as a region narrows US coverage and marks the world view partial", () => {
  const targets = [
    audienceMapTarget({ countries: ["US"], regions: ["Colorado"] }),
  ];
  expect(audienceMapCoverage(targets, "us", "CO")).toBe("full");
  expect(audienceMapCoverage(targets, "us", "CA")).toBe("none");
  expect(audienceMapCoverage(targets, "world", "US")).toBe("partial");
  expect([...audienceMapTarget({ states: ["co"] }).states]).toEqual(["CO"]);
});
test("city-only and unresolved regions never imply state-wide targeting", () => {
  const target = audienceMapTarget({
    countries: ["US"],
    cities: ["Denver"],
    regions: ["Front Range"],
  });
  expect(audienceMapCoverage([target], "us", "CO")).toBe("none");
  expect(audienceMapCoverage([target], "world", "US")).toBe("partial");
  expect(target.unlocated).toEqual(["Denver", "Front Range"]);
});
test("foreign region codes are not confused with US states; empty targeting is not worldwide", () => {
  expect([
    ...audienceMapTarget({ countries: ["CA"], regions: ["CA"] }).states,
  ]).toEqual([]);
  expect(audienceMapCoverage([audienceMapTarget(null)], "world", "US")).toBe(
    "none",
  );
});
test("combined broad and narrow audiences show their union", () => {
  const targets = [
    audienceMapTarget({ countries: ["US"] }),
    audienceMapTarget({ countries: ["US"], states: ["CO"] }),
  ];
  expect(audienceMapCoverage(targets, "us", "NY")).toBe("full");
  expect(audienceMapCoverage(targets, "world", "US")).toBe("full");
  expect(audienceMapCoverage(targets.slice(1), "us", "NY")).toBe("none");
});
