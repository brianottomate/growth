import "server-only";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  attributionSignals,
  classifyBookingAttribution,
  type SitesOrder,
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
    client
      .select({
        id: messageSendTable.id,
        providerBroadcastId: messageSendTable.providerBroadcastId,
        // The first accepted page can convert while later pages are still sending.
        sentAt: sql<Date>`min(${messageSendRecipientTable.sentAt})`.mapWith(
          messageSendRecipientTable.sentAt,
        ),
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
          eq(messageSendRecipientTable.status, "sent"),
          isNotNull(messageSendRecipientTable.sentAt),
        ),
      )
      .groupBy(messageSendTable.id, messageSendTable.providerBroadcastId),
  ]);
  const result = classifyBookingAttribution(
    booking.attribution,
    campaigns,
    messages.flatMap((m) => (m.sentAt ? [{ ...m, sentAt: m.sentAt }] : [])),
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
