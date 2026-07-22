import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { contentPostTable, seriesTable } from "@/server/db/schema";
import { getSafeInternalPath } from "@/lib/auth-utils";

/**
 * Resolve the page the operator is looking at into a prompt section, so "this
 * series" / "this page" refers to what is actually on their screen. Entity
 * routes are verified against the caller's organization before anything is
 * named; unknown or foreign paths degrade to the bare location line, which is
 * still enough for orientation and navigation questions.
 */
export async function composePageContextSection(options: {
  pagePath: string | undefined;
  organizationId: string;
}): Promise<string> {
  const path = getSafeInternalPath(options.pagePath ?? null);
  if (!path?.startsWith("/app")) return "";

  const pathname = path.split(/[?#]/)[0]!;
  const header = `# Operator location\nThe operator currently has ${path} open in the growth workspace. When they say "this page", "this one", "here", or point at something without naming it, they mean what is on this surface.`;

  const seriesId = /^\/app\/series\/([^/]+)$/.exec(pathname)?.[1];
  if (seriesId) {
    const series = await db.query.seriesTable.findFirst({
      where: and(eq(seriesTable.id, seriesId), isNull(seriesTable.deletedAt)),
      with: {
        brand: { columns: { id: true, name: true, organizationId: true } },
      },
    });
    if (series?.brand.organizationId !== options.organizationId) return header;
    return `${header}\nThis is the series page for “${series.name}” (seriesId: ${series.id}, status: ${series.status}) for ${series.brand.name} (brandId: ${series.brand.id}). Read the surrounding structure with contentStrategyRead action get before making claims about it; edit the series itself with contentStrategyWrite action saveSeries.`;
  }

  const contentPostId = /^\/app\/content\/([^/]+)$/.exec(pathname)?.[1];
  if (contentPostId) {
    const post = await db.query.contentPostTable.findFirst({
      where: and(
        eq(contentPostTable.id, contentPostId),
        isNull(contentPostTable.deletedAt),
      ),
      with: {
        brand: { columns: { id: true, name: true, organizationId: true } },
      },
    });
    if (post?.brand?.organizationId !== options.organizationId) return header;
    return `${header}\nThis is the content idea “${post.title ?? "Untitled"}” (contentPostId: ${post.id}) for ${post.brand.name} (brandId: ${post.brand.id}). Call contentRead action getWorkItem before making claims about its readiness or copy.`;
  }

  return header;
}
