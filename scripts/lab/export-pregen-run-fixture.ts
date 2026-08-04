import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import { pregenNativeBuildTable } from "../../src/server/db/schema";

const buildId = process.argv[2];

if (!buildId) {
  throw new Error(
    "Usage: bun --conditions=react-server scripts/lab/export-pregen-run-fixture.ts <build-id>",
  );
}

const build = await db.query.pregenNativeBuildTable.findFirst({
  where: eq(pregenNativeBuildTable.id, buildId),
  with: {
    prospect: true,
    artifact: true,
    crawlPages: true,
  },
});

if (!build?.prospect || !build.artifact) {
  throw new Error(`No complete Pregen run found for ${buildId}`);
}

const homepage = build.crawlPages.find((page) => page.kind === "homepage");
const fixture = {
  schemaVersion: "pregen-real-run-fixture/v1",
  exportedAt: new Date().toISOString(),
  source: {
    buildId: build.id,
    artifactId: build.artifact.id,
    artifactVersion: build.artifact.version,
    provenance: "Preserved from a real persisted Pregen build",
  },
  prospect: {
    id: build.prospect.id,
    name: build.prospect.name,
    domain: build.prospect.domain,
    sourceUrl: build.prospect.sourceUrl,
    status: build.prospect.status,
  },
  build: {
    id: build.id,
    status: build.status,
    currentStep: build.currentStep,
    stepLog: build.stepLog,
    brandKit: build.brandKit,
    extractedProperties: build.extractedProperties,
    startedAt: build.startedAt,
    finishedAt: build.finishedAt,
  },
  sourceCorpus: {
    homepage: homepage
      ? {
          id: homepage.id,
          url: homepage.url,
          kind: homepage.kind,
          markdown: homepage.markdown,
          metadata: homepage.metadata,
        }
      : null,
    pages: build.crawlPages.map((page) => ({
      id: page.id,
      url: page.url,
      kind: page.kind,
      metadata: page.metadata,
    })),
  },
  artifact: {
    id: build.artifact.id,
    version: build.artifact.version,
    config: build.artifact.config,
    pages: build.artifact.pages,
    createdAt: build.artifact.createdAt,
  },
};

const fixtureName = `${slugify(build.prospect.domain)}-artifact-v${build.artifact.version}`;
const fixtureDirectory = path.resolve("fixtures/pregen", fixtureName);
const fixturePath = path.join(fixtureDirectory, "fixture.json");

await mkdir(fixtureDirectory, { recursive: true });
await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

console.log(fixturePath);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
