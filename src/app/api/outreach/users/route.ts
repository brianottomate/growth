import { NextResponse } from "next/server";
import {
  getUsers,
  isOutreachConfigured,
  isOutreachError,
} from "@/server/clients/outreach.client";

/**
 * Outreach users endpoint.
 *
 * GET /api/outreach/users
 * GET /api/outreach/users?activeOnly=true
 * GET /api/outreach/users?emailDomain=wander.com
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
  const activeOnly = searchParams.get("activeOnly") === "true";
  const emailDomain = searchParams.get("emailDomain")?.toLowerCase() ?? null;
  const pageSize = Number.parseInt(searchParams.get("pageSize") ?? "100", 10);
  const cappedPageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 100;

  try {
    const response = await getUsers({ pageSize: cappedPageSize });

    let users = response.data.map((user) => ({
      outreachUserId: String(user.id),
      name: user.attributes.name,
      firstName: user.attributes.firstName,
      lastName: user.attributes.lastName,
      email: user.attributes.email,
      title: user.attributes.title,
      locked: user.attributes.locked,
      active: !user.attributes.locked,
      username: user.attributes.username,
      lastSignInAt: user.attributes.lastSignInAt,
      currentSignInAt: user.attributes.currentSignInAt,
    }));

    if (activeOnly) {
      users = users.filter((u) => u.active);
    }

    if (emailDomain) {
      users = users.filter((u) =>
        u.email.toLowerCase().endsWith(`@${emailDomain}`),
      );
    }

    return NextResponse.json({
      success: true,
      totalUsers: response.meta?.count ?? response.data.length,
      returnedUsers: users.length,
      filters: { activeOnly, emailDomain, pageSize: cappedPageSize },
      users,
      nextStepHints: {
        suggestedBdrCandidates: users
          .filter((u) => u.active)
          .map((u) => ({
            name: u.name,
            email: u.email,
            outreachUserId: u.outreachUserId,
          })),
        note:
          "Use this output to decide whether to keep static BDR_ROSTER or fetch users dynamically during assignment.",
      },
    });
  } catch (error) {
    console.error("❌ [Outreach Users] Error:", error);

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
