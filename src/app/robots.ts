import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/", // Home
          "/blog", // Blog
          "/blog/*", // Blog posts
          "/contact",
          "/privacy",
          "/terms",
        ],
        disallow: [
          "/app/*", // Block authenticated app pages
          "/api/*", // Block API routes
          "/signin", // Block auth pages
          "/signup",
          "/reset-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: "https://example.com/sitemap.xml",
  };
}
