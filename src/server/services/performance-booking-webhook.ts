import "server-only";
import { parseSitesOrder, type SitesOrder } from "@/lib/performance-booking";
import {
  extractBearerToken,
  safeTokenEquals,
} from "@/server/utils/webhook-auth";
import type { recordPerformanceBooking } from "./performance-booking.service";

export async function receiveSitesOrder(
  request: Request,
  options: {
    token: string;
    enabled: boolean;
    record: (
      booking: SitesOrder,
    ) => ReturnType<typeof recordPerformanceBooking>;
    classify: (bookingId: string) => Promise<void>;
    notify: (bookingId: string) => Promise<void>;
    after: (work: () => Promise<void>) => void;
  },
) {
  if (
    !safeTokenEquals(
      extractBearerToken(request.headers.get("authorization")),
      options.token,
    )
  )
    return Response.json({ status: "unauthorized" }, { status: 401 });
  if (!options.enabled)
    return Response.json({ status: "disabled" }, { status: 503 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ status: "invalid_json" }, { status: 400 });
  }
  // Log the incoming booking shape without copying guest profiles or request credentials.
  const payload =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const properties =
    payload.event_properties && typeof payload.event_properties === "object"
      ? (payload.event_properties as Record<string, unknown>)
      : {};
  console.info("[Performance booking] Received Amplitude event", {
    fields: Object.keys(payload),
    data_type: payload.data_type,
    app: payload.app,
    event_type: payload.event_type,
    event_time: payload.event_time,
    propertyKeys: Object.keys(properties),
    event_properties: Object.fromEntries(
      [
        "event_source",
        "environment",
        "website_id",
        "order_id",
        "product_id",
        "currency",
        "total",
        "revenue",
        "checkin_date",
        "checkout_date",
      ].map((key) => [key, properties[key]]),
    ),
  });
  const parsed = parseSitesOrder(raw);
  if (parsed.status !== "valid") {
    console.warn("[Performance booking] Event not ingested", parsed);
    return Response.json(parsed, {
      status: parsed.status === "ignored_event" ? 200 : 422,
    });
  }
  try {
    const result = await options.record(parsed.booking);
    console.info("[Performance booking] Ingest result", {
      bookingId: parsed.booking.bookingId,
      ...result,
    });
    if (result.status === "booking_owner_conflict")
      return Response.json(result, { status: 409 });
    if (result.status === "accepted")
      options.after(async () => {
        try {
          await options.classify(result.bookingId);
        } catch {
          console.error("[Performance booking] Attribution incomplete", {
            bookingId: result.bookingId,
          });
        }
        try {
          await options.notify(result.bookingId);
        } catch {
          console.error("[Performance booking] Slack notification incomplete", {
            bookingId: result.bookingId,
          });
        }
      });
    if (result.status === "ambiguous_client")
      console.warn("[Performance booking] Ambiguous website ownership");
    return Response.json(result);
  } catch (error) {
    console.error("[Performance booking] Persistence failed", {
      bookingId: parsed.booking.bookingId,
      error,
    });
    return Response.json({ status: "storage_unavailable" }, { status: 503 });
  }
}
