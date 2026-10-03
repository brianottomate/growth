import Link from "next/link";
import { notFound } from "next/navigation";

import { posts } from "#velite";
import { MDXContent } from "@/components/mdx/MDXContent";
import { Prose } from "@/components/mdx/Prose";

export default async function BlogBuilderPreview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = posts.find(
    (candidate) =>
      candidate.slug === slug && candidate.slug.startsWith("builder-"),
  );
  if (!post) notFound();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/lab/blog-workbench" className="text-sm underline">
        Back to blog builder
      </Link>
      <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        Internal draft preview. Review source evidence, writing, media and links
        before publishing.
      </p>
      <h1 className="mt-10 mb-8 text-4xl font-semibold tracking-tight">
        {post.h1}
      </h1>
      <Prose>
        <MDXContent code={post.content} />
      </Prose>
    </main>
  );
}
