import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { syncBlogDraft } from "./draft-mirror";
import { serializeArticleMdx, type MdxArticleRun } from "./mdx";

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
  test("updates an unchanged draft from a new run but preserves operator edits", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "blog-mirror-"));
    try {
      const first = await syncBlogDraft(run, root);
      const revised = structuredClone(run);
      revised.runId = "fixture-second";
      revised.stages.article.sections[0]!.markdown = "New reviewed details.";
      await syncBlogDraft(revised, root);
      expect(await readFile(first.mdxPath, "utf8")).toContain(
        "New reviewed details.",
      );
      await writeFile(
        first.mdxPath,
        `${await readFile(first.mdxPath, "utf8")}\nMy manual edit.\n`,
      );
      const refusal = await syncBlogDraft(run, root).catch(
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).toContain("local edits");
      expect(await readFile(first.mdxPath, "utf8")).toContain(
        "My manual edit.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("never resets an operator's publication date", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "blog-mirror-"));
    try {
      const mirror = await syncBlogDraft(run, root);
      const mdx = await readFile(mirror.mdxPath, "utf8");
      await writeFile(mirror.mdxPath, mdx.replace("9999-12-31", "2026-01-01"));
      const refusal = await syncBlogDraft(run, root).catch(
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).toContain("publication date");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("exports model prose as inert Markdown and exposes synthetic evidence", () => {
    const record = structuredClone(run);
    record.stages.article.sections[0]!.markdown = "<script>{danger()}</script>";
    const mdx = serializeArticleMdx(record);
    expect(mdx).toContain("&lt;script>&#123;danger()&#125;");
    expect(mdx).toContain("Synthetic facts for layout review only.");
    expect(mdx).toContain('publishedAt: "9999-12-31"');
    record.stages.article.sections[0]!.markdown = 'export const secret = "bad"';
    expect(() => serializeArticleMdx(record)).toThrow("module statement");
  });
});
