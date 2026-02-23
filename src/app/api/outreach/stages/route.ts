import { NextResponse } from "next/server";
import {
  getStages,
  isOutreachConfigured,
  isOutreachError,
} from "@/server/clients/outreach.client";

/**
 * Outreach stages endpoint.
 *
 * GET /api/outreach/stages
 * GET /api/outreach/stages?pageSize=200&pageNumber=1
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
  const pageNumber = Number.parseInt(
    searchParams.get("pageNumber") ?? "1",
    10,
  );
  const provideAuthorizationMeta =
    searchParams.get("provideAuthorizationMeta") === "true";

  const cappedPageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 100;
  const safePageNumber =
    Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  try {
    const response = await getStages({
      pageSize: cappedPageSize,
      pageNumber: safePageNumber,
      sort: "order",
      provideAuthorizationMeta,
    });

    const stages = response.data.map((stage) => ({
      id: String(stage.id),
      name: stage.attributes.name,
      order: stage.attributes.order,
      color: stage.attributes.color,
      createdAt: stage.attributes.createdAt,
      updatedAt: stage.attributes.updatedAt,
      relationships: stage.relationships ?? null,
      meta: stage.meta ?? null,
    }));

    return NextResponse.json({
      success: true,
      totalStages: response.meta?.count ?? null,
      returnedStages: stages.length,
      filters: {
        pageSize: cappedPageSize,
        pageNumber: safePageNumber,
        provideAuthorizationMeta,
      },
      stages,
    });
  } catch (error) {
    console.error("❌ [Outreach Stages] Error:", error);

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
