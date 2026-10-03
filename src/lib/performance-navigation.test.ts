import { expect, test } from "bun:test";
import { performanceClientDestination } from "./performance-navigation";

test("client navigation distinguishes Setup, Settings, and Overview", () => {
  expect(performanceClientDestination("porchlit-properties", "setup")).toEqual({
    href: "/app/performance/brands/porchlit-properties/setup",
    pageLabel: "Setup",
  });
  expect(
    performanceClientDestination("porchlit-properties", "settings"),
  ).toEqual({
    href: "/app/performance/brands/porchlit-properties/settings",
    pageLabel: "Settings",
  });
  expect(
    performanceClientDestination("porchlit-properties", "overview"),
  ).toEqual({
    href: "/app/performance/brands/porchlit-properties",
    pageLabel: "Overview",
  });
});
