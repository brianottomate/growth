// @ts-nocheck -- Bun's test module is runtime-provided and not in app TS libs.
import { describe, expect, test } from "bun:test";

import {
  audienceDemographicsSchema,
  audienceGeographySchema,
  audienceSlug,
} from "./audience-model";

describe("audience model", () => {
  test("keeps global and specific geography distinct", () => {
    expect(
      audienceGeographySchema.parse({ mode: "global", exclude: [] }).mode,
    ).toBe("global");
    expect(
      audienceGeographySchema.parse({
        mode: "specific",
        include: [
          { name: "United States", level: "country", countryCode: "US" },
        ],
        exclude: [],
      }).mode,
    ).toBe("specific");
  });

  test("rejects a specific scope without included markets", () => {
    expect(() =>
      audienceGeographySchema.parse({
        mode: "specific",
        include: [],
        exclude: [],
      }),
    ).toThrow();
  });

  test("rejects inverted demographic ranges", () => {
    expect(() =>
      audienceDemographicsSchema.parse({ ageRange: { min: 45, max: 25 } }),
    ).toThrow();
  });

  test("creates stable profile slugs", () => {
    expect(audienceSlug("Repeat / Upgrade Searchers")).toBe(
      "repeat-upgrade-searchers",
    );
  });
});
