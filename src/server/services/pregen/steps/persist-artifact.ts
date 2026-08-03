import "server-only";

import { count, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeArtifactTable,
  pregenNativeBuildTable,
} from "@/server/db/schema";

import type { StepContext } from "../pipeline";

/**
 * Pure assembly: move the build's checkpointed draft into a versioned
 * artifact row. Everything creative happened upstream; this step exists so
 * "an artifact row exists" is exactly equivalent to "the build succeeded".
 */
export async function persistArtifactStep(ctx: StepContext) {
  const build = await db.query.pregenNativeBuildTable.findFirst({
    where: eq(pregenNativeBuildTable.id, ctx.buildId),
    columns: { draftConfig: true, draftPages: true },
  });

  if (!build?.draftConfig || !build.draftPages?.length) {
    throw new Error("persist_artifact: build has no draft config/pages");
  }

  const [prior] = await db
    .select({ n: count() })
    .from(pregenNativeArtifactTable)
    .where(eq(pregenNativeArtifactTable.prospectId, ctx.prospectId));

  await db.insert(pregenNativeArtifactTable).values({
    buildId: ctx.buildId,
    prospectId: ctx.prospectId,
    version: (prior?.n ?? 0) + 1,
    config: build.draftConfig,
    pages: build.draftPages,
  });

  return { pages: build.draftPages.length };
}
