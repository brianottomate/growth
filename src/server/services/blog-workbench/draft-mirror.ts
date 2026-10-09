import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "oxfmt";

import { blogDraftSlug, serializeArticleMdx, type MdxArticleRun } from "./mdx";

/** Refresh the article from the requested run, preserving its publication date. */
export async function syncBlogDraft(
  record: MdxArticleRun,
  root = process.cwd(),
) {
  const slug = blogDraftSlug(record);
  const mdxPath = path.join(root, "content/posts", `${slug}.mdx`);
  const current = await readOptional(mdxPath);
  const publicationDate = current?.match(/^publishedAt:.*$/m)?.[0];
  const formatted = await format(
    mdxPath,
    publicationDate
      ? serializeArticleMdx(record).replace(
          /^publishedAt:.*$/m,
          () => publicationDate,
        )
      : serializeArticleMdx(record),
    {
      printWidth: 80,
    },
  );
  if (formatted.errors.length)
    throw new Error(
      "The generated MDX could not be formatted; draft refresh refused.",
    );
  const generated = formatted.code;
  await mkdir(path.dirname(mdxPath), { recursive: true });
  await writeFile(mdxPath, generated, "utf8");
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
