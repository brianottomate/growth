import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  pregenNativeCrawlPageTable,
} from "@/server/db/schema";
import { rankUnitImages } from "../generation/image-ranking";
import {
  applyPriceEstimates,
  dropJunkUnits,
  extractPropertiesFromPages,
  fillUnitDetailsFromNames,
  rankAndTrim,
  toGalleryUnits,
} from "../generation/units";

import type { StepContext } from "../pipeline";

/** Below this many units the gallery reads as broken; the build should fail
 * loudly rather than ship a two-card grid. (Monolith MIN_GALLERY_UNITS.) */
const MIN_GALLERY_UNITS = 3;

/**
 * Property extraction (monolith: prospect-enrichment steps 4–6). Reads the
 * crawl step's listing captures, extracts + grounds + filters units, and
 * checkpoints them on the build row — the artifact API serves them to the
 * renderer's property-gallery at build time (no search override needed).
 */
export async function injectPropertiesStep(ctx: StepContext) {
  const [build, listingPages] = await Promise.all([
    db.query.pregenNativeBuildTable.findFirst({
      where: eq(pregenNativeBuildTable.id, ctx.buildId),
      columns: { brandKit: true },
    }),
    db.query.pregenNativeCrawlPageTable.findMany({
      where: and(
        eq(pregenNativeCrawlPageTable.buildId, ctx.buildId),
        eq(pregenNativeCrawlPageTable.kind, "property"),
      ),
      columns: { url: true, markdown: true, metadata: true },
    }),
  ]);

  if (listingPages.length === 0) {
    throw new Error("inject_properties: no listing pages captured by crawl");
  }

  const { properties, pageText } = await extractPropertiesFromPages(
    listingPages.map((page) => ({
      url: page.url,
      markdown: page.markdown ?? "",
      imageUrls: asStringArray(page.metadata?.imageUrls),
    })),
  );

  const kept = await dropJunkUnits(properties);
  const filled = fillUnitDetailsFromNames(kept);
  const priced = await applyPriceEstimates(
    filled,
    build?.brandKit?.businessName ?? "",
    pageText,
  );
  // Vision-rank each surviving unit's photos before the 3-image slice: the
  // crawl's order leads with bathrooms and laundry rooms often enough that an
  // unranked lead image is the main thing making a preview look generated.
  const ranked = await rankUnitImages(rankAndTrim(priced));
  const units = toGalleryUnits(ranked);

  if (units.length < MIN_GALLERY_UNITS) {
    throw new Error(
      `inject_properties: only ${units.length} renderable units (need ${MIN_GALLERY_UNITS}) — extracted ${properties.length}, ${kept.length} after junk filter`,
    );
  }

  await db
    .update(pregenNativeBuildTable)
    .set({ extractedProperties: units })
    .where(eq(pregenNativeBuildTable.id, ctx.buildId));

  return {
    extracted: properties.length,
    afterJunkFilter: kept.length,
    galleryUnits: units.length,
  };
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
