import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { seoEngineResponseSchema, type SeoEngineResponse } from "./contract";
import type { DatoDraftExport } from "./datocms";
import type { BlogRunRecord } from "./run";
import { visualDirectionsSchema, type VisualDirection } from "./workflow";

const FIXTURE_DIR = path.resolve("fixtures/blog");
const FIXTURE_RESPONSE = path.join(FIXTURE_DIR, "seo-engine-response.json");

export async function loadLatestBlogRun(): Promise<BlogRunRecord | null> {
  try {
    const pointer = JSON.parse(
      await readFile(path.join(FIXTURE_DIR, "runs", "latest.json"), "utf8"),
    ) as { runId: string };
    return JSON.parse(
      await readFile(
        path.join(FIXTURE_DIR, "runs", pointer.runId, "run.json"),
        "utf8",
      ),
    ) as BlogRunRecord;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
    return null;
  }
}

export async function loadDatoDraft(
  runId: string,
): Promise<DatoDraftExport | null> {
  try {
    return JSON.parse(
      await readFile(
        path.join(FIXTURE_DIR, "runs", runId, "datocms-draft.json"),
        "utf8",
      ),
    ) as DatoDraftExport;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
    return null;
  }
}

export async function loadRawFixture(): Promise<SeoEngineResponse> {
  return seoEngineResponseSchema.parse(
    JSON.parse(await readFile(FIXTURE_RESPONSE, "utf8")),
  );
}

export async function loadBlogVisualDirections(): Promise<VisualDirection[]> {
  return visualDirectionsSchema.parse(
    JSON.parse(
      await readFile(path.join(FIXTURE_DIR, "visual-directions.json"), "utf8"),
    ),
  );
}
