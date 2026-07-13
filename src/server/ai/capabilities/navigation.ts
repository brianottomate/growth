import "server-only";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { defineCapability } from "./types";

const surfaceSchema = z.enum([
  "overview",
  "next",
  "review",
  "brands",
  "brand_map",
  "channels",
  "website",
  "audiences",
  "plan",
  "create",
  "studio",
  "content",
  "calendar",
  "campaigns",
  "timeline",
  "feed",
  "blog",
  "newsletters",
  "ads",
  "inbox",
  "listen",
  "media",
  "pillars",
  "people",
]);

const ROUTES: Record<
  Exclude<z.infer<typeof surfaceSchema>, "brand_map">,
  string
> = {
  overview: "/app/next",
  next: "/app/next",
  review: "/app/review",
  brands: "/app/brands",
  channels: "/app/channels",
  website: "/app/website",
  audiences: "/app/audiences",
  plan: "/app/next?intent=plan",
  create: "/app/next?intent=create",
  studio: "/app/next?intent=create",
  content: "/app/content",
  calendar: "/app/calendar",
  campaigns: "/app/campaigns",
  timeline: "/app/feed-v5",
  feed: "/app/feed",
  blog: "/app/blog",
  newsletters: "/app/newsletters",
  ads: "/app/ads",
  inbox: "/app/inbox",
  listen: "/app/listen",
  media: "/app/media",
  pillars: "/app/pillars",
  people: "/app/people",
};

/**
 * A portable navigation request. In-app chat executes it with router.push;
 * other adapters (including MCP) receive the canonical app URL to open.
 */
export const navigateWorkspace = defineCapability({
  name: "navigateWorkspace",
  description:
    "Navigate the operator to a workspace surface. Use only when the operator explicitly asks to open, show, take them to, or switch to a page. /app/next is the single conversational home; the other surfaces are for inspection and editing. For a specific brand map or brand-aware Next conversation, pass a brandId from listBrands. The in-app client follows the returned route; MCP clients receive the same canonical URL.",
  inputSchema: z.object({
    surface: surfaceSchema,
    brandId: z
      .string()
      .optional()
      .describe(
        "Used for a specific brand_map or brand-aware Next conversation; use an id from listBrands.",
      ),
  }),
  readOnly: true,
  domain: "overview",
  execute: async (input, ctx) => {
    if (input.surface === "next" && input.brandId) {
      const brand = await db.query.brandTable.findFirst({
        where: and(
          eq(brandTable.id, input.brandId),
          eq(brandTable.organizationId, ctx.orgId),
          isNull(brandTable.deletedAt),
        ),
        columns: { id: true, name: true },
      });
      if (!brand) {
        return {
          error: "That brand is not available in this organization.",
          href: "/app/next",
        };
      }
      return {
        action: "navigate" as const,
        surface: "next" as const,
        brandName: brand.name,
        href: `/app/next?brandId=${encodeURIComponent(brand.id)}`,
      };
    }

    if (input.surface !== "brand_map") {
      return {
        action: "navigate" as const,
        surface: input.surface,
        href: ROUTES[input.surface],
      };
    }

    if (!input.brandId) {
      return {
        action: "navigate" as const,
        surface: "brands" as const,
        href: "/app/brands",
        note: "No brandId was supplied, so the brand index was opened.",
      };
    }

    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { name: true, slug: true },
    });
    if (!brand?.slug) {
      return {
        error: "That brand is not available in this organization.",
        href: "/app/brands",
      };
    }

    return {
      action: "navigate" as const,
      surface: "brand_map" as const,
      brandName: brand.name,
      href: `/app/brands/${brand.slug}`,
    };
  },
});
