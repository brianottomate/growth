import { NextResponse, type NextRequest } from "next/server";
import {
  getCustomerByEmail,
  getCustomerActivities,
  trackEvent,
  isCustomerIOError,
} from "@/server/clients/customerio.client";

/**
 * Customer.io diagnostic endpoint.
 *
 * GET /api/test/cio
 * GET /api/test/cio?email=user@example.com
 * GET /api/test/cio?email=user@example.com&trackTestEvent=true
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const trackTestEvent = searchParams.get("trackTestEvent") === "true";
  const activitiesLimit = Number.parseInt(
    searchParams.get("activitiesLimit") ?? "5",
    10,
  );
  const limit =
    Number.isFinite(activitiesLimit) && activitiesLimit > 0
      ? Math.min(activitiesLimit, 20)
      : 5;

  try {
    if (!email) {
      return NextResponse.json({
        success: true,
        message: "Customer.io configuration detected",
        usage: {
          lookup: "/api/test/cio?email=user@example.com",
          withActivities:
            "/api/test/cio?email=user@example.com&activitiesLimit=10",
          withTrackEvent:
            "/api/test/cio?email=user@example.com&trackTestEvent=true",
        },
      });
    }

    const customer = await getCustomerByEmail(email);

    if (!customer) {
      return NextResponse.json({
        success: true,
        email,
        found: false,
        message: "No Customer.io profile found for this email",
      });
    }

    const activities = await getCustomerActivities(customer.id, limit);

    if (trackTestEvent) {
      await trackEvent(customer.id, "ts_test_event_from_playground", {
        source: "api/cio/test",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      email,
      found: true,
      customer: {
        id: customer.id,
        email: customer.email,
        assignedBdrEmail: customer.assignedBdrEmail,
        assignedBdrName: customer.assignedBdrName,
        assignedBdrOutreachId: customer.assignedBdrOutreachId,
        attributeCount: Object.keys(customer.attributes).length,
        sampleAttributes: Object.fromEntries(
          Object.entries(customer.attributes).slice(0, 15),
        ),
      },
      activities: {
        count: activities.length,
        items: activities.map((activity) => ({
          type: activity.type,
          name: activity.name ?? null,
          timestamp: activity.timestamp,
        })),
      },
      trackEvent: trackTestEvent
        ? {
            sent: true,
            eventName: "ts_test_event_from_playground",
          }
        : {
            sent: false,
          },
    });
  } catch (error) {
    console.error("❌ [CIO Test] Error:", error);

    if (isCustomerIOError(error)) {
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
