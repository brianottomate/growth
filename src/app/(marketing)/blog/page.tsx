import { Suspense } from "react";

import { env } from "@/env";

import { posts as allPosts } from ".velite";
import { BlogPageContent } from "./BlogPageContent";

const ogImageUrl = `${env.NEXT_PUBLIC_BASE_URL}/api/og/blog?title=${encodeURIComponent("Wander Growth Blog")}&description=${encodeURIComponent("Insights and updates")}`;

export const metadata = {
  title: "Blog | Wander Growth - Insights and Updates",
  description:
    "Expert insights, helpful tips, and updates about our platform and industry.",
  keywords: ["blog", "insights", "tips", "updates", "news"],
  openGraph: {
    title: "Wander Growth Blog - Insights and Updates",
    description: "Expert insights and helpful tips for using our platform.",
    type: "website",
    url: "/blog",
    siteName: "Wander Growth",
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: "Wander Growth Blog - Insights and Updates",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wander Growth Blog - Insights and Updates",
    description: "Expert insights and helpful tips for using our platform.",
    images: [ogImageUrl],
    creator: "@wandercom",
  },
  alternates: {
    types: {
      "application/rss+xml": "/blog/feed.xml",
    },
  },
};

export default function BlogPage() {
  const publishedPosts = allPosts.filter((post) => post.isPublished);
  const sortedPosts = publishedPosts.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  // Manually specify featured post slugs (up to 3)
  const FEATURED_SLUGS = [
    "together-we-could-hinge-prompt",
    "tinder-statistics",
    "best-rizz-pickup-lines",
  ];

  return (
    <Suspense fallback={<div className="container py-12">Loading...</div>}>
      <BlogPageContent
        allPosts={sortedPosts}
        featuredSlugs={FEATURED_SLUGS}
        title="Insights and Updates"
        description="Expert insights and helpful tips for using our platform."
      />
    </Suspense>
  );
}
