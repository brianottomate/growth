import { expect, it } from "bun:test";
import type { z } from "zod";
import { catalogExportSchema, type CatalogExport } from "@/lib/catalog-studio";
import { catalogStateActionOutputSchema } from "./catalog";
import { previewIntakeApplyActionOutputSchema } from "./performance";

it("accepts persisted catalog exports with their render metadata", () => {
  const saved: CatalogExport = {
    id: "export_fixture",
    status: "ready",
    createdAt: "2026-10-05T15:00:00.000Z",
    error: null,
    primaryFormat: "square",
    assets: [
      {
        homeId: "home_fixture",
        name: "Suite 402",
        assetId: "asset_fixture",
        url: "https://example.com/image.png",
        format: "square",
        renderKey: "render_fixture",
        reused: true,
      },
    ],
  };
  expect(catalogStateActionOutputSchema.shape.exports.parse([saved])).toEqual([
    saved,
  ]);
  expect(
    catalogExportSchema.safeParse({ ...saved, undeclared: true }).success,
  ).toBe(false);
});

it("accepts current brand settings in intake previews", () => {
  const brand =
    previewIntakeApplyActionOutputSchema.shape.intake.shape.brand.unwrap();
  const settings: z.output<typeof brand.shape.performanceSettings> = {
    terms: "Monthly",
    endDate: null,
    siteLive: "yes",
    monthlyFee: 500,
    agreedAdSpend: 1000,
    effectiveDate: "2026-10-01",
    catalogFormatId: "square",
    logoOnCreatives: true,
    catalogTemplateId: "catalog-place",
    homeInventory: {
      syncedAt: "2026-10-05T15:00:00.000Z",
      homes: [
        {
          id: "home_fixture",
          name: "Suite 402",
          url: "https://example.com/suite-402",
          slug: "suite-402",
          amenities: ["Soaking tub"],
          reviewCount: 12,
        },
      ],
    },
  };
  expect(brand.shape.performanceSettings.parse(settings)).toEqual(settings);
});
