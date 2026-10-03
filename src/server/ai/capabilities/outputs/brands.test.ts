import { expect, test } from "bun:test";
import {
  getBrandOutputSchema,
  setPerformanceSettingsActionOutputSchema,
} from "./brands";
import type { PerformanceSettings } from "@/server/db/brand-schema";

// A status-only update returns the complete saved settings, including inventory
// populated by the catalog. Reads and write receipts must accept those same facts.
test("brand reads and status receipts preserve enriched home amenities", () => {
  for (const amenities of [["Lake access", "Hot tub"], [], null, undefined]) {
    const settings: PerformanceSettings = {
      pipelineStage: "launch_prep",
      homeInventory: {
        syncedAt: "2026-10-03T06:00:00.000Z",
        homes: [
          {
            id: "home",
            name: "Lake house",
            url: "https://example.com/home",
            amenities,
          },
        ],
      },
    };
    const receipt = setPerformanceSettingsActionOutputSchema.parse({
      brandId: "brand",
      changed: ["pipelineStage"],
      ok: true,
      path: "/app/performance/brands/client",
      settings,
    });
    const read = getBrandOutputSchema.parse({
      brand: {
        id: "brand",
        name: "Client",
        relationship: "client",
        slug: "client",
        tagline: null,
        website: "https://example.com",
        logo: null,
        description: null,
        story: null,
        enrichment: { scrapedAt: null, hasBrandIdentity: false },
        performanceSettings: settings,
      },
    });
    expect(receipt.settings).toEqual(settings);
    expect(read.brand.performanceSettings).toEqual(settings);
  }
});
