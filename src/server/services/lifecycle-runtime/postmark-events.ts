import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  lifecycleDeliveryTable as deliveries,
  lifecycleEnrollmentTable as enrollments,
  lifecycleRecipientTable as recipients,
  lifecycleRevisionTable as revisions,
} from "@/server/db/schema";

/** Called only after the shared Postmark endpoint authenticates the request. */
export async function recordLifecyclePostmarkEvent(
  event: Record<string, unknown>,
  serverId: number | null,
) {
  if (!serverId || typeof event.MessageStream !== "string") return;
  const address =
    typeof event.Recipient === "string"
      ? event.Recipient
      : typeof event.Email === "string"
        ? event.Email
        : null;
  if (!address) return;
  const email = address.toLowerCase();
  const suppress =
    event.RecordType === "SpamComplaint" ||
    (event.RecordType === "Bounce" &&
      (event.Inactive === true || event.Type === "HardBounce")) ||
    (event.RecordType === "SubscriptionChange" &&
      event.SuppressSending === true);
  // SubscriptionChange has no message metadata. Match the authenticated server,
  // stream, brand and email instead; never clear local suppression on reactivation.
  if (suppress) {
    const brands = await db
      .select({ id: brandTable.id })
      .from(brandTable)
      .where(
        and(
          sql`${brandTable.emailDelivery}->>'provider' = 'postmark'`,
          sql`${brandTable.emailDelivery}->>'serverId' = ${String(serverId)}`,
          sql`${brandTable.emailDelivery}->>'messageStream' = ${event.MessageStream}`,
        ),
      );
    for (const brand of brands)
      await db
        .update(recipients)
        .set({
          suppressedAt: new Date(),
          suppressionReason: `Postmark ${String(event.RecordType)}`,
        })
        .where(
          and(
            eq(recipients.brandId, brand.id),
            eq(recipients.email, email),
            isNull(recipients.suppressedAt),
          ),
        );
  }
  const metadata = event.Metadata;
  const deliveryId =
    metadata &&
    typeof metadata === "object" &&
    ("lifecycle_delivery" in metadata || "lifecycle_delivery_id" in metadata)
      ? "lifecycle_delivery" in metadata
        ? metadata.lifecycle_delivery
        : metadata.lifecycle_delivery_id
      : null;
  if (
    typeof deliveryId !== "string" ||
    typeof event.MessageID !== "string" ||
    !["Delivery", "Bounce", "SpamComplaint"].includes(String(event.RecordType))
  )
    return;
  const [record] = await db
    .select({
      delivery: deliveries,
      recipient: recipients,
      snapshot: revisions.snapshot,
    })
    .from(deliveries)
    .innerJoin(enrollments, eq(enrollments.id, deliveries.enrollmentId))
    .innerJoin(recipients, eq(recipients.id, enrollments.recipientId))
    .innerJoin(revisions, eq(revisions.id, enrollments.revisionId))
    .where(eq(deliveries.id, deliveryId))
    .limit(1);
  if (
    !record ||
    record.recipient.email !== email ||
    record.snapshot.delivery?.serverId !== serverId ||
    record.snapshot.delivery.messageStream !== event.MessageStream
  )
    return;
  if (
    record.delivery.providerEmailId &&
    record.delivery.providerEmailId !== event.MessageID
  )
    throw new Error("Postmark lifecycle receipt mismatch");
  await db
    .update(deliveries)
    .set({
      providerEmailId: event.MessageID,
      providerStatus: String(event.RecordType),
    })
    .where(
      and(
        eq(deliveries.id, deliveryId),
        ...(event.RecordType === "Delivery"
          ? [isNull(deliveries.providerStatus)]
          : []),
      ),
    );
  if (suppress)
    await db
      .update(recipients)
      .set({
        suppressedAt: new Date(),
        suppressionReason: `Postmark ${String(event.RecordType)}`,
      })
      .where(
        and(
          eq(recipients.id, record.recipient.id),
          isNull(recipients.suppressedAt),
        ),
      );
}
