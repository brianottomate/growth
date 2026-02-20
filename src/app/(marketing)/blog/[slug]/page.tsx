import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Calendar, Clock, Instagram } from "lucide-react";

import { AUTHORS, type Author } from "@/lib/blog-authors";
import { env } from "@/env";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";

import { CtaInjector } from "@/components/mdx/CtaInjector";
import { MDXContent } from "@/components/mdx/MDXContent";
import { Prose } from "@/components/mdx/Prose";
import { StickyCtaCard } from "@/components/mdx/StickyCtaCard";
import { posts } from ".velite";
import NewsletterCTA from "../../NewsletterCTA";

export const dynamic = "force-static";

export function generateStaticParams() {
  return posts
    .filter((post) => post.isPublished)
    .map((post) => ({
      slug: post.slug,
    }));
}

function getPostBySlug(slug: string) {
  return posts.find((post) => post.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {};
  }

  const ogImageUrl = `${env.NEXT_PUBLIC_BASE_URL}/api/og/blog?title=${encodeURIComponent(post.metaTitle)}&description=${encodeURIComponent(post.metaDescription || "")}`;

  return {
    title: post.metaTitle,
    description: post.metaDescription,
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [AUTHORS[post.author].name],
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: post.metaTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.metaTitle,
      description: post.metaDescription,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
  };
}

function AuthorCard({
  authorInfo,
  publishedAt,
  updatedAt,
  readingTime,
}: {
  authorInfo: Author;
  publishedAt: string;
  updatedAt?: string;
  readingTime: number;
}) {
  return (
    <div className="bg-surface-primary py-16">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <Heading variant="headline-lg" as="h2" className="text-center">
          About the Author
        </Heading>

        <div className="mx-auto mt-10 max-w-2xl">
          <div className="border-secondary bg-surface-primary flex flex-col items-center rounded-2xl border p-8 shadow-sm">
            <Image
              src={authorInfo.image}
              alt={authorInfo.name}
              width={96}
              height={96}
              className="h-24 w-24 rounded-full object-cover shadow-md"
            />

            <div className="mt-4 flex items-center gap-2">
              <Heading variant="headline-sm" as="h3">
                {authorInfo.name}
              </Heading>
              {authorInfo.instagram && (
                <a
                  href={authorInfo.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary hover:text-primary transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              )}
            </div>

            <Text variant="body" color="secondary" className="mt-2 text-center">
              {authorInfo.description}
            </Text>

            <div className="text-secondary mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-x-2">
                <Calendar className="h-4 w-4" />
                <time dateTime={publishedAt}>
                  {format(parseISO(publishedAt), "MMM dd, yyyy")}
                </time>
              </div>
              <div className="flex items-center gap-x-2">
                <Clock className="h-4 w-4" />
                <span>{readingTime} min read</span>
              </div>
            </div>

            {updatedAt && updatedAt !== publishedAt && (
              <Text variant="body-sm" color="tertiary" className="mt-2">
                Updated {format(parseISO(updatedAt), "MMM dd, yyyy")}
              </Text>
            )}

            <div className="border-secondary mt-8 w-full border-t pt-6">
              <Link
                href="/blog"
                className="text-primary hover:text-secondary flex items-center justify-center gap-2 text-base font-semibold transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Blog
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post?.isPublished) {
    notFound();
  }

  const { content, ...meta } = post;
  const readingTime = meta.readingTime || 5;
  const authorInfo: Author = AUTHORS[meta.author] ?? AUTHORS.default;
  const showStickyCTA = meta.showStickyCTA;

  if (!showStickyCTA) {
    return (
      <div className="bg-surface-primary" lang={meta.language}>
        <div className="mx-auto max-w-4xl px-6 py-24 lg:px-8">
          <div className="mt-8">
            <Heading
              variant={{ base: "display-sm", md: "display" }}
              as="h1"
              className="text-pretty"
            >
              {meta.h1}
            </Heading>

            {meta.h1Subtitle && (
              <Text variant="body-lg-long" color="secondary" className="mt-6">
                {meta.h1Subtitle}
              </Text>
            )}
          </div>

          <div className="mt-16 max-w-none">
            <Prose>
              <MDXContent code={content} />
            </Prose>
            {meta.enableAutoCtAs && (
              <CtaInjector category={meta.category} tags={meta.tags} />
            )}
          </div>
        </div>

        <AuthorCard
          authorInfo={authorInfo}
          publishedAt={meta.publishedAt}
          updatedAt={meta.updatedAt}
          readingTime={readingTime}
        />

        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <NewsletterCTA />
        </div>
      </div>
    );
  }

  // Sticky CTA layout
  return (
    <div className="isolate mt-12" lang={meta.language}>
      {/* Hero Section */}
      <div className="relative px-6 pt-14 lg:px-8">
        <div
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
          aria-hidden="true"
        >
          <div
            className="from-primary/30 to-primary relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr opacity-20 sm:left-[calc(50%-30rem)] sm:w-288.75"
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
          />
        </div>

        <div className="mx-auto max-w-2xl py-16">
          <div className="text-center">
            <Heading
              variant={{ base: "display-sm", md: "display" }}
              as="h1"
            >
              {meta.h1}
            </Heading>
            {meta.h1Subtitle && (
              <Text variant="body-lg-long" color="secondary" className="mt-6">
                {meta.h1Subtitle}
              </Text>
            )}
          </div>
        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="container mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex gap-8 pb-16">
          <div className="mx-auto w-full max-w-3xl flex-1">
            <div className="max-w-none">
              <Prose>
                <MDXContent code={content} />
              </Prose>
              {meta.enableAutoCtAs && (
                <CtaInjector category={meta.category} tags={meta.tags} />
              )}
            </div>
          </div>

          <aside className="hidden w-80 shrink-0 2xl:block">
            <div className="sticky top-24">
              <StickyCtaCard />
            </div>
          </aside>
        </div>
      </div>

      <AuthorCard
        authorInfo={authorInfo}
        publishedAt={meta.publishedAt}
        updatedAt={meta.updatedAt}
        readingTime={readingTime}
      />

      <div className="mx-auto max-w-7xl px-6 pt-16 lg:px-8">
        <NewsletterCTA />
      </div>
    </div>
  );
}
