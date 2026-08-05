import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import {
  pregenNativeArtifactTable,
  pregenNativeBuildTable,
  pregenNativeProspectTable,
  type PregenNativeExtractedProperty,
  type PregenNativePage,
  type PregenNativeSiteConfig,
} from "../../src/server/db/schema";

// Imports a monolith-built prospect site into growth's pregen tables so the
// standalone renderer can serve it by token.
//
// Why this exists: the monolith's Temporal pipeline produced richer sites than
// the growth-native pipeline does today (real multi-page sites with hero,
// content, team and services sections). Triggering a fresh monolith build needs
// an org API key we do not have yet, but sites already built on a local stack
// are just data. This carries that data across so a demo does not wait on a
// credential.
//
// The import is deliberately faithful about provenance: the artifact keeps the
// monolith's own config and pages, and the prospect row records the real source
// URL. What it does NOT carry over is the monolith previewToken (encrypted at
// rest, and meaningless to growth) — growth mints its own plaintext `pv_` token,
// because growth's API is what authorizes these reads.
//
//   bun --conditions=react-server scripts/lab/import-monolith-artifact.ts <file.json>

type Exported = {
  prospect: { domain: string; name: string | null; sourceUrl: string };
  websiteId: string;
  version: number;
  config: PregenNativeSiteConfig;
  extractedProperties: PregenNativeExtractedProperty[];
  pages: PregenNativePage[];
};

const file = process.argv[2];
if (!file) {
  throw new Error(
    "Usage: bun --conditions=react-server scripts/lab/import-monolith-artifact.ts <file.json>",
  );
}

const data = JSON.parse(await readFile(file, "utf8")) as Exported;
const { domain, name, sourceUrl } = data.prospect;

// Homepage first: the renderer resolves `/` to the first page whose kind is
// HOMEPAGE, and a site whose first entry is "about-us" reads as broken.
const pages = [...data.pages].sort((a, b) => {
  const rank = (p: PregenNativePage) =>
    p.kind === "HOMEPAGE" || p.slug === "" || p.slug === "home" ? 0 : 1;
  return rank(a) - rank(b);
});

const existing = await db.query.pregenNativeProspectTable.findFirst({
  where: eq(pregenNativeProspectTable.domain, domain),
  columns: { id: true, previewToken: true },
});

const prospect =
  existing ??
  (
    await db
      .insert(pregenNativeProspectTable)
      .values({ domain, name, sourceUrl, status: "preview_ready" })
      .returning({ id: pregenNativeProspectTable.id, previewToken: pregenNativeProspectTable.previewToken })
  )[0]!;

const now = new Date();
const [build] = await db
  .insert(pregenNativeBuildTable)
  .values({
    prospectId: prospect.id,
    status: "succeeded",
    currentStep: "persist_artifact",
    stepLog: [
      {
        step: "persist_artifact" as const,
        startedAt: now.toISOString(),
        finishedAt: now.toISOString(),
        stats: {
          importedPages: pages.length,
          importedUnits: data.extractedProperties.length,
        },
      },
    ],
    extractedProperties: data.extractedProperties,
    startedAt: now,
    finishedAt: now,
  })
  .returning();

// Re-importing the same prospect should replace its artifact, not stack a
// second one behind it — the renderer takes the newest, but leaving stale rows
// makes "which artifact am I looking at" unanswerable.
await db
  .delete(pregenNativeArtifactTable)
  .where(eq(pregenNativeArtifactTable.prospectId, prospect.id));

const [artifact] = await db
  .insert(pregenNativeArtifactTable)
  .values({
    buildId: build!.id,
    prospectId: prospect.id,
    version: 1,
    config: data.config,
    pages,
  })
  .returning({ id: pregenNativeArtifactTable.id });

const label = domain.replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9-]+/gi, "-");
console.log(`prospect  ${prospect.id} (${domain})`);
console.log(`build     ${build!.id}`);
console.log(`artifact  ${artifact!.id} — ${pages.length} pages, ${data.extractedProperties.length} units`);
console.log(`monolith  websiteId ${data.websiteId}`);
console.log(`preview   https://${label}.swot.cloud/?t=${prospect.previewToken}`);
