/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env";
import type { NextConfig } from "next";

const config: NextConfig = {
  // `bun run build` runs the native type checker before compilation. Keeping
  // Next's duplicate checker alive alongside the build exhausts Vercel memory.
  typescript: { ignoreBuildErrors: true },
  // The published email registry is ESM-only. Keep it external so the Node
  // runtime loads its named exports natively instead of passing it through
  // webpack's CommonJS bridge.
  serverExternalPackages: ["@wandercom/design-system-emails", "ffmpeg-static"],
  // Only /api/media/renditions imports ffmpeg-static, so the binary ships
  // with that one function.
  outputFileTracingIncludes: {
    "/api/og": ["./public/auth-hero.jpg"],
    "/api/media/renditions": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  turbopack: {
    root: process.cwd(),
  },
  /** Enable MDX pages */
  pageExtensions: ["ts", "tsx", "md", "mdx"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        // Firecrawl hosts the site screenshots the lead ranker captures, which
        // the Send Review row renders as a thumbnail.
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/firecrawl-scrape-media/**",
      },
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      // The public R2 bucket hosting the brand media library. Derived from
      // R2_PUBLIC_BASE_URL so a bucket swap can't silently break next/image.
      ...(process.env.R2_PUBLIC_BASE_URL
        ? [
            {
              protocol: "https" as const,
              hostname: new URL(process.env.R2_PUBLIC_BASE_URL).hostname,
              pathname: "/**",
            },
          ]
        : []),
    ],
    localPatterns: [
      {
        pathname: "/api/**",
        // Omitting 'search' allows all query strings
      },
      {
        pathname: "/**",
        // Allow all local images (public folder)
      },
    ],
  },
  trailingSlash: false,
  skipTrailingSlashRedirect: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
        ],
      },
      {
        source: "/connect/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        // Campaign drafts lived at /ads/draft/<id> until the ads routes were
        // collapsed onto /ads/<id>. Those links are in chat history and Slack.
        source: "/app/brands/:brandSlug/ads/draft/:campaignId",
        destination: "/app/brands/:brandSlug/ads/:campaignId",
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
};

export default config;
