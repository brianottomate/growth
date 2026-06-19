import { defineCollection, defineConfig, s } from "velite";
import { existsSync } from "fs";
import { join } from "path";
import { AUTHOR_KEYS } from "./src/lib/blog-authors";

// Helper function to check if thumbnail exists
function checkThumbnailExists(slug: string): string | null {
  const thumbnailPath = join(
    process.cwd(),
    "public",
    "images",
    "blog",
    "thumbnails",
    `${slug}.png`,
  );
  if (existsSync(thumbnailPath)) {
    return `/images/blog/thumbnails/${slug}.png`;
  }
  // Also check for jpg
  const jpgPath = thumbnailPath.replace(".png", ".jpg");
  if (existsSync(jpgPath)) {
    return `/images/blog/thumbnails/${slug}.jpg`;
  }
  return null;
}

// Note: tags are always lowercase!
const posts = defineCollection({
  name: "Post",
  pattern: "posts/**/*.mdx",
  schema: s
    .object({
      // Primary content (shown in blog)
      h1: s.string().max(120),
      h1Subtitle: s.string().max(200).optional(),

      // SEO metadata (for <head>)
      metaTitle: s.string().max(60),
      metaDescription: s.string().max(160),

      // Publishing & updates
      publishedAt: s.isodate(),
      updatedAt: s.isodate().optional(),

      // Organization
      author: s.enum(AUTHOR_KEYS).default("default"),
      category: s
        .enum([
          "Tutorials", // Step-by-step guides and how-tos
          "Features", // Product features and capabilities
          "Guides", // General guides and best practices
          "News", // Company news and announcements
        ])
        .optional()
        .describe(
          "Optional primary category for the post. Tutorials (step-by-step guides), Features (product features), Guides (best practices), News (announcements)",
        ),
      tags: s
        .array(s.string())
        .optional()
        .default([])
        .describe(
          "Optional tags for additional categorization. Tags are always lowercase. Common suggestions: tutorial, quick-read, getting-started, advanced, etc.",
        ),
      language: s.enum(["en-US", "es-ES", "pt-BR"]).default("en-US"),

      // Optional features
      showStickyCTA: s.boolean().default(true),
      enableAutoCtAs: s.boolean().default(true),
      readingTime: s.number().optional(),

      // Thumbnail image (optional - auto-detected if not provided)
      thumbnail: s.string().optional(),

      // Content
      content: s.mdx(),

      // Auto-generated from filename
      slug: s.path().transform((path) => path.replace(/^posts\//, "")),
    })
    .transform((data) => ({
      ...data,
      permalink: `/blog/${data.slug}`,
      // Published if publishedAt is in the past/present
      isPublished: new Date(data.publishedAt) <= new Date(),
      // Use updatedAt for last modified, fallback to publishedAt
      lastModified: data.updatedAt || data.publishedAt,
      // Use explicit thumbnail from frontmatter, or auto-detect from file system
      thumbnail: data.thumbnail || checkThumbnailExists(data.slug),
    })),
});

// Playbooks — the knowledge base the AI agents ground replies in: product
// reference (transcripts, landing-page copy) and reply/engagement methodology.
// `body` is RAW markdown because it's injected into LLM system prompts, not
// rendered. Mirrors capient's IR playbook collection.
const playbooks = defineCollection({
  name: "Playbook",
  pattern: "playbooks/**/*.md",
  schema: s
    .object({
      id: s.string(),
      title: s.string(),
      kind: s
        .enum(["product-reference", "reply-guide", "positioning"])
        .default("reply-guide")
        .describe(
          "product-reference = what Wander is/says (transcripts, landing pages). reply-guide = how we engage. positioning = competitive/market framing.",
        ),
      summary: s.string().max(280),
      sourceUrl: s.string().optional(),
      tags: s.array(s.string()).default([]),
      // Raw markdown — injected verbatim into LLM prompts + offered as copyables.
      body: s.raw(),
    })
    .transform((data) => ({ ...data, slug: data.id })),
});

export default defineConfig({
  root: "content",
  output: {
    data: ".velite",
    assets: "public/static",
    base: "/static/",
    name: "[name]-[hash:6].[ext]",
    clean: true,
  },
  collections: { posts, playbooks },
  mdx: {
    // We can add remark/rehype plugins here if needed in the future
  },
});
