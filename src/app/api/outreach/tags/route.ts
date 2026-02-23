import { NextResponse } from "next/server";
import {
  getProspectTags,
  isOutreachConfigured,
  isOutreachError,
} from "@/server/clients/outreach.client";

/**
 * Outreach prospect tags endpoint.
 *
 * GET /api/outreach/tags
 * GET /api/outreach/tags?pageSize=100&maxPages=50&minCount=1
 */
export async function GET(request: Request) {
  if (!isOutreachConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "Outreach is not configured",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const pageSize = Number.parseInt(searchParams.get("pageSize") ?? "100", 10);
  const maxPages = Number.parseInt(searchParams.get("maxPages") ?? "50", 10);
  const minCount = Number.parseInt(searchParams.get("minCount") ?? "1", 10);

  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 100;
  const safeMaxPages =
    Number.isFinite(maxPages) && maxPages > 0 ? Math.min(maxPages, 200) : 50;
  const safeMinCount = Number.isFinite(minCount) && minCount > 0 ? minCount : 1;

  try {
    const result = await getProspectTags({
      pageSize: safePageSize,
      maxPages: safeMaxPages,
    });

    const tags = result.tags.filter((tag) => tag.count >= safeMinCount);

    return NextResponse.json({
      success: true,
      totalUniqueTags: result.tags.length,
      returnedTags: tags.length,
      tags,
      scan: {
        complete: result.complete,
        pagesFetched: result.pagesFetched,
        fetchedProspects: result.fetchedProspects,
        totalProspects: result.totalProspects,
      },
      filters: {
        minCount: safeMinCount,
        pageSize: safePageSize,
        maxPages: safeMaxPages,
      },
    });
  } catch (error) {
    console.error("❌ [Outreach Tags] Error:", error);

    if (isOutreachError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          statusCode: error.statusCode ?? null,
          retryAfter: error.retryAfter ?? null,
        },
        { status: error.statusCode ?? 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
