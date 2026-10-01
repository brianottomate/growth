import type { MetadataRoute } from "next";

// Internal back-office: nothing here should be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
