import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "oxfmt";

import { blogDraftSlug, serializeArticleMdx, type MdxArticleRun } from "./mdx";

type MirrorReceipt = { runId: string; slug: string; mdxHash: string };

/** Refresh an unmodified local draft; never replace operator edits or published content. */
export async function syncBlogDraft(
  record: MdxArticleRun,
  root = process.cwd(),
) {
  const slug = blogDraftSlug(record);
  const mdxPath = path.join(root, "content/posts", `${slug}.mdx`);
  const receiptPath = path.join(root, "fixtures/blog/drafts", `${slug}.json`);
  const formatted = await format(mdxPath, serializeArticleMdx(record), {
    printWidth: 80,
  });
  if (formatted.errors.length)
    throw new Error(
      "The generated MDX could not be formatted; draft refresh refused.",
    );
  const generated = formatted.code;
  const current = await readOptional(mdxPath);
  const savedReceipt = await readOptional(receiptPath);
  const receipt: MirrorReceipt | null = savedReceipt
    ? (JSON.parse(savedReceipt) as MirrorReceipt)
    : null;
  if (current !== null) {
    // Date changes require an operator decision even if body text still matches.
    if (!/^publishedAt: "9999-12-31"$/m.test(current))
      throw new Error(
        `Draft ${slug} has a changed publication date; mirror refresh refused.`,
      );
    if (!receipt || receipt.mdxHash !== digest(current))
      throw new Error(
        `Draft ${slug} has local edits. Keep editing its MDX or reconcile it with the new run; automatic refresh refused.`,
      );
  }
  await mkdir(path.dirname(mdxPath), { recursive: true });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(mdxPath, generated, "utf8");
  await writeFile(
    receiptPath,
    `${JSON.stringify({ runId: record.runId, slug, mdxHash: digest(generated) } satisfies MirrorReceipt, null, 2)}\n`,
    "utf8",
  );
  return { slug, mdxPath, previewPath: `/lab/blog-workbench/preview/${slug}` };
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}

function digest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
