import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import {
  getStoredRecs,
} from "@/server/pipelines/cio-property-recs/cio-property-recs.pipeline";

/**
 * GET /api/pipelines/cio-property-recs/recs/{userId}
 *
 * Returns pre-computed personalized property recommendations for a user.
 * Used by the wander.com homepage "For You" carousel.
 * Requires Authorization: Bearer <ADMIN_TOKEN>.
 *
 * Query params:
 *   limit — max properties to return (default 6, max 20)
 *
 * Response:
 *   { user_id, properties: [{ slug, score, property_name, city, state, ... }], generated_at }
 *
 * Returns 404 if user has no recommendations.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const token =
    _request.headers.get("authorization")?.replace("Bearer ", "") ??
    _request.nextUrl.searchParams.get("token");

  if (token !== env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const limit = Math.min(
    parseInt(
      new URL(_request.url).searchParams.get("limit") ?? "6",
      10,
    ),
    20,
  );

  const recs = getStoredRecs(userId);

  if (!recs) {
    return NextResponse.json(
      { error: "User not found in recommendations" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    user_id: userId,
    properties: recs.properties.slice(0, limit),
    is_cold_start: recs.is_cold_start,
    generated_at: recs.generated_at,
  });
}
