import { expect, it } from "bun:test";
import { catalogExportSchema, type CatalogExport } from "@/lib/catalog-studio";
import { catalogStateActionOutputSchema } from "./catalog";
import { brandMarkSchema, type BrandMark } from "@/lib/brand-mark";
import {
  performanceChecklistSchema,
  type PerformanceChecklist,
} from "@/lib/performance-checklist";

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

it("accepts saved brand marks and launch checklists", () => {
  // Shapes saved in production when previewIntakeApply's hand-copied schema
  // rejected them; the canonical schemas own these columns now.
  const mark: BrandMark = {
    source: "lockup",
    text: null,
    reason: "Bold and legible at small size.",
    fontFamily: "Hedvig Letters Serif",
    fontWeight: null,
    letterSpacing: null,
    iconFrom: null,
    iconAssetId: null,
    vector: null,
    tuning: { note: "", gapScale: 1, iconScale: 1, iconShift: 0 },
    variants: { color: "media_c", dark: "media_d", white: "media_w" },
    previewCopy: {
      cta: "Book Direct",
      headline: "A Local Base in the Hills",
      supportingLine: "Family-run homes, booked direct.",
    },
    updatedAt: "2026-10-15T16:51:37.189Z",
  };
  const signed = {
    at: "2026-10-15T12:00:00.000Z",
    by: "usr_fixture",
    item: "signed",
    byName: "Operator",
    source: "manual",
    checked: true,
    skipped: false,
    evidence: null,
  } as const;
  const checklist: PerformanceChecklist = {
    launch: {
      items: { signed },
      history: [signed],
      receipts: [],
      revision: 1,
    },
  };
  expect(brandMarkSchema.parse(mark)).toEqual(mark);
  expect(performanceChecklistSchema.parse(checklist)).toEqual(checklist);
});
