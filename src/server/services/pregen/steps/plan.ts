import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  pregenNativeCrawlPageTable,
} from "@/server/db/schema";
import { evaluateHomepage } from "../generation/brand-kit";

import type { StepContext } from "../pipeline";

/**
 * Brand-kit evaluation (monolith: `siteEditorEvaluateHomepage`). Reads the
 * crawl step's homepage capture, extracts business context via the ported
 * Haiku prompt, and checkpoints the kit on the build row for the copy step.
 *
 * Tone is fixed to "existing" for pregen: the pitch is "your site, upgraded",
 * so preserving the prospect's own voice is the demo. Legacy color/font
 * branding extraction is deferred — previews render on WanderOS defaults.
 */
export async function planStep(ctx: StepContext) {
  const homepage = await db.query.pregenNativeCrawlPageTable.findFirst({
    where: and(
      eq(pregenNativeCrawlPageTable.buildId, ctx.buildId),
      eq(pregenNativeCrawlPageTable.kind, "homepage"),
    ),
    columns: { url: true, markdown: true, metadata: true },
  });
  if (!homepage?.markdown) {
    throw new Error("plan: no homepage capture for this build");
  }

  const brandKit = await evaluateHomepage(
    {
      url: homepage.url,
      title: asString(homepage.metadata?.title),
      description: asString(homepage.metadata?.description),
      markdown: homepage.markdown,
    },
    "existing",
  );

  await db
    .update(pregenNativeBuildTable)
    .set({ brandKit })
    .where(eq(pregenNativeBuildTable.id, ctx.buildId));

  return { locations: brandKit.locations.length };
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
