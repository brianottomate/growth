import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { AUTHORS } from "@/lib/blog-authors";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";

import type { Post } from ".velite";

interface BlogGridProps {
  posts: readonly Post[];
  title?: string;
  description?: string;
  showFeatured?: boolean;
  featuredPosts?: readonly Post[];
  basePath?: string;
  searchComponent?: React.ReactNode;
}

function getDisplayImageUrl(post: Post): string {
  if (post.thumbnail) {
    return post.thumbnail;
  }
  const title = encodeURIComponent(post.h1);
  const tag = post.category || post.tags[0] || "dating";
  return `/api/og/display?title=${title}&tag=${encodeURIComponent(tag)}`;
}

function AuthorInfo({
  author,
  authorImage,
  theme = "light",
  className = "mt-8",
}: {
  author: string;
  authorImage?: string;
  theme?: "light" | "dark";
  className?: string;
}) {
  const isDark = theme === "dark";

  return (
    <div
      className={`relative flex cursor-pointer items-center gap-x-4 transition-opacity hover:opacity-70 ${className}`}
    >
      {authorImage ? (
        <Image
          src={
            authorImage.startsWith("/")
              ? authorImage
              : `/images/people/${authorImage}`
          }
          alt={author}
          width={40}
          height={40}
          className={`size-10 flex-none rounded-full object-cover ring-2 ${
            isDark ? "ring-white/20" : "ring-white"
          }`}
        />
      ) : (
        <div
          className={`flex size-10 flex-none items-center justify-center rounded-full ${
            isDark ? "bg-white/10" : "bg-surface-secondary"
          }`}
        >
          <span
            className={`text-sm font-semibold ${isDark ? "text-white" : "text-primary"}`}
          >
            {author.charAt(0)}
          </span>
        </div>
      )}
      <div className="text-sm leading-6">
        <p className={`font-semibold ${isDark ? "text-white" : "text-primary"}`}>
          {author}
        </p>
        <p className={isDark ? "text-gray-300" : "text-secondary"}>Author</p>
      </div>
    </div>
  );
}

function BlogCardSimple({
  post,
  basePath = "/blog",
}: {
  post: Post;
  basePath?: string;
}) {
  return (
    <article className="flex max-w-xl flex-col items-start justify-between">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <time dateTime={post.publishedAt} className="text-tertiary">
          {format(parseISO(post.publishedAt), "MMM dd, yyyy")}
        </time>
        {post.category && (
          <span className="relative z-10 rounded-md bg-linear-to-r from-amber-600 to-amber-700 px-3 py-1.5 font-bold text-white shadow-sm">
            {post.category}
          </span>
        )}
        {(post.tags || []).map((tag: string) => (
          <span
            key={tag}
            className="bg-surface-secondary text-secondary hover:bg-surface-tertiary hover:text-primary relative z-10 rounded-full px-3 py-1.5 font-medium transition-colors"
          >
            #{tag}
          </span>
        ))}
      </div>
      <div className="group relative grow">
        <Heading variant="headline-sm" as="h3" className="mt-3 group-hover:opacity-70">
          <Link href={`${basePath}/${post.slug}`}>
            <span className="absolute inset-0" />
            {post.h1}
          </Link>
        </Heading>
        {(post.h1Subtitle || post.metaDescription) && (
          <Text variant="body" color="secondary" className="mt-3 line-clamp-3">
            {post.h1Subtitle || post.metaDescription}
          </Text>
        )}
      </div>
      <div className="relative mt-8 flex items-center gap-x-4 justify-self-end">
        {AUTHORS[post.author].image ? (
          <Image
            src={
              AUTHORS[post.author].image.startsWith("/")
                ? AUTHORS[post.author].image
                : `/images/people/${AUTHORS[post.author].image}`
            }
            alt={post.author}
            width={40}
            height={40}
            className="bg-surface-secondary size-10 rounded-full"
          />
        ) : (
          <div className="bg-surface-secondary flex size-10 items-center justify-center rounded-full">
            <span className="text-secondary text-sm font-semibold">
              {post.author.charAt(0)}
            </span>
          </div>
        )}
        <div className="text-sm leading-6">
          <p className="text-primary font-semibold">
            <span className="absolute inset-0" />
            {post.author}
          </p>
          <p className="text-secondary">Author</p>
        </div>
      </div>
    </article>
  );
}

export function BlogGrid({
  posts,
  title = "From the blog",
  description = "Learn how to grow your business with our expert advice.",
  showFeatured = false,
  featuredPosts = [],
  basePath = "/blog",
  searchComponent,
}: BlogGridProps) {
  return (
    <main className="bg-surface-primary min-h-screen">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
        {/* Page Header */}
        <div className="space-y-2">
          <Heading variant={{ base: "headline-lg", md: "display-sm" }} as="h1">
            {title}
          </Heading>
          <Text variant="body-lg" color="secondary">
            {description}
          </Text>
        </div>

        {/* Featured Posts Section */}
        {showFeatured && featuredPosts.length > 0 && (
          <div className="border-secondary space-y-6 border-b pb-12">
            <div>
              <Heading variant="headline-lg" as="h2">
                Featured Posts
              </Heading>
              <Text variant="body" color="secondary" className="mt-1">
                Our most popular and impactful content
              </Text>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Main Featured Post */}
              {featuredPosts[0] && (
                <article className="group relative isolate flex flex-col justify-end overflow-hidden rounded-xl bg-neutral-900 px-6 pt-80 pb-6 shadow-lg transition-shadow hover:shadow-xl lg:row-span-2 lg:px-8 lg:pb-8">
                  <div
                    className="absolute inset-0 -z-10"
                    style={{
                      backgroundImage: `url(${getDisplayImageUrl(featuredPosts[0])})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div className="absolute inset-0 -z-10 bg-neutral-900/60 mix-blend-multiply" />
                  <div className="absolute inset-0 -z-10 bg-linear-to-t from-neutral-900 via-neutral-900/70" />
                  <div className="absolute inset-0 -z-10 rounded-xl ring-1 ring-neutral-900/10 ring-inset" />
                  <div className="flex flex-wrap items-center gap-2 overflow-hidden text-sm leading-6 text-gray-300">
                    <time dateTime={featuredPosts[0].publishedAt} className="mr-4">
                      {format(parseISO(featuredPosts[0].publishedAt), "MMM dd, yyyy")}
                    </time>
                    {featuredPosts[0].category && (
                      <span className="relative z-10 cursor-pointer rounded-full bg-amber-600/80 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-amber-600">
                        {featuredPosts[0].category}
                      </span>
                    )}
                    {featuredPosts[0].tags.map((tag) => (
                      <span
                        key={tag}
                        className="relative z-10 cursor-pointer rounded-full bg-white/10 px-3 py-1.5 font-medium text-gray-300 transition-colors hover:bg-white/20 hover:text-white"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h3 className="mt-6 text-3xl leading-tight font-semibold text-white sm:text-4xl sm:leading-tight">
                    <Link
                      href={`${basePath}/${featuredPosts[0].slug}`}
                      className="transition-colors hover:text-white/80"
                    >
                      {featuredPosts[0].h1}
                    </Link>
                  </h3>
                  {(featuredPosts[0].h1Subtitle || featuredPosts[0].metaDescription) && (
                    <Link
                      href={`${basePath}/${featuredPosts[0].slug}`}
                      className="mt-4 line-clamp-3 block text-lg leading-relaxed text-gray-300 hover:text-white"
                    >
                      {featuredPosts[0].h1Subtitle || featuredPosts[0].metaDescription}
                    </Link>
                  )}
                  <AuthorInfo
                    author={featuredPosts[0].author}
                    authorImage={AUTHORS[featuredPosts[0].author].image}
                    theme="dark"
                    className="mt-6"
                  />
                </article>
              )}

              {/* Right Side - Two Smaller Featured Posts */}
              {featuredPosts.slice(1, 3).map((post) => (
                <article
                  key={post.slug}
                  className="group relative isolate flex flex-col justify-end overflow-hidden rounded-xl bg-neutral-900 px-6 pt-60 pb-6 shadow-lg transition-shadow hover:shadow-xl lg:pt-32"
                >
                  <div
                    className="absolute inset-0 -z-10"
                    style={{
                      backgroundImage: `url(${getDisplayImageUrl(post)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div className="absolute inset-0 -z-10 bg-neutral-900/60 mix-blend-multiply" />
                  <div className="absolute inset-0 -z-10 bg-linear-to-t from-neutral-900 via-neutral-900/70" />
                  <div className="absolute inset-0 -z-10 rounded-xl ring-1 ring-neutral-900/10 ring-inset" />
                  <div className="flex flex-wrap items-center gap-2 overflow-hidden text-sm leading-6 text-gray-300">
                    <time dateTime={post.publishedAt} className="mr-2">
                      {format(parseISO(post.publishedAt), "MMM dd, yyyy")}
                    </time>
                    {post.category && (
                      <span className="relative z-10 cursor-pointer rounded-full bg-rose-500/80 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-rose-500">
                        {post.category}
                      </span>
                    )}
                    {post.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="relative z-10 cursor-pointer rounded-full bg-white/10 px-3 py-1.5 font-medium text-gray-300 transition-colors hover:bg-white/20 hover:text-white"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h3 className="mt-4 text-xl leading-tight font-semibold text-white sm:text-2xl sm:leading-tight">
                    <Link
                      href={`${basePath}/${post.slug}`}
                      className="transition-colors hover:text-white/80"
                    >
                      {post.h1}
                    </Link>
                  </h3>
                  {(post.h1Subtitle || post.metaDescription) && (
                    <Link
                      href={`${basePath}/${post.slug}`}
                      className="mt-3 line-clamp-2 block text-sm leading-relaxed text-gray-300 hover:text-white"
                    >
                      {post.h1Subtitle || post.metaDescription}
                    </Link>
                  )}
                  <AuthorInfo
                    author={post.author}
                    authorImage={AUTHORS[post.author].image}
                    theme="dark"
                    className="mt-4"
                  />
                </article>
              ))}
            </div>
          </div>
        )}

        {/* All Posts Grid */}
        <div className="space-y-6">
          <div>
            <Heading variant="headline-lg" as="h2">
              All Posts
            </Heading>
            <Text variant="body" color="secondary" className="mt-1">
              Browse our complete collection of articles and guides
            </Text>
          </div>

          {searchComponent}

          {posts.length > 0 ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-3">
              {posts.map((post) => (
                <BlogCardSimple key={post.slug} post={post} basePath={basePath} />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="border-secondary bg-surface-primary rounded-xl border px-6 py-12 text-center shadow-sm">
                <svg
                  className="text-tertiary mx-auto size-12"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <Heading variant="headline-sm" as="h3" className="mt-4">
                  No posts found
                </Heading>
                <Text variant="body-sm" color="secondary" className="mt-2">
                  Try adjusting your search or filter to find what you&apos;re
                  looking for.
                </Text>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
