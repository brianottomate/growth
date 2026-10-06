import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "@/env";
import { db, withTransaction } from "@/server/db";
import {
  lifecycleDeliveryTable as deliveries,
  lifecycleEnrollmentTable as enrollments,
} from "@/server/db/schema";

/** Called only after verifying the failure callback's signature and source URL. */
export async function recordLifecycleQueueFailure(input: {
  deliveryId: string;
  runtimeId: string;
  sourceMessageId: string;
}) {
  if (input.runtimeId !== env.LIFECYCLE_RUNTIME_ID) return;
  const source = await db.query.lifecycleDeliveryTable.findFirst({
    where: eq(deliveries.id, input.deliveryId),
  });
  if (!source) return;
  await withTransaction(async (tx) => {
    // Serialize with the send claim. A failure receipt never authorizes a resend.
    const [run] = await tx
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, source.enrollmentId))
      .for("update");
    if (run?.status !== "active" || run.runtimeId !== input.runtimeId) return;
    const [currentSource] = await tx
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, input.deliveryId));
    if (
      !currentSource ||
      (currentSource.messageId &&
        currentSource.messageId !== input.sourceMessageId)
    )
      return;
    const [delivery] = await tx
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.enrollmentId, run.id),
          inArray(deliveries.status, ["pending", "sending", "needs_review"]),
        ),
      )
      .orderBy(asc(deliveries.position))
      .limit(1);
    if (!delivery || delivery.status === "needs_review") return;
    // A completed step's callback can report that scheduling its successor failed.
    // Ignore it if that successor has since been successfully scheduled.
    if (
      delivery.id !== input.deliveryId &&
      delivery.messageId &&
      delivery.nextDispatchAt &&
      delivery.nextDispatchAt.getTime() > Date.now()
    )
      return;
    if (delivery.firstAttemptAt) {
      const reason =
        "QStash retries exhausted after a send attempt. Inspect Postmark; automatic resend is disabled.";
      await tx
        .update(deliveries)
        .set({ status: "needs_review", lastError: reason })
        .where(eq(deliveries.id, delivery.id));
      await tx
        .update(enrollments)
        .set({ status: "needs_review", reason })
        .where(eq(enrollments.id, run.id));
    } else {
      await tx
        .update(deliveries)
        .set({
          nextDispatchAt: null,
          lastError:
            "QStash retries exhausted before sending. Check the dead-letter queue, then use Recover queued work.",
        })
        .where(eq(deliveries.id, delivery.id));
    }
  });
}
