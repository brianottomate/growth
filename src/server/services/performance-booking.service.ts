import "server-only";
import { and, eq, isNotNull, isNull, or, inArray, lte } from "drizzle-orm";
import {
  attributionSignals,
  classifyBookingAttribution,
  type SitesOrder,
  type SentMessage,
} from "@/lib/performance-booking";
import { db, type Database } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import {
  performanceAccountTable,
  performanceCycleTable,
} from "@/server/db/performance-schema";
import { performanceBookingTable } from "@/server/db/performance-booking-schema";
import { platformCampaignTable } from "@/server/db/ads-schema";
import {
  messageSendRecipientTable,
  messageSendTable,
} from "@/server/db/email-document-schema";
import { emailRecipientKey } from "@/server/email/recipient-identity";
import { platformPostTable } from "@/server/db/content-schema";

export async function recordPerformanceBooking(
  booking: SitesOrder,
  client: Database = db,
) {
  const accounts = await client
    .select({ id: performanceAccountTable.id })
    .from(brandTable)
    .innerJoin(
      performanceAccountTable,
      and(
        eq(performanceAccountTable.brandId, brandTable.id),
        eq(performanceAccountTable.organizationId, brandTable.organizationId),
        isNull(performanceAccountTable.deletedAt),
      ),
    )
    .where(eq(brandTable.wanderOsWebsiteId, booking.websiteId))
    .limit(2);
  if (!accounts.length) return { status: "not_performance_client" } as const;
  if (accounts.length !== 1) return { status: "ambiguous_client" } as const;
  const evidence = attributionSignals(booking.attribution);
  if (!evidence.length) return { status: "no_relevant_attribution" } as const;
  // Persist the business record before acknowledging. A failed after() leaves a
  // possible booking with classifiedAt=null, which can be classified again.
  await client
    .insert(performanceBookingTable)
    .values({
      ...booking,
      accountId: accounts[0]!.id,
      confidence: "possible",
      evidence,
    })
    .onConflictDoNothing({ target: performanceBookingTable.bookingId });
  // Never reassign an existing booking on replay or a changed website mapping.
  const [stored] = await client
    .select({
      accountId: performanceBookingTable.accountId,
      websiteId: performanceBookingTable.websiteId,
    })
    .from(performanceBookingTable)
    .where(eq(performanceBookingTable.bookingId, booking.bookingId));
  if (
    stored?.accountId !== accounts[0]!.id ||
    stored.websiteId !== booking.websiteId
  )
    return { status: "booking_owner_conflict" } as const;
  return { status: "accepted", bookingId: booking.bookingId } as const;
}

export async function classifyPerformanceBooking(
  bookingId: string,
  client: Database = db,
) {
  const [row] = await client
    .select({
      booking: performanceBookingTable,
      brandId: performanceAccountTable.brandId,
    })
    .from(performanceBookingTable)
    .innerJoin(
      performanceAccountTable,
      eq(performanceAccountTable.id, performanceBookingTable.accountId),
    )
    .where(
      and(
        eq(performanceBookingTable.bookingId, bookingId),
        isNull(performanceAccountTable.deletedAt),
      ),
    );
  if (!row?.brandId) return;
  const { booking, brandId } = row;
  const sendIds = [
    ...new Set(
      Object.values(booking.attribution).flatMap((props) =>
        [props.utm_id, props.message_send_id].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  ];
  // A discovered campaign on a connected ad account isn't enough. It must
  // belong to our campaign plan or this client's Performance delivery cycle.
  const [campaigns, messages] = await Promise.all([
    client
      .select({
        id: platformCampaignTable.id,
        externalId: platformCampaignTable.externalId,
        name: platformCampaignTable.name,
      })
      .from(platformCampaignTable)
      .leftJoin(
        performanceCycleTable,
        eq(performanceCycleTable.id, platformCampaignTable.performanceCycleId),
      )
      .where(
        and(
          eq(platformCampaignTable.platform, "facebook"),
          or(
            and(
              eq(platformCampaignTable.brandId, brandId),
              isNotNull(platformCampaignTable.campaignId),
            ),
            eq(performanceCycleTable.accountId, booking.accountId),
          ),
        ),
      ),
    sendIds.length
      ? client
          .select({
            id: messageSendTable.id,
            providerBroadcastId: messageSendTable.providerBroadcastId,
            recipientId: messageSendRecipientTable.id,
            email: messageSendRecipientTable.email,
            sentAt: messageSendRecipientTable.sentAt,
          })
          .from(messageSendTable)
          .innerJoin(
            platformPostTable,
            eq(platformPostTable.id, messageSendTable.platformPostId),
          )
          .innerJoin(
            messageSendRecipientTable,
            eq(messageSendRecipientTable.messageSendId, messageSendTable.id),
          )
          .where(
            and(
              eq(platformPostTable.brandId, brandId),
              inArray(messageSendTable.id, sendIds),
              eq(messageSendRecipientTable.status, "sent"),
              isNotNull(messageSendRecipientTable.sentAt),
              lte(messageSendRecipientTable.sentAt, booking.confirmedAt),
            ),
          )
      : Promise.resolve([]),
  ]);
  const sends = new Map<string, SentMessage>();
  for (const message of messages) {
    if (!message.sentAt) continue;
    const send = sends.get(message.id) ?? {
      id: message.id,
      providerBroadcastId: message.providerBroadcastId,
      sentAt: message.sentAt,
      recipients: [],
    };
    if (message.sentAt < send.sentAt) send.sentAt = message.sentAt;
    send.recipients!.push({
      id: message.recipientId,
      key: emailRecipientKey(brandId, message.email),
      sentAt: message.sentAt,
    });
    sends.set(send.id, send);
  }
  const result = classifyBookingAttribution(
    booking.attribution,
    campaigns,
    [...sends.values()],
    booking.confirmedAt,
  );
  await client
    .update(performanceBookingTable)
    .set({ ...result, classifiedAt: new Date() })
    .where(
      and(
        eq(performanceBookingTable.bookingId, bookingId),
        eq(performanceBookingTable.accountId, booking.accountId),
        // Replays cannot weaken a confirmed attribution after campaign records change.
        result.confidence === "confirmed"
          ? undefined
          : eq(performanceBookingTable.confidence, "possible"),
      ),
    );
}
