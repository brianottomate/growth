import { navigateWorkspaceOutputSchema } from "./outputs/navigation";
import "server-only";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  getSafeWorkspacePath,
  WORKSPACE_ROUTES,
  WORKSPACE_SURFACES,
} from "@/lib/workspace-navigation";
import {
  PERFORMANCE_CLIENT_TABS,
  performanceClientDestination,
} from "@/lib/performance-navigation";
import { growthTool } from "./types";

const surfaceSchema = z.enum(WORKSPACE_SURFACES);

/**
 * A portable navigation request. In-app chat executes it with router.push;
 * other adapters (including MCP) receive the canonical app URL to open.
 */
export const navigateWorkspace = growthTool({
  resultSchema: navigateWorkspaceOutputSchema,
  description:
    'Navigate the operator to a Growth surface. Use only when the operator explicitly asks to open, show, take them to, or switch to a page. The current page is context, not a capability boundary: complete the requested workspace operation first when possible, then navigate to the best inspection or editing surface. When the operator means ONE specific record — this campaign, this content item, this brand\'s ads — use surface "path" with that record\'s own path, which earlier write results already gave you as `path` or `url` (for example /app/brands/<slug>/ads/<campaignId>). A named surface is the INDEX of its kind, so "take me to the campaign" answered with surface "campaigns" lands on the list of every campaign and looks like a half-working navigation. Prefer a named surface only when the operator means the index itself, or when no specific record is in play. For a Performance client page use surface "performance_client", brandId, and clientTab (overview, setup, booking, catalog, campaigns, newsletters, settings, ads, pitch). Setup is /setup, never /settings. The performance_setup surface is a shortcut to that client\'s Setup tab. Use the returned href and pageLabel in the confirmation. For a specific brand map or brand-aware Next conversation, pass a brandId from brandRead.get or brandRead.list. The in-app client follows the returned route; MCP clients receive the same canonical URL.',
  inputSchema: z.object({
    action: z.literal("navigate"),
    surface: surfaceSchema,
    path: z
      .string()
      .optional()
      .describe(
        'Required only for surface "path". Must be an internal /app path, optionally including a query or hash.',
      ),
    clientTab: z
      .enum(PERFORMANCE_CLIENT_TABS)
      .optional()
      .describe(
        "For performance_client; defaults to overview. Setup and Settings are different pages.",
      ),
    brandId: z
      .string()
      .optional()
      .describe(
        "Required for performance_client or performance_setup; also used for brand_map or Next. Use the exact id from brandRead.get or brandRead.list.",
      ),
  }),
  execute: async (input, ctx) => {
    if (
      input.surface === "performance_client" ||
      input.surface === "performance_setup"
    ) {
      const brand = input.brandId
        ? await db.query.brandTable.findFirst({
            where: and(
              eq(brandTable.id, input.brandId),
              eq(brandTable.organizationId, ctx.orgId),
              isNull(brandTable.deletedAt),
            ),
            columns: { slug: true, name: true },
          })
        : null;
      if (!brand?.slug)
        return {
          ok: false as const,
          action: input.action,
          error: {
            code: "not_found",
            message: "That client is not available in this organization.",
            suggestedAction:
              "Find the client with brandRead.get or brandRead.list and pass its brandId.",
          },
        };
      const destination = performanceClientDestination(
        brand.slug,
        input.surface === "performance_setup"
          ? "setup"
          : (input.clientTab ?? "overview"),
      );
      return {
        ok: true as const,
        action: input.action,
        data: { surface: input.surface, brandName: brand.name, ...destination },
      };
    }
    if (input.surface === "path") {
      const href = getSafeWorkspacePath(input.path);
      if (!href) {
        return {
          ok: false as const,
          action: input.action,
          error: {
            code: "invalid_input",
            message: "A workspace path must start with /app.",
            suggestedAction:
              "Use a named surface or pass a real internal /app path.",
          },
        };
      }
      return {
        ok: true as const,
        action: input.action,
        data: { surface: input.surface, href },
      };
    }

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
          ok: false as const,
          action: input.action,
          error: {
            code: "not_found",
            message: "That brand is not available in this organization.",
            suggestedAction:
              "Open the brand index and choose an available brand.",
          },
        };
      }
      return {
        ok: true as const,
        action: input.action,
        data: {
          surface: "next" as const,
          brandName: brand.name,
          href: `/app/next?brandId=${encodeURIComponent(brand.id)}`,
        },
      };
    }

    if (input.surface !== "brand_map") {
      return {
        ok: true as const,
        action: input.action,
        data: {
          surface: input.surface,
          href: WORKSPACE_ROUTES[input.surface],
          // A named surface is a list, and the result used to say only which
          // one — so "take me to the campaign" could be answered with the
          // campaigns index and then narrated as if one campaign had been
          // opened. Naming it a listing keeps the reply honest, and says how
          // to reach the record instead.
          opened: "index" as const,
          note: `Opened the ${input.surface} index, which lists every one. If the operator meant a single record, navigate again with surface "path" and that record's own path.`,
        },
      };
    }

    if (!input.brandId) {
      return {
        ok: true as const,
        action: input.action,
        data: {
          surface: "brands" as const,
          href: "/app/brands",
          note: "No brandId was supplied, so the brand index was opened.",
        },
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
        ok: false as const,
        action: input.action,
        error: {
          code: "not_found",
          message: "That brand is not available in this organization.",
          suggestedAction:
            "Open the brand index and choose an available brand.",
        },
      };
    }

    return {
      ok: true as const,
      action: input.action,
      data: {
        surface: "brand_map" as const,
        brandName: brand.name,
        href: `/app/brands/${brand.slug}`,
      },
    };
  },
});
