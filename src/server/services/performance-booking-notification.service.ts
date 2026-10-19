import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { performanceAccountTable } from "@/server/db/performance-schema";
import { performanceBookingTable } from "@/server/db/performance-booking-schema";
import { workflowRunTable } from "@/server/db/creative-work-schema";
import { escapeSlackMrkdwn, postOnSlack } from "@/server/clients/slack.client";
import { GROWTH_CLIENT_URL } from "@/lib/performance-client-links";
import {
  claimWorkflowRun,
  failWorkflowRun,
  updateWorkflowRun,
} from "./workflow-run.service";

const TYPE = "performance-booking-notification";
const text = (value: string) =>
  escapeSlackMrkdwn(value).replace(/@/g, "@\u200b");

async function loadBooking(bookingId: string, client: Database) {
  const [row] = await client
    .select({
      booking: performanceBookingTable,
      brandId: brandTable.id,
      brandName: brandTable.name,
      brandSlug: brandTable.slug,
      organizationId: performanceAccountTable.organizationId,
    })
    .from(performanceBookingTable)
    .innerJoin(
      performanceAccountTable,
      and(
        eq(performanceAccountTable.id, performanceBookingTable.accountId),
        isNull(performanceAccountTable.deletedAt),
      ),
    )
    .innerJoin(
      brandTable,
      and(
        eq(brandTable.id, performanceAccountTable.brandId),
        eq(brandTable.organizationId, performanceAccountTable.organizationId),
      ),
    )
    .where(eq(performanceBookingTable.bookingId, bookingId));
  return row;
}

/** Booking + confidence owns one alert, including after a workflow finishes. */
export async function queuePerformanceBookingNotification(
  bookingId: string,
  client: Database = db,
) {
  const row = await loadBooking(bookingId, client);
  if (!row) return;
  const id = `wrun_booking_${createHash("sha256")
    .update(JSON.stringify([bookingId, row.booking.confidence]))
    .digest("hex")}`;
  const [run] = await client
    .insert(workflowRunTable)
    .values({
      id,
      organizationId: row.organizationId,
      brandId: row.brandId,
      workflowType: TYPE,
      lockKey: id,
      input: { bookingId, confidence: row.booking.confidence },
      status: "queued",
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    })
    .onConflictDoNothing({ target: workflowRunTable.id })
    .returning({ id: workflowRunTable.id });
  return run?.id;
}

/** Called in the webhook's after(), once classification has been attempted. */
export async function notifyPerformanceBooking(bookingId: string) {
  const runId = await queuePerformanceBookingNotification(bookingId);
  if (runId) await runPerformanceBookingNotification(runId);
}

export function bookingSlackMessage(
  row: NonNullable<Awaited<ReturnType<typeof loadBooking>>>,
) {
  const { booking } = row;
  const confidence =
    booking.confidence === "confirmed" ? "Confirmed" : "Possible";
  const channels = {
    meta: "Meta",
    google: "Google Ads",
    email: "Email",
    chatgpt: "ChatGPT",
  };
  const scopes = {
    event: "booking",
    current: "current visit",
    last: "previous visit",
    initial: "first visit",
  };
  const kinds = {
    signal: "referral signal",
    campaign_name: "campaign name",
    campaign_id: "matched campaign",
    message_id: "matched email",
    recipient_key: "matched recipient link",
  };
  const signals = [
    ...new Set(
      booking.evidence.map(
        (e) => `${channels[e.channel]}: ${scopes[e.scope]}, ${kinds[e.kind]}`,
      ),
    ),
  ];
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: booking.currency,
  }).format(booking.total);
  const url = `${GROWTH_CLIENT_URL}/app/performance/clients/${encodeURIComponent(row.brandSlug ?? row.brandId)}`;
  return [
    `*Booking received: ${text(row.brandName)}*`,
    `*Performance attribution:* ${confidence}`,
    `*Booking total:* ${text(amount)} · *Booking:* ${text(booking.bookingId)}`,
    ...(booking.checkIn && booking.checkOut
      ? [`*Stay:* ${booking.checkIn} to ${booking.checkOut}`]
      : []),
    `*Signals:* ${text(signals.join("; "))}`,
    ...(booking.evidence.some((e) => e.channel === "chatgpt")
      ? [
          "ChatGPT referral detected; this alone does not establish Performance influence.",
        ]
      : []),
    ...(booking.classifiedAt
      ? []
      : ["Campaign matching is incomplete; attribution remains possible."]),
    `<${url}|View client>`,
  ].join("\n");
}

export async function runPerformanceBookingNotification(runId: string) {
  const run = await claimWorkflowRun(runId, TYPE);
  if (!run) return;
  try {
    if (typeof run.input.bookingId !== "string")
      throw new Error("Missing booking identity");
    const row = await loadBooking(run.input.bookingId, db);
    if (
      !row ||
      row.brandId !== run.brandId ||
      row.organizationId !== run.organizationId
    )
      throw new Error("Booking no longer belongs to this workflow's client");
    // A queued possible alert can be superseded by a confirmed alert before dispatch.
    if (row.booking.confidence !== run.input.confidence) {
      await updateWorkflowRun(run, {
        status: "cancelled",
        progress: { message: "Superseded by updated attribution" },
      });
      return;
    }
    const result = await postOnSlack({
      channel: "C0BSSECHK08", // #team-performance, same as intake and stage handoffs.
      text: bookingSlackMessage(row),
      unfurl_links: false,
      unfurl_media: false,
    });
    if (!result.success) throw new Error(result.error);
    await updateWorkflowRun(run, {
      status: "succeeded",
      progress: {
        channel: result.channel,
        messageTs: result.ts,
        message: "Booking alert sent",
      },
    });
  } catch (error) {
    await failWorkflowRun(run, error);
  }
}
