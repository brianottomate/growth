import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  pregenNativeCrawlPageTable,
} from "@/server/db/schema";
import { rankUnitImages } from "../generation/image-ranking";
import { rehostImages } from "../generation/rehost-images";
import {
  applyPriceEstimates,
  CARD_IMAGES,
  dropJunkUnits,
  extractPropertiesFromPages,
  fillUnitDetailsFromNames,
  rankAndTrim,
  toGalleryUnits,
} from "../generation/units";

import type { StepContext } from "../pipeline";

/**
 * Candidates rehosted per unit. One more than a card shows, so an image that
 * fails to fetch backfills instead of costing a slot. Rehosting is the
 * expensive step here, so the spare is deliberately thin.
 */
const REHOSTED_PER_UNIT = CARD_IMAGES + 1;

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

  // Rehost after ranking, never before: ranking is what removes the logos and
  // wordmarks, and there is no reason to pay a fetch, a decode and a PUT for
  // bytes we are about to throw away.
  const { hosted, passthrough } = await rehostImages(
    ctx.prospectId,
    ranked.flatMap((unit) => unit.imageUrls.slice(0, REHOSTED_PER_UNIT)),
  );
  const units = toGalleryUnits(ranked, hosted);

  // No unit floor. An empty gallery is a preview worth sending, not a failed
  // build: the site itself, the brand and copy and structure, is what the
  // outreach pitches, and the renderer shows an example band in place of an
  // empty one (pregen-preview PropertyGalleryExample) rather than a hole where
  // the "Browse homes" link points. Failing here threw the whole page away —
  // on the monolith side that pattern cost 40% of staging runs and is what
  // wander#21218 removes.

  await db
    .update(pregenNativeBuildTable)
    .set({ extractedProperties: units })
    .where(eq(pregenNativeBuildTable.id, ctx.buildId));

  // Per-stage counts, so a zero gallery is diagnosable from the step log
  // without a re-run: they say whether extraction found nothing, the junk
  // filter ate it, or every image failed to rehost.
  return {
    extracted: properties.length,
    afterJunkFilter: kept.length,
    imageCandidates: ranked.reduce(
      (n, unit) => n + Math.min(unit.imageUrls.length, REHOSTED_PER_UNIT),
      0,
    ),
    imagesHosted: passthrough ? 0 : hosted.size,
    galleryUnits: units.length,
  };
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
