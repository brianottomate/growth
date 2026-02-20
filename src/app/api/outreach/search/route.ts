import { type NextRequest, NextResponse } from "next/server";
import {
  isOutreachConfigured,
  getProspects,
  isOutreachError,
} from "@/server/clients/outreach.client";

/**
 * Search for prospects in Outreach
 *
 * GET /api/outreach/search?email=example@email.com
 */
export async function GET(request: NextRequest) {
  if (!isOutreachConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "Outreach is not configured",
      },
      { status: 500 }
    );
  }

  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing email parameter",
        usage: "GET /api/outreach/search?email=example@email.com",
      },
      { status: 400 }
    );
  }

  try {
    console.log(`🔍 [Outreach Search] Searching for email: ${email}`);

    // Use Outreach API's built-in email filter
    const prospectsResponse = await getProspects({
      pageSize: 25,
      filters: {
        emails: email, // Outreach API supports filtering by email
      },
    });

    const matchingProspects = prospectsResponse.data;

    if (matchingProspects.length === 0) {
      console.log(`❌ [Outreach Search] No prospects found with email: ${email}`);
      return NextResponse.json({
        success: false,
        message: `No prospects found with email: ${email}`,
        searched: email,
      });
    }

    console.log(
      `✅ [Outreach Search] Found ${matchingProspects.length} prospect(s) with email: ${email}`
    );

    // Format results
    const results = matchingProspects.map((prospect) => ({
      id: prospect.id,
      name: prospect.attributes.name,
      firstName: prospect.attributes.firstName,
      lastName: prospect.attributes.lastName,
      emails: prospect.attributes.emails,
      title: prospect.attributes.title,
      company: prospect.attributes.company,
      createdAt: prospect.attributes.createdAt,
      updatedAt: prospect.attributes.updatedAt,
      fullData: prospect, // Include full prospect data for debugging
    }));

    // Log to server console
    console.log("📋 [Outreach Search] Results:");
    results.forEach((p, i) => {
      console.log(
        `  ${i + 1}. ${p.name} (${p.emails.join(", ")}) - ${p.title || "No title"} @ ${p.company || "No company"}`
      );
      console.log(`     Created: ${p.createdAt}, Updated: ${p.updatedAt}`);
    });

    return NextResponse.json({
      success: true,
      message: `Found ${matchingProspects.length} prospect(s)`,
      searched: email,
      results,
    });
  } catch (error) {
    console.error("❌ [Outreach Search] Error:", error);

    if (isOutreachError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Outreach API error",
          message: error.message,
        },
        { status: error.statusCode ?? 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Search failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
