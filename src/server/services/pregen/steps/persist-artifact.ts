import "server-only";

import { and, count, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeArtifactTable,
  pregenNativeBuildTable,
  pregenNativeCrawlPageTable,
} from "@/server/db/schema";
import { rankImagesForLead } from "../generation/image-ranking";
import { applyArtifactImages, buildImagePool } from "../generation/images";

import type { StepContext } from "../pipeline";

/**
 * Assembly: fill image slots from crawled sources, then move the build's
 * checkpointed draft into a versioned artifact row. "An artifact row exists"
 * stays exactly equivalent to "the build succeeded".
 */
export async function persistArtifactStep(ctx: StepContext) {
  const [build, homepage] = await Promise.all([
    db.query.pregenNativeBuildTable.findFirst({
      where: eq(pregenNativeBuildTable.id, ctx.buildId),
      columns: { draftConfig: true, draftPages: true, extractedProperties: true },
    }),
    db.query.pregenNativeCrawlPageTable.findFirst({
      where: and(
        eq(pregenNativeCrawlPageTable.buildId, ctx.buildId),
        eq(pregenNativeCrawlPageTable.kind, "homepage"),
      ),
      columns: { metadata: true },
    }),
  ]);

  if (!build?.draftConfig || !build.draftPages?.length) {
    throw new Error("persist_artifact: build has no draft config/pages");
  }

  // Hero and card slots get their own vision pass: these are full-width and
  // first-impression, so "which photo sells this at a glance" matters more here
  // than anywhere else on the page.
  const pool = await rankImagesForLead(
    buildImagePool({
      ogImage: asString(homepage?.metadata?.ogImage),
      homepageImages: asStringArray(homepage?.metadata?.imageUrls),
      units: build.extractedProperties ?? [],
    }),
  );
  const pages = applyArtifactImages(build.draftPages, pool);

  const [prior] = await db
    .select({ n: count() })
    .from(pregenNativeArtifactTable)
    .where(eq(pregenNativeArtifactTable.prospectId, ctx.prospectId));

  await db.insert(pregenNativeArtifactTable).values({
    buildId: ctx.buildId,
    prospectId: ctx.prospectId,
    version: (prior?.n ?? 0) + 1,
    config: build.draftConfig,
    pages,
  });

  return { pages: pages.length };
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
