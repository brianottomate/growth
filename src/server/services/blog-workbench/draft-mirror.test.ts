import type { MdxArticleRun } from "./mdx";
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { syncBlogDraft } from "./draft-mirror";
const run: MdxArticleRun = {
  runId: "fixture-first",
  stages: {
    normalizedBrief: {
      workingTitle: "A mountain weekend",
      targetQuery: "a mountain weekend",
    },
    grounding: {
      version: "synthetic-fixture/v1",
      provenance: "Synthetic facts for layout review only.",
    },
    article: {
      metaTitle: "A mountain weekend",
      metaDescription: "Plan a mountain weekend.",
      sections: [
        {
          heading: "Plan the trip",
          markdown: "Read the verified facts before booking.",
        },
      ],
    },
  },
};
describe("Velite draft mirror", () => {
  test("refresh preserves the publication date", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "blog-mirror-"));
    try {
      const mirror = await syncBlogDraft(run, root);
      const mdx = await readFile(mirror.mdxPath, "utf8");
      await writeFile(mirror.mdxPath, mdx.replace("9999-12-31", "2026-01-01"));
      const revised = structuredClone(run);
      revised.stages.article.sections[0]!.markdown = "New reviewed details.";
      await syncBlogDraft(revised, root);
      const refreshed = await readFile(mirror.mdxPath, "utf8");
      expect(refreshed).toContain('publishedAt: "2026-01-01"');
      expect(refreshed).toContain("New reviewed details.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
