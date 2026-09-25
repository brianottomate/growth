import { expect, test } from "bun:test";
import { safeHomeUrl } from "./ad-preview-links";

test("home links preserve existing absolute http(s) listing destinations", () => {
  for (const url of [
    "https://stay.example.com/homes/lake-house?guests=6#amenities",
    "http://stay.example.com/property/123",
  ]) {
    expect(safeHomeUrl(`  ${url}  `)).toBe(url);
  }
});

test("missing, malformed and unsafe home destinations do not become links", () => {
  for (const value of [
    undefined,
    null,
    "",
    "   ",
    {},
    42,
    "/homes/lake-house",
    "//stay.example.com/home",
    "stay.example.com/home",
    "javascript:alert(1)",
    "data:text/html,test",
    "ftp://stay.example.com/home",
    "https://",
    "https://user:password@stay.example.com/home",
  ]) {
    expect(safeHomeUrl(value)).toBeNull();
  }
});
