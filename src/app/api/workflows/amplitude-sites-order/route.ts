import { after } from "next/server";
import { env } from "@/env";
import { receiveSitesOrder } from "@/server/services/performance-booking-webhook";
import {
  classifyPerformanceBooking,
  recordPerformanceBooking,
} from "@/server/services/performance-booking.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return receiveSitesOrder(request, {
    token: env.CUSTOMERIO_WEBHOOK_BEARER_TOKEN,
    enabled: env.AMPLITUDE_INGEST_ENABLED === "true",
    record: recordPerformanceBooking,
    classify: classifyPerformanceBooking,
    after,
  });
}
